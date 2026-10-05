// Answer composer for the ACE Knowledge Atlas.
// POST { question, atoms: [{ n, id, title, text, source, url }] } -> text/plain stream with [n] citations.
// GET -> { model } so the UI can show which composer is live.
// Configure with GEMINI_API_KEY (preferred; ACE runs on Gemini) or ANTHROPIC_API_KEY.
// With neither set the route returns 501 and the browser composes from the atoms locally.

export const config = { runtime: 'edge' };

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM = `You compose answers for the ACE Knowledge Atlas, which holds atomized content from UnitedHealthcare's public website (uhc.com).
Answer the visitor's question using ONLY the numbered atoms you are given.

Rules:
- Use only facts stated in the atoms. Never add plan details, prices, dates, eligibility rules or claims that are not in the atoms.
- Cite every sentence and bullet with the atom number(s) in square brackets, for example [2] or [1, 3].
- Open with a direct one or two sentence answer, then up to four short bullets (lines starting with "- ") with supporting specifics.
- Keep it between 60 and 170 words. Plain, warm, neutral voice. No marketing superlatives, no exclamation points, no emoji, no headings.
- If the atoms do not answer the question, say so in one sentence (for example "The knowledge base doesn't cover X directly.") and then share what the closest atoms do say, cited.
- This is general information, not advice about a specific person's coverage. If the question is about someone's own plan, suggest checking their plan documents or contacting UnitedHealthcare.`;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

function activeModel() {
  if (process.env.GEMINI_API_KEY) return { provider: 'gemini', model: GEMINI_MODEL };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', model: ANTHROPIC_MODEL };
  return null;
}

function buildPrompt(question, atoms) {
  const lines = atoms.map((a) => `[${a.n}] ${a.title}\n${a.text}\n(Source: ${a.source})`);
  return `Atoms:\n\n${lines.join('\n\n')}\n\nQuestion: ${question}`;
}

/** Turn an upstream SSE stream into a plain-text stream using `pick` to extract text from each event. */
function sseToText(body, pick) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = '';
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, ctl) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (!data || data === '[DONE]') continue;
          try {
            const t = pick(JSON.parse(data));
            if (t) ctl.enqueue(enc.encode(t));
          } catch {
            /* ignore keep-alives and partial frames */
          }
        }
      },
    }),
  );
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 800, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`gemini ${res.status}`);
  return sseToText(res.body, (j) => (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join(''));
}

async function callAnthropic(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      temperature: 0.25,
      system: SYSTEM,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`anthropic ${res.status}`);
  return sseToText(res.body, (j) => (j.type === 'content_block_delta' && j.delta?.type === 'text_delta' ? j.delta.text : ''));
}

export default async function handler(req) {
  const active = activeModel();
  if (req.method === 'GET') return json({ model: active ? active.model : null });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!active) return json({ error: 'no_model_configured' }, 501);

  let body;
  try {
    const raw = await req.text();
    if (raw.length > 24000) return json({ error: 'payload_too_large' }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'bad_json' }, 400);
  }
  const question = String(body.question || '').trim().slice(0, 400);
  const atoms = (Array.isArray(body.atoms) ? body.atoms : []).slice(0, 10).map((a, k) => ({
    n: k + 1,
    title: String(a.title || '').slice(0, 200),
    text: String(a.text || '').slice(0, 1500),
    source: String(a.source || '').slice(0, 200),
  }));
  if (!question || !atoms.length) return json({ error: 'missing_question_or_atoms' }, 400);

  try {
    const prompt = buildPrompt(question, atoms);
    const stream = active.provider === 'gemini' ? await callGemini(prompt) : await callAnthropic(prompt);
    return new Response(stream, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-composer': active.model },
    });
  } catch (e) {
    return json({ error: 'upstream_failed', detail: String(e.message || e) }, 502);
  }
}

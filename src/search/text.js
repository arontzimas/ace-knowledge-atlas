// Tokenizer mirrored from scripts/build_kb.py so query vectors line up with the LSA space.
const STOP_WORDS = `a about above after again against all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves may might must shall get gets got one two us use used using like can't don't it's i'm you're also etc via per within without may`;

export const STOP = new Set(STOP_WORDS.split(/\s+/));

export function tokens(s) {
  const m = String(s || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  return m.filter((t) => t.length > 1 && !STOP.has(t));
}

export function analyze(s) {
  const t = tokens(s);
  const out = t.slice();
  for (let i = 0; i < t.length - 1; i++) out.push(t[i] + '_' + t[i + 1]);
  return out;
}

export function splitSentences(text) {
  return String(text)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

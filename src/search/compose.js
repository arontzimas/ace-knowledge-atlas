import { tokens, splitSentences } from './text.js';

/**
 * Local composer: assembles an answer from the retrieved atoms only (extractive),
 * citing each sentence with [n] where n is the atom's position in the retrieved list.
 * Used when no model key is configured, or when the model route is unreachable.
 */
export function composeLocally(kb, question, retrieved, verdict) {
  const q = tokens(question);
  const { postings } = kb.bm25;
  const idf = (t) => {
    const p = postings.get(t);
    const df = p ? p.length / 2 : 0.5;
    return Math.log(1 + kb.N / df);
  };
  const qStems = q.map((t) => ({ stem: t.slice(0, Math.max(4, Math.min(6, t.length))), w: idf(t) }));

  const cands = [];
  retrieved.forEach((r, k) => {
    const a = kb.atoms[r.i];
    const sents = splitSentences(a.text);
    sents.forEach((s0, j) => {
      const s = s0.replace(/^\d+\)\s*/, '').replace(/^[-•]\s*/, '');
      if (!/^[A-Z0-9"“(]/.test(s)) return;
      const st = tokens(s);
      let hit = 0;
      qStems.forEach(({ stem, w }) => {
        if (st.some((t) => t.startsWith(stem))) hit += w;
      });
      const len = Math.max(6, st.length);
      const score = hit / Math.sqrt(len) + r.score * 1.4 + (j === 0 ? 0.25 : 0) - k * 0.05;
      cands.push({ text: s, cite: k + 1, atom: r.i, j, score, toks: new Set(st), words: s.split(/\s+/).length });
    });
  });
  if (!cands.length) return '';

  const jacc = (a, b) => {
    let inter = 0;
    a.forEach((t) => { if (b.has(t)) inter++; });
    return inter / (a.size + b.size - inter || 1);
  };

  // Lead: the best opening from the top atom (1-2 sentences).
  const first = cands.filter((c) => c.cite === 1);
  const leadPick = [(first.length ? first : cands).slice().sort((a, b) => b.score - a.score)[0]];
  const nextInOrder = cands.find((c) => c.cite === leadPick[0].cite && c.j === leadPick[0].j + 1);
  if (nextInOrder && leadPick[0].words < 28) leadPick.push(nextInOrder);
  const used = [...leadPick];

  // Supporting points from other atoms, diverse and relevant.
  const points = [];
  const perAtom = new Map();
  cands
    .filter((c) => !used.includes(c))
    .sort((a, b) => b.score - a.score)
    .forEach((c) => {
      if (points.length >= 4) return;
      if ((perAtom.get(c.atom) || 0) >= 1 && points.length < 3) return;
      if (used.some((u) => jacc(u.toks, c.toks) > 0.45)) return;
      if (c.words < 7) return;
      points.push(c);
      used.push(c);
      perAtom.set(c.atom, (perAtom.get(c.atom) || 0) + 1);
    });
  points.sort((a, b) => a.cite - b.cite || a.j - b.j);

  const clean = (s) => s.replace(/\s*\[\d+\]$/, '').trim();
  let out = '';
  if (verdict === 'gap') {
    out += 'The knowledge base does not answer this directly — this looks like a knowledge gap. The closest atoms say:\n\n';
  }
  out += leadPick.map((c) => clean(c.text)).join(' ') + ` [${leadPick[0].cite}]`;
  if (points.length) {
    out += '\n\n' + points.map((c) => `- ${clean(c.text)} [${c.cite}]`).join('\n');
  }
  return out;
}

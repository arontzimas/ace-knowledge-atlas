import { tokens, analyze } from './text.js';

const K1 = 1.2;
const B = 0.75;

function bm25Scores(kb, qTokens, expandLast) {
  const { postings, docLen, avgdl, vocabSorted } = kb.bm25;
  const N = kb.N;
  const scores = new Float32Array(N);
  const terms = new Map();
  qTokens.forEach((t) => terms.set(t, (terms.get(t) || 0) + 1));
  // While typing, let the final partial token match vocabulary by prefix.
  if (expandLast && qTokens.length) {
    const last = qTokens[qTokens.length - 1];
    if (last.length >= 3 && !postings.has(last)) {
      let lo = 0, hi = vocabSorted.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (vocabSorted[mid] < last) lo = mid + 1; else hi = mid;
      }
      let n = 0;
      for (let j = lo; j < vocabSorted.length && vocabSorted[j].startsWith(last) && n < 10; j++, n++) {
        terms.set(vocabSorted[j], 0.7);
      }
    }
  }
  terms.forEach((qtf, t) => {
    const p = postings.get(t);
    if (!p) return;
    const df = p.length / 2;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    for (let k = 0; k < p.length; k += 2) {
      const i = p[k];
      const tf = p[k + 1];
      const s = (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * docLen[i]) / avgdl));
      scores[i] += s * Math.min(qtf, 1.5);
    }
  });
  return scores;
}

export function queryVector(kb, text) {
  const { termIndex, termVecs, idf, D } = kb;
  const tf = new Map();
  analyze(text).forEach((t) => {
    if (termIndex.has(t)) tf.set(t, (tf.get(t) || 0) + 1);
  });
  if (!tf.size) return null;
  const v = new Float32Array(D);
  tf.forEach((c, t) => {
    const j = termIndex.get(t);
    const w = (1 + Math.log(c)) * idf[j];
    for (let d = 0; d < D; d++) v[d] += w * termVecs[j * D + d];
  });
  let s = 0;
  for (let d = 0; d < D; d++) s += v[d] * v[d];
  s = Math.sqrt(s);
  if (!s) return null;
  for (let d = 0; d < D; d++) v[d] /= s;
  return v;
}

function lsaScores(kb, qv) {
  const { atomVecs, D, N } = kb;
  const out = new Float32Array(N);
  if (!qv) return out;
  for (let i = 0; i < N; i++) {
    let s = 0;
    const o = i * D;
    for (let d = 0; d < D; d++) s += atomVecs[o + d] * qv[d];
    out[i] = s;
  }
  return out;
}

/** Hybrid lexical + semantic search over atoms. */
export function searchAtoms(kb, query, { live = false, filter = null } = {}) {
  const qt = tokens(query);
  if (!qt.length) return [];
  const bm = bm25Scores(kb, qt, live);
  const qv = queryVector(kb, query);
  const ls = lsaScores(kb, qv);
  let bmMax = 0;
  for (let i = 0; i < kb.N; i++) if (bm[i] > bmMax) bmMax = bm[i];
  const definitional = /^(what\s+(is|are|'s)|whats|define|meaning of)\b/i.test(query.trim());
  const qset = new Set(qt);
  const res = [];
  for (let i = 0; i < kb.N; i++) {
    if (filter && !filter(i)) continue;
    const b = bmMax ? bm[i] / bmMax : 0;
    const l = Math.max(0, ls[i]);
    let score = bmMax ? 0.58 * b + 0.42 * l : 0.85 * l;
    if (score <= 0.05) continue;
    const a = kb.atoms[i];
    const tt = a._tt || (a._tt = tokens(a.title));
    if (tt.length) {
      let hit = 0;
      tt.forEach((t) => { if (qset.has(t)) hit++; });
      score += 0.12 * (hit / tt.length);
    }
    if (definitional && (a.type === 'definition' || a.type === 'faq')) score += 0.06;
    res.push({ i, score, bm: bm[i], lsa: ls[i] });
  }
  res.sort((a, b) => b.score - a.score);
  return res;
}

/** Live highlight set while typing: strong matches only. */
export function liveMatches(kb, query, filter) {
  const res = searchAtoms(kb, query, { live: true, filter });
  if (!res.length) return [];
  const top = res[0].score;
  return res.filter((r, k) => k < 160 && r.score >= Math.max(0.22, top * 0.42));
}

/** Retrieval for answering: relevance with diversity (MMR). */
export function retrieveForAnswer(kb, question, { k = 7, filter = null } = {}) {
  const res = searchAtoms(kb, question, { filter }).slice(0, 40);
  if (!res.length) return { atoms: [], coverage: 0, verdict: 'gap' };
  const { atomVecs, D } = kb;
  const sim = (a, b) => {
    let s = 0;
    for (let d = 0; d < D; d++) s += atomVecs[a * D + d] * atomVecs[b * D + d];
    return s;
  };
  const top = res[0].score;
  const picked = [];
  const pool = res.filter((r) => r.score >= top * 0.38);
  while (picked.length < k && pool.length) {
    let best = -1, bestVal = -Infinity;
    pool.forEach((r, idx) => {
      const red = picked.length ? Math.max(...picked.map((p) => sim(p.i, r.i))) : 0;
      const val = red > 0.93 ? -1 : 0.68 * r.score - 0.32 * red;
      if (val > bestVal) { bestVal = val; best = idx; }
    });
    if (bestVal === -1 && picked.length >= 3) break;
    picked.push(pool.splice(best, 1)[0]);
  }
  // Coverage: how much of the question the knowledge base can actually speak to.
  const lead = res[0];
  const { postings } = kb.bm25;
  const qt = tokens(question);
  const maxIdf = Math.log(1 + kb.N / 0.5);
  const topToks = new Set();
  picked.slice(0, 4).forEach((r) => {
    const a = kb.atoms[r.i];
    tokens([a.title, a.q, a.text, a.tags.join(' ')].join(' ')).forEach((t) => topToks.add(t));
  });
  let wAll = 0, wHit = 0;
  qt.forEach((t) => {
    const p = postings.get(t);
    const w = p ? Math.log(1 + kb.N / (p.length / 2)) : maxIdf * 1.5;
    wAll += w;
    if (topToks.has(t) || Array.from(topToks).some((x) => x.length > 4 && t.length > 4 && x.slice(0, 5) === t.slice(0, 5))) wHit += w;
  });
  const termCov = wAll ? wHit / wAll : 0;
  const coverage = Math.max(0.04, Math.min(0.98, 0.5 * termCov + 0.38 * Math.max(0, lead.lsa) + 0.12 * Math.min(1, lead.bm / 12)));
  const verdict = coverage >= 0.72 && termCov >= 0.75 ? 'strong' : coverage >= 0.5 && termCov >= 0.55 ? 'partial' : 'gap';
  return { atoms: picked, coverage, verdict, termCov };
}

/** Grouped suggestions for the search bar. */
export function suggest(kb, query, filter) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const qt = tokens(q);
  const match = (name) => {
    const n = name.toLowerCase();
    if (n === q) return 3;
    if (n.startsWith(q)) return 2.5;
    if (n.includes(q)) return 2;
    if (qt.length && qt.every((t) => n.includes(t))) return 1.5;
    return 0;
  };
  const topics = kb.ontology.topics
    .map((t) => ({ kind: 'topic', id: t.id, label: t.name, sub: kb.ontology.domains[t.domain].name, n: t.count, s: match(t.name) }))
    .concat(kb.ontology.domains.map((d) => ({ kind: 'domain', id: d.id, label: d.name, sub: 'Domain', n: kb.atoms.filter((a) => a.domain === d.id).length, s: match(d.name) + 0.2 })))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.n - a.n)
    .slice(0, 4);
  const themes = kb.themes
    .map((t) => ({ kind: 'theme', id: t.id, label: t.label, sub: 'Semantic theme', n: t.count, s: Math.max(match(t.label), ...t.tags.map((x) => match(x) * 0.9)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.n - a.n)
    .slice(0, 2);
  const tagsM = kb.tags
    .map((t) => ({ kind: 'tag', id: t.t, label: t.t, sub: 'Tag', n: t.n, s: match(t.t) }))
    .concat(kb.entities.map((e) => ({ kind: 'entity', id: e.e, label: e.e, sub: 'Entity', n: e.n, s: match(e.e) })))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.n - a.n)
    .slice(0, 5);
  const pagesM = kb.pages
    .map((p) => ({ kind: 'page', id: p.id, label: p.title, sub: p.path, n: p.atoms.length, s: match(p.title) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.n - a.n)
    .slice(0, 3);
  const atomsM = searchAtoms(kb, query, { live: true, filter })
    .slice(0, 4)
    .map((r) => ({ kind: 'atom', id: r.i, label: kb.atoms[r.i].title, sub: kb.atoms[r.i].id, n: null }));
  return { topics: topics.concat(themes), tags: tagsM, pages: pagesM, atoms: atomsM };
}

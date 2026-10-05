import { tokens } from './text.js';

function b64ToInt8(b64) {
  const bin = atob(b64);
  const out = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const c = bin.charCodeAt(i);
    out[i] = c > 127 ? c - 256 : c;
  }
  return out;
}

export const VIEWS = [
  { id: 'constellation', label: 'Constellation' },
  { id: 'clusters', label: 'Clusters' },
  { id: 'ontology', label: 'Ontology' },
  { id: 'sources', label: 'Sources' },
  { id: 'quadrant', label: 'Quadrant' },
];

export const FORMAT_LABEL = {
  faq: 'FAQ',
  definition: 'Definition',
  assertion: 'Assertion',
  comparison: 'Comparison',
  steps: 'Step-by-step',
  stat: 'Stat',
};

export async function loadKB(url = '/data/kb.json') {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Knowledge base failed to load (${res.status})`);
  const raw = await res.json();
  return prepareKB(raw);
}

export function prepareKB(raw) {
  const { meta, ontology, themes, tags, entities, pages, atoms, prompts, lsa } = raw;
  const N = atoms.length;
  const D = lsa.dim;

  // ---- LSA vectors
  const tv8 = b64ToInt8(lsa.termVecs);
  const termVecs = new Float32Array(tv8.length);
  for (let i = 0; i < tv8.length; i++) termVecs[i] = tv8[i] * lsa.termScale;
  const av8 = b64ToInt8(lsa.atomVecs);
  const atomVecs = new Float32Array(av8.length);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let d = 0; d < D; d++) {
      const v = av8[i * D + d] * lsa.atomScale;
      atomVecs[i * D + d] = v;
      s += v * v;
    }
    s = Math.sqrt(s) || 1;
    for (let d = 0; d < D; d++) atomVecs[i * D + d] /= s;
  }
  const termIndex = new Map(lsa.terms.map((t, i) => [t, i]));

  // ---- derived atom fields
  const topicDomain = ontology.topics.map((t) => t.domain);
  atoms.forEach((a, i) => {
    a.i = i;
    a.domain = topicDomain[a.topic];
    a.page = pages[a.p];
  });
  pages.forEach((p) => {
    p.image = (p.assets.find((s) => s.kind === 'image') || {}).src || null;
    p.domainIdx = ontology.domains.findIndex((d) => d.name === p.domain);
  });

  // ---- BM25 index
  const postings = new Map();
  const docLen = new Float32Array(N);
  atoms.forEach((a, i) => {
    const doc = [a.title, a.title, a.q, a.text, a.tags.join(' '), a.ents.join(' '), a.qs.join(' '), ontology.topics[a.topic].name, a.page.title].join(' ');
    const toks = tokens(doc);
    docLen[i] = toks.length;
    const tf = new Map();
    toks.forEach((t) => tf.set(t, (tf.get(t) || 0) + 1));
    tf.forEach((c, t) => {
      let arr = postings.get(t);
      if (!arr) postings.set(t, (arr = []));
      arr.push(i, c);
    });
  });
  let avgdl = 0;
  for (let i = 0; i < N; i++) avgdl += docLen[i];
  avgdl /= N;
  const vocabSorted = Array.from(postings.keys()).sort();

  // ---- facet lookups
  const tagAtoms = new Map();
  const entAtoms = new Map();
  atoms.forEach((a, i) => {
    a.tags.forEach((t) => {
      if (!tagAtoms.has(t)) tagAtoms.set(t, []);
      tagAtoms.get(t).push(i);
    });
    a.ents.forEach((e) => {
      const k = e.toLowerCase();
      if (!entAtoms.has(k)) entAtoms.set(k, []);
      entAtoms.get(k).push(i);
    });
  });

  return {
    meta, ontology, themes, tags, entities, pages, atoms, prompts,
    N, D, termVecs, atomVecs, termIndex, idf: lsa.idf,
    bm25: { postings, docLen, avgdl, vocabSorted },
    tagAtoms, entAtoms,
  };
}

export function atomDomainName(kb, a) {
  return kb.ontology.domains[a.domain].name;
}

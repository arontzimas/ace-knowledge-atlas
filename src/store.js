import { create } from 'zustand';
import { liveMatches, retrieveForAnswer } from './search/retrieve.js';
import { composeLocally } from './search/compose.js';
import { QUAD_PRESETS, atomQuadrant } from './scene/quad.js';
import { groupKeys } from './scene/layouts.js';
import { FORMAT_LABEL } from './search/kb.js';

export const EMPTY_FILTERS = { domain: null, type: null, persona: null, stage: null };

export function makePasses(kb, filters) {
  const { domain, type, persona, stage } = filters;
  if (domain == null && type == null && persona == null && stage == null) return () => true;
  return (i) => {
    const a = kb.atoms[i];
    if (domain != null && a.domain !== domain) return false;
    if (type != null && a.type !== type) return false;
    if (persona != null && !a.personas.includes(persona)) return false;
    if (stage != null && a.stage !== stage) return false;
    return true;
  };
}

/** Resolve a focus target to a label and an atom set. */
export function resolveFocus(kb, f, extra = {}) {
  const set = new Map();
  let label = '', sub = '';
  const addAll = (arr) => arr.forEach((i) => set.set(i, 1));
  switch (f.kind) {
    case 'topic': {
      const t = kb.ontology.topics[f.id];
      kb.atoms.forEach((a, i) => { if (a.topic === f.id) set.set(i, 1); });
      label = t.name; sub = 'Topic';
      break;
    }
    case 'domain': {
      kb.atoms.forEach((a, i) => { if (a.domain === f.id) set.set(i, 1); });
      label = kb.ontology.domains[f.id].name; sub = 'Domain';
      break;
    }
    case 'theme': {
      kb.atoms.forEach((a, i) => { if (a.theme === f.id) set.set(i, 1); });
      label = kb.themes[f.id].label; sub = 'Semantic theme';
      break;
    }
    case 'group': {
      const { names, key } = groupKeys(kb, f.by);
      kb.atoms.forEach((a, i) => { if (key(a) === f.id) set.set(i, 1); });
      label = names[f.id]; sub = f.by === 'type' ? 'Format' : f.by[0].toUpperCase() + f.by.slice(1);
      break;
    }
    case 'tag': {
      addAll(kb.tagAtoms.get(f.id) || []);
      label = f.id; sub = 'Tag';
      break;
    }
    case 'entity': {
      addAll(kb.entAtoms.get(String(f.id).toLowerCase()) || []);
      label = f.id; sub = 'Entity';
      break;
    }
    case 'page': {
      const p = kb.pages[f.id];
      addAll(p.atoms);
      label = p.title; sub = 'Source page';
      break;
    }
    case 'format': {
      kb.atoms.forEach((a, i) => { if (a.type === f.id) set.set(i, 1); });
      label = FORMAT_LABEL[f.id]; sub = 'Format';
      break;
    }
    case 'quadrant': {
      const preset = QUAD_PRESETS[extra.quadPreset || 'gap'];
      kb.atoms.forEach((a, i) => { if (atomQuadrant(kb, i, preset, extra.scoreBy || 'atom') === f.id) set.set(i, 1); });
      label = preset.plural[f.id]; sub = 'Quadrant';
      break;
    }
    case 'prompt': {
      const p = kb.prompts[f.id];
      p.atoms.forEach((i, k) => set.set(i, 1 - k * 0.12));
      label = p.q; sub = 'Prompt';
      break;
    }
    case 'atoms': {
      f.ids.forEach((i) => set.set(i, 1));
      label = f.label; sub = f.sub || 'Atoms';
      break;
    }
    default:
      break;
  }
  return { ...f, label, sub, set, count: set.size };
}

let askGen = 0;
let askAbort = null;

export const useStore = create((set, get) => ({
  kb: null,
  error: null,
  view: 'constellation',
  groupBy: 'topic',
  quadPreset: 'gap',
  scoreBy: 'atom',
  panel: null,
  navCollapsed: false,
  filters: EMPTY_FILTERS,
  query: '',
  live: null,
  focus: null,
  hiSource: null,
  selected: -1,
  ask: null,
  intro: true,
  paused: false,
  fitNonce: 0,

  setKB: (kb) => set({ kb }),
  setError: (error) => set({ error }),
  dismissIntro: () => get().intro && set({ intro: false }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  toggleNav: () => set((s) => ({ navCollapsed: !s.navCollapsed })),

  setView: (view) => {
    const s = get();
    if (s.view === view) return;
    set({ view, intro: false });
  },
  setGroupBy: (groupBy) => set({ groupBy, view: 'clusters' }),
  setQuadPreset: (quadPreset) => {
    const s = get();
    const focus = s.focus && s.focus.kind === 'quadrant' ? null : s.focus;
    set({ quadPreset, view: 'quadrant', focus, hiSource: focus ? s.hiSource : s.hiSource === 'focus' ? null : s.hiSource });
  },
  setScoreBy: (scoreBy) => set({ scoreBy }),

  openPanel: (panel) => {
    const s = get();
    if (s.panel === panel) return set({ panel: null });
    const viewFor = { ontology: 'ontology', sources: 'sources', performance: 'quadrant' };
    set({ panel, intro: false, view: viewFor[panel] || s.view });
  },
  closePanel: () => set({ panel: null }),

  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: EMPTY_FILTERS }),

  setQuery: (query) => {
    const { kb, filters } = get();
    if (!kb) return set({ query });
    const q = query.trim();
    if (q.length < 2) return set({ query, live: null, hiSource: get().hiSource === 'live' ? null : get().hiSource });
    const res = liveMatches(kb, q, makePasses(kb, filters));
    const live = new Map(res.map((r) => [r.i, r.score]));
    set({ query, live, hiSource: 'live', intro: false });
  },

  focusOn: (f, { fit = true } = {}) => {
    const { kb, quadPreset, scoreBy } = get();
    if (!kb) return;
    if (f.kind === 'all') return set({ focus: null, hiSource: null, fitNonce: get().fitNonce + 1 });
    const focus = resolveFocus(kb, f, { quadPreset, scoreBy });
    set({ focus, hiSource: 'focus', intro: false, fitNonce: fit ? get().fitNonce + 1 : get().fitNonce });
  },
  clearFocus: () => set((s) => ({ focus: null, hiSource: s.hiSource === 'focus' ? null : s.hiSource })),

  select: (i) => set({ selected: i, intro: false }),
  clearSelection: () => set({ selected: -1 }),

  clearHighlight: () => {
    const s = get();
    if (s.hiSource === 'ask') get().clearAsk();
    else if (s.hiSource === 'focus') set({ focus: null, hiSource: s.ask ? 'ask' : null });
    else if (s.hiSource === 'live') set({ live: null, query: '', hiSource: s.focus ? 'focus' : s.ask ? 'ask' : null });
  },

  clearAsk: () => {
    askGen++;
    askAbort?.abort();
    const s = get();
    set({ ask: null, hiSource: s.hiSource === 'ask' ? (s.focus ? 'focus' : null) : s.hiSource });
  },

  askQuestion: async (question) => {
    const { kb, filters } = get();
    const q = question.trim();
    if (!kb || !q) return;
    const gen = ++askGen;
    askAbort?.abort();
    askAbort = new AbortController();
    const signal = askAbort.signal;
    const r = retrieveForAnswer(kb, q, { filter: makePasses(kb, filters) });
    set({
      ask: { question: q, status: 'retrieving', atoms: r.atoms, coverage: r.coverage, verdict: r.verdict, text: '', composer: null, startedAt: Date.now() },
      hiSource: 'ask', intro: false, live: null, selected: -1, fitNonce: get().fitNonce + 1,
    });
    const patch = (p) => { if (gen === askGen) set((s) => ({ ask: s.ask ? { ...s.ask, ...p } : s.ask })); };
    await new Promise((res) => setTimeout(res, 650));
    if (gen !== askGen) return;
    patch({ status: 'composing' });
    if (!r.atoms.length) {
      patch({ status: 'done', text: 'Nothing in the knowledge base matches this question yet. Try different words, or browse the ontology to see what is covered.', composer: 'local' });
      return;
    }
    const payload = {
      question: q,
      coverage: r.verdict,
      atoms: r.atoms.map((x, k) => {
        const a = kb.atoms[x.i];
        return { n: k + 1, id: a.id, title: a.title, text: a.text, source: a.page.title, url: a.page.url };
      }),
    };
    let usedModel = false;
    try {
      const ctl = new AbortController();
      signal.addEventListener('abort', () => ctl.abort());
      const timer = setTimeout(() => ctl.abort(), 15000);
      const res = await fetch('/api/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctl.signal,
      });
      if (res.ok && res.body && (res.headers.get('content-type') || '').includes('text/plain')) {
        usedModel = true;
        clearTimeout(timer);
        patch({ composer: res.headers.get('x-composer') || 'model' });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let text = '';
        let lastPush = 0;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (gen !== askGen) { reader.cancel(); return; }
          text += dec.decode(value, { stream: true });
          if (Date.now() - lastPush > 40) { patch({ text }); lastPush = Date.now(); }
        }
        if (!text.trim()) throw new Error('empty');
        patch({ text, status: 'done' });
        return;
      }
      clearTimeout(timer);
    } catch (e) {
      if (gen !== askGen) return;
      if (usedModel) {
        // stream broke mid-way: fall through to the local composer
      }
    }
    if (gen !== askGen) return;
    // ---- local composition (no model configured or unreachable)
    const full = composeLocally(kb, q, r.atoms, r.verdict);
    patch({ composer: 'local' });
    const words = full.split(/(\s+)/);
    let out = '';
    for (let k = 0; k < words.length; k += 6) {
      if (gen !== askGen) return;
      out += words.slice(k, k + 6).join('');
      patch({ text: out });
      await new Promise((res) => setTimeout(res, 28));
    }
    patch({ text: full, status: 'done' });
  },
}));

/** The currently active highlight map (latest source wins). */
export function activeHighlight(s) {
  const src = s.hiSource;
  if (src === 'live' && s.live) return { source: 'live', map: s.live };
  if (src === 'focus' && s.focus) return { source: 'focus', map: s.focus.set };
  if (src === 'ask' && s.ask) return { source: 'ask', map: new Map(s.ask.atoms.map((r, k) => [r.i, 1 - k * 0.08])) };
  return null;
}

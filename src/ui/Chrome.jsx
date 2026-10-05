import { useStore, activeHighlight } from '../store.js';
import { I, BrandMark } from './icons.jsx';
import { useMemo, useRef, useState } from 'react';
import { PillSelect, engineRef, useClickOutside, useLayoutMetrics } from './common.jsx';
import { VIEWS, FORMAT_LABEL } from '../search/kb.js';
import { GROUPS } from '../scene/layouts.js';
import { QUAD_PRESETS } from '../scene/quad.js';

const NAV = [
  { sec: 'Knowledge base' },
  { id: null, label: 'Atlas', icon: I.atlas },
  { id: 'ontology', label: 'Ontology', icon: I.tree },
  { id: 'tags', label: 'Tags & entities', icon: I.tag },
  { id: 'sources', label: 'Sources', icon: I.layers },
  { sec: 'Analysis' },
  { id: 'performance', label: 'Performance', icon: I.quad },
  { sec: 'Workspace' },
  { id: 'data', label: 'Data source', icon: I.db },
];

export function SideNav() {
  const kb = useStore((s) => s.kb);
  const panel = useStore((s) => s.panel);
  const collapsed = useStore((s) => s.navCollapsed);
  const paused = useStore((s) => s.paused);
  const { openPanel, closePanel, toggleNav, togglePaused } = useStore.getState();
  const counts = { ontology: kb.ontology.topics.length, tags: kb.tags.length, sources: kb.pages.length, performance: kb.prompts.length };
  return (
    <aside className={`nav glass ${collapsed ? 'collapsed' : ''}`} aria-label="Primary">
      <div className="brand">
        <BrandMark className="brand-mark" />
        <div className="brand-text">
          <b>ACE</b>
          <span>Knowledge Atlas</span>
        </div>
      </div>
      <div className="ws">
        <b><span className="dot red" />{kb.meta.name}</b>
        <span>{kb.meta.source} · {kb.N.toLocaleString()} atoms</span>
      </div>
      <nav>
        {NAV.map((n, k) => {
          if (n.sec) return <div key={k} className="nav-sec eyebrow">{n.sec}</div>;
          const on = panel === n.id;
          const Icon = n.icon;
          return (
            <button key={k} className={`nav-item ${on ? 'on' : ''}`} onClick={() => (n.id ? openPanel(n.id) : closePanel())} aria-current={on ? 'page' : undefined}>
              <Icon />
              <span>{n.label}</span>
              {counts[n.id] != null && <i className="count">{counts[n.id]}</i>}
              <em className="nav-tip">{n.label}</em>
            </button>
          );
        })}
      </nav>
      <div className="nav-foot">
        <button className="nav-item" onClick={() => engineRef.current?.resetCamera()}>
          <I.target /><span className="label">Recenter view</span><em className="nav-tip">Recenter view</em>
        </button>
        <button className="nav-item" onClick={togglePaused}>
          {paused ? <I.play /> : <I.pause />}<span className="label">{paused ? 'Resume motion' : 'Pause motion'}</span><em className="nav-tip">{paused ? 'Resume motion' : 'Pause motion'}</em>
        </button>
        <button className="nav-item" onClick={toggleNav}>
          <I.sidebar /><span className="label">Collapse</span><em className="nav-tip">{collapsed ? 'Expand' : 'Collapse'}</em>
        </button>
      </div>
    </aside>
  );
}

export function TopBar() {
  const kb = useStore((s) => s.kb);
  const view = useStore((s) => s.view);
  const groupBy = useStore((s) => s.groupBy);
  const quadPreset = useStore((s) => s.quadPreset);
  const scoreBy = useStore((s) => s.scoreBy);
  const { setView, setGroupBy, setQuadPreset, setScoreBy } = useStore.getState();
  const m = useLayoutMetrics();
  const free = m.w - m.contentL - m.contentR;
  const compact = !m.mobile && free < 980;
  return (
    <header className={`topbar ${compact ? 'compact' : ''}`}>
      {compact ? (
        <div className="view-pill">
          <PillSelect label="View" value={view} allLabel={null} align="left" options={VIEWS.map((v) => ({ value: v.id, label: v.label }))} onChange={(v) => v && setView(v)} />
        </div>
      ) : (
        <div className="seg glass" role="tablist" aria-label="View">
          {VIEWS.map((v) => (
            <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? 'on' : ''} onClick={() => setView(v.id)}>{v.label}</button>
          ))}
        </div>
      )}
      {view === 'clusters' && (
        <div className="ctx glass">
          {!compact && <span className="eyebrow">Group by</span>}
          <PillSelect label="Group" value={groupBy} allLabel={null} align="left"
            options={Object.entries(GROUPS).map(([k, g]) => ({ value: k, label: g.label }))}
            onChange={(v) => v && setGroupBy(v)} />
        </div>
      )}
      {view === 'quadrant' && (
        <div className="ctx glass">
          {!compact && <span className="eyebrow">Score by</span>}
          {!compact && (
            <div className="seg sm">
              <button className={scoreBy === 'atom' ? 'on' : ''} onClick={() => setScoreBy('atom')}>Top atom</button>
              <button className={scoreBy === 'page' ? 'on' : ''} onClick={() => setScoreBy('page')}>Top page</button>
            </div>
          )}
          <PillSelect label="Analysis" value={quadPreset} allLabel={null} align="left"
            options={Object.values(QUAD_PRESETS).map((p) => ({ value: p.id, label: p.label }))}
            onChange={(v) => v && setQuadPreset(v)} />
        </div>
      )}
      <div className="spacer" />
      <FilterMenu />
    </header>
  );
}

export function HighlightChip() {
  const s = useStore();
  const hi = activeHighlight(s);
  if (!hi) return null;
  let k = '', label = '';
  if (hi.source === 'live') { k = 'Search'; label = `“${s.query.trim()}”`; }
  if (hi.source === 'focus') { k = s.focus.sub; label = s.focus.label; }
  if (hi.source === 'ask') { k = 'Answer'; label = 'atoms pulled for your question'; }
  return (
    <div className="hichip glass" role="status">
      <span className="dot red" />
      <span className="k">{k}</span>
      <b>{label}</b>
      <span className="n">{hi.map.size} atoms</span>
      <button className="iconbtn" onClick={s.clearHighlight} aria-label="Clear highlight"><I.close /></button>
    </div>
  );
}

const CAPTIONS = {
  constellation: 'Atoms placed by meaning · drag to orbit · scroll to zoom · click any atom',
  clusters: 'Atoms grouped into clusters · click a cluster label to light it up',
  ontology: 'Domain → topic → atom · click any node',
  sources: 'Atoms gathered around the pages they came from',
  quadrant: 'Click a quadrant label to isolate it',
};

export function Legend() {
  const view = useStore((s) => s.view);
  const quadPreset = useStore((s) => s.quadPreset);
  return (
    <div className="legend" aria-hidden="true">
      <span><i className="dot" /> Atom</span>
      <span><i className="dot red" /> {view === 'quadrant' ? QUAD_PRESETS[quadPreset].names[QUAD_PRESETS[quadPreset].action] : 'Match'}</span>
      <span><i className="ring" /> Selected</span>
      <span className="cap">{CAPTIONS[view]}</span>
    </div>
  );
}

export function IntroHero() {
  const kb = useStore((s) => s.kb);
  return (
    <div className="intro-hero" aria-hidden={false}>
      <div className="eyebrow"><span className="dot red" /> ACE Knowledge Atlas · {kb.meta.name}</div>
      <h1>Every answer,<br />atomized.<span className="caret" /></h1>
      <p>
        {kb.N.toLocaleString()} atoms from {kb.pages.length} pages of {kb.meta.source}, mapped by meaning. Ask a question, search a theme, or click anywhere to explore.
      </p>
    </div>
  );
}

export function FilterMenu() {
  const kb = useStore((s) => s.kb);
  const filters = useStore((s) => s.filters);
  const { setFilter, clearFilters } = useStore.getState();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const m = kb.meta;
  const counts = useMemo(() => {
    const c = { domain: new Map(), type: new Map(), persona: new Map(), stage: new Map() };
    kb.atoms.forEach((a) => {
      c.domain.set(a.domain, (c.domain.get(a.domain) || 0) + 1);
      c.type.set(a.type, (c.type.get(a.type) || 0) + 1);
      c.stage.set(a.stage, (c.stage.get(a.stage) || 0) + 1);
      a.personas.forEach((p) => c.persona.set(p, (c.persona.get(p) || 0) + 1));
    });
    return c;
  }, [kb]);
  const groups = [
    ['domain', 'Domain', kb.ontology.domains.map((d) => [d.id, d.name])],
    ['persona', 'Persona', m.personas.map((p) => [p, p])],
    ['type', 'Format', m.formats.map((f) => [f, FORMAT_LABEL[f]])],
    ['stage', 'Funnel stage', m.stages.map((x) => [x, x])],
  ];
  const active = Object.values(filters).filter((v) => v != null).length;
  const summary = groups.filter(([k]) => filters[k] != null).map(([k, , opts]) => opts.find((o) => o[0] === filters[k])?.[1]).join(' · ');
  return (
    <div className={`pill-select ${open ? 'open' : ''}`} ref={ref}>
      <button className={active ? 'set' : ''} onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}>
        <I.tag style={{ width: 14, height: 14 }} />
        {active ? <b>{summary}</b> : 'Filters'}
        {active > 0 && <span className="fbadge">{active}</span>}
        <I.chevDown />
      </button>
      {open && (
        <div className="menu fmenu glass-strong scroll" role="dialog" aria-label="Filters">
          {groups.map(([k, label, opts]) => (
            <div key={k} className="fgroup">
              <div className="eyebrow">{label}</div>
              <div className="chips-wrap">
                {opts.map(([v, l]) => (
                  <button key={String(v)} className={`chip ${filters[k] === v ? 'dark' : ''}`} onClick={() => setFilter(k, filters[k] === v ? null : v)}>
                    {l}<span className="fn">{counts[k].get(v) || 0}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="ffoot">
            <span>{active ? `${active} filter${active > 1 ? 's' : ''} applied` : 'Filters dim atoms that do not match'}</span>
            {active > 0 && <button className="chip" onClick={clearFilters}>Clear all</button>}
          </div>
        </div>
      )}
    </div>
  );
}

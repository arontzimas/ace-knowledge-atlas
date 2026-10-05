import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store.js';
import { I } from './icons.jsx';
import { fmtPct } from './common.jsx';
import { FORMAT_LABEL } from '../search/kb.js';
import { QUAD_PRESETS, atomQuadrant, quadrantOf } from '../scene/quad.js';

const isOn = (focus, kind, id) => focus && focus.kind === kind && focus.id === id;

function PanelShell({ eyebrow, title, desc, children, onClose }) {
  return (
    <>
      <div className="panel-head">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        <button className="iconbtn" onClick={onClose} aria-label="Close panel"><I.close /></button>
      </div>
      {children}
    </>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="panel-search">
      <I.search />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {value && <button className="iconbtn" style={{ width: 22, height: 22 }} onClick={() => onChange('')} aria-label="Clear"><I.close /></button>}
    </label>
  );
}

// ------------------------------------------------------------------ ontology
function OntologyPanel({ onClose }) {
  const kb = useStore((s) => s.kb);
  const focus = useStore((s) => s.focus);
  const { focusOn } = useStore.getState();
  const [tab, setTab] = useState('taxonomy');
  const [open, setOpen] = useState(() => new Set([1]));
  const [q, setQ] = useState('');
  const maxT = Math.max(...kb.ontology.topics.map((t) => t.count));
  const domCount = (d) => d.topics.reduce((s, t) => s + kb.ontology.topics[t].count, 0);
  const ql = q.trim().toLowerCase();
  useEffect(() => {
    if (focus?.kind === 'topic') setOpen((o) => new Set(o).add(kb.ontology.topics[focus.id].domain));
    if (focus?.kind === 'domain') setOpen((o) => new Set(o).add(focus.id));
  }, [focus, kb]);
  return (
    <PanelShell eyebrow="Knowledge base" title="Ontology" onClose={onClose}
      desc={`${kb.ontology.domains.length} domains → ${kb.ontology.topics.length} topics → ${kb.N.toLocaleString()} atoms, plus ${kb.themes.length} semantic themes that emerge from the atoms themselves.`}>
      <div className="panel-tabs seg sm glass" style={{ alignSelf: 'flex-start' }}>
        <button className={tab === 'taxonomy' ? 'on' : ''} onClick={() => setTab('taxonomy')}>Taxonomy</button>
        <button className={tab === 'themes' ? 'on' : ''} onClick={() => setTab('themes')}>Semantic themes</button>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder={tab === 'taxonomy' ? 'Filter topics' : 'Filter themes'} />
      <div className="panel-body scroll">
        {tab === 'taxonomy' && kb.ontology.domains.map((d) => {
          const topics = d.topics.map((t) => kb.ontology.topics[t]).filter((t) => !ql || t.name.toLowerCase().includes(ql) || d.name.toLowerCase().includes(ql) || t.tags.some((x) => x.includes(ql)));
          if (ql && !topics.length) return null;
          const expanded = open.has(d.id) || !!ql;
          return (
            <div className="tree-d" key={d.id}>
              <button className={`tree-row domain ${isOn(focus, 'domain', d.id) ? 'on' : ''}`}
                onClick={() => { focusOn({ kind: 'domain', id: d.id }); setOpen((o) => { const n = new Set(o); n.add(d.id); return n; }); }}>
                <I.chevRight className={`tree-caret ${expanded ? 'open' : ''}`} onClick={(e) => { e.stopPropagation(); setOpen((o) => { const n = new Set(o); n.has(d.id) ? n.delete(d.id) : n.add(d.id); return n; }); }} />
                <span className="tree-name">{d.name}</span>
                <span className="n">{domCount(d)}</span>
              </button>
              {expanded && (
                <div className="tree-kids">
                  {topics.map((t) => (
                    <div key={t.id}>
                      <button className={`tree-row ${isOn(focus, 'topic', t.id) ? 'on' : ''}`} onClick={() => focusOn({ kind: 'topic', id: t.id })}>
                        <span className="tree-name">{t.name}</span>
                        <span className="bar-mini"><i style={{ width: `${(t.count / maxT) * 100}%` }} /></span>
                        <span className="n">{t.count}</span>
                      </button>
                      {isOn(focus, 'topic', t.id) && (
                        <div className="tree-tags">
                          {t.tags.map((x) => <button key={x} className="chip" onClick={() => focusOn({ kind: 'tag', id: x })}>{x}</button>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {tab === 'themes' && kb.themes
          .filter((t) => !ql || t.label.includes(ql) || t.tags.some((x) => x.includes(ql)))
          .map((t) => (
            <button key={t.id} className={`list-row ${isOn(focus, 'theme', t.id) ? 'on' : ''}`} onClick={() => focusOn({ kind: 'theme', id: t.id })}>
              <span style={{ minWidth: 0 }}>
                <div className="t">{t.label}</div>
                <div className="s" style={{ fontFamily: 'var(--sans)' }}>{t.tags.slice(0, 4).join(' · ')}</div>
              </span>
              <span className="n">{t.count}</span>
            </button>
          ))}
      </div>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ tags & entities
function TagsPanel({ onClose }) {
  const kb = useStore((s) => s.kb);
  const focus = useStore((s) => s.focus);
  const { focusOn } = useStore.getState();
  const [tab, setTab] = useState('tags');
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const tags = useMemo(() => kb.tags.filter((t) => !ql || t.t.includes(ql)).slice(0, ql ? 240 : 170), [kb, ql]);
  const maxN = Math.max(...kb.tags.map((t) => t.n));
  const facets = [
    ['Format', 'type', kb.meta.formats, (a) => a.type, (v) => FORMAT_LABEL[v]],
    ['Persona', 'persona', kb.meta.personas, (a) => a.personas[0], (v) => v],
    ['Intent', 'intent', kb.meta.intents, (a) => a.intent, (v) => v],
    ['Funnel stage', 'stage', kb.meta.stages, (a) => a.stage, (v) => v],
  ];
  return (
    <PanelShell eyebrow="Knowledge base" title="Tags & entities" onClose={onClose}
      desc={`${kb.tags.length} semantic tags and ${kb.entities.length} named entities attached to atoms at ingestion. Click any one to find its atoms.`}>
      <div className="panel-tabs seg sm glass" style={{ alignSelf: 'flex-start' }}>
        <button className={tab === 'tags' ? 'on' : ''} onClick={() => setTab('tags')}>Tags</button>
        <button className={tab === 'entities' ? 'on' : ''} onClick={() => setTab('entities')}>Entities</button>
        <button className={tab === 'facets' ? 'on' : ''} onClick={() => setTab('facets')}>Facets</button>
      </div>
      {tab !== 'facets' && <SearchBox value={q} onChange={setQ} placeholder={tab === 'tags' ? 'Find a tag' : 'Find an entity'} />}
      <div className="panel-body scroll">
        {tab === 'tags' && (
          <div className="cloud">
            {tags.map((t) => {
              const s = 11.5 + Math.sqrt(t.n / maxN) * 11;
              return (
                <button key={t.t} className={isOn(focus, 'tag', t.t) ? 'on' : ''} style={{ fontSize: s, fontWeight: t.n > maxN * 0.3 ? 600 : 450 }} onClick={() => focusOn({ kind: 'tag', id: t.t })} title={`${t.n} atoms · ${t.topic}`}>
                  {t.t}
                </button>
              );
            })}
            {!tags.length && <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>No tags match.</p>}
          </div>
        )}
        {tab === 'entities' && kb.entities.filter((e) => !ql || e.e.toLowerCase().includes(ql)).slice(0, 200).map((e) => (
          <button key={e.e} className={`list-row ${isOn(focus, 'entity', e.e) ? 'on' : ''}`} onClick={() => focusOn({ kind: 'entity', id: e.e })}>
            <span className="t">{e.e}</span>
            <span className="n">{e.n}</span>
          </button>
        ))}
        {tab === 'facets' && facets.map(([title, by, values, fn, lab]) => {
          const counts = new Map();
          kb.atoms.forEach((a) => counts.set(fn(a), (counts.get(fn(a)) || 0) + 1));
          const max = Math.max(...counts.values());
          return (
            <div key={by}>
              <div className="group-h eyebrow">{title}</div>
              {values.map((v, k) => {
                const kind = by === 'type' ? 'group' : 'group';
                const on = focus && focus.kind === 'group' && focus.by === by && focus.id === k;
                return (
                  <button key={v} className={`tree-row ${on ? 'on' : ''}`} onClick={() => focusOn({ kind, by, id: k })}>
                    <span className="tree-name">{lab(v)}</span>
                    <span className="bar-mini"><i style={{ width: `${((counts.get(v) || 0) / max) * 100}%` }} /></span>
                    <span className="n">{counts.get(v) || 0}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ sources
function SourcesPanel({ onClose }) {
  const kb = useStore((s) => s.kb);
  const focus = useStore((s) => s.focus);
  const { focusOn } = useStore.getState();
  const [tab, setTab] = useState('pages');
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const assets = useMemo(() => {
    const all = [];
    kb.pages.forEach((p) => p.assets.forEach((s) => all.push({ ...s, page: p })));
    return all;
  }, [kb]);
  const kinds = { image: 0, pdf: 0, video: 0 };
  assets.forEach((s) => { kinds[s.kind]++; });
  return (
    <PanelShell eyebrow="Provenance" title="Sources" onClose={onClose}
      desc={`Every atom traces back to one of ${kb.pages.length} pages on ${kb.meta.source}. ${kinds.image} images, ${kinds.pdf} PDFs and ${kinds.video} videos were captured alongside.`}>
      <div className="panel-tabs seg sm glass" style={{ alignSelf: 'flex-start' }}>
        <button className={tab === 'pages' ? 'on' : ''} onClick={() => setTab('pages')}>Pages</button>
        <button className={tab === 'images' ? 'on' : ''} onClick={() => setTab('images')}>Images</button>
        <button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>PDFs & video</button>
      </div>
      {tab === 'pages' && <SearchBox value={q} onChange={setQ} placeholder="Filter pages by title or URL" />}
      <div className="panel-body scroll">
        {tab === 'pages' && kb.ontology.domains.map((d) => {
          const pages = kb.pages.filter((p) => p.domainIdx === d.id && (!ql || p.title.toLowerCase().includes(ql) || p.path.includes(ql)));
          if (!pages.length) return null;
          return (
            <div key={d.id}>
              <div className="group-h eyebrow">{d.name} · {pages.length}</div>
              {pages.map((p) => (
                <button key={p.id} className={`list-row ${isOn(focus, 'page', p.id) ? 'on' : ''}`} onClick={() => focusOn({ kind: 'page', id: p.id })}>
                  {p.image ? <img className="thumb" src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="thumb ph"><I.doc /></span>}
                  <span style={{ minWidth: 0 }}>
                    <div className="t">{p.title}</div>
                    <div className="s">{p.path}</div>
                  </span>
                  <span className="n">{p.atoms.length}</span>
                </button>
              ))}
            </div>
          );
        })}
        {tab === 'images' && (
          <div className="asset-grid">
            {assets.filter((s) => s.kind === 'image').map((s) => (
              <button key={s.src + s.page.id} onClick={() => focusOn({ kind: 'page', id: s.page.id })} title={`${s.alt || 'Image'} — ${s.page.title}`}>
                <img src={s.src} alt={s.alt} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.parentNode.style.display = 'none'; }} />
              </button>
            ))}
          </div>
        )}
        {tab === 'files' && assets.filter((s) => s.kind !== 'image').map((s) => (
          <div key={s.src + s.page.id} className="list-row" style={{ cursor: 'default' }}>
            <span className="thumb ph">{s.kind === 'pdf' ? <I.pdf /> : <I.video />}</span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <div className="t">{s.alt || (s.kind === 'pdf' ? 'PDF document' : 'Video')}</div>
              <button className="s" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }} onClick={() => focusOn({ kind: 'page', id: s.page.id })}>{s.page.path}</button>
            </span>
            <a className="iconbtn" href={s.src} target="_blank" rel="noopener noreferrer" aria-label="Open file"><I.ext /></a>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ performance
function PerformancePanel({ onClose }) {
  const kb = useStore((s) => s.kb);
  const focus = useStore((s) => s.focus);
  const quadPreset = useStore((s) => s.quadPreset);
  const scoreBy = useStore((s) => s.scoreBy);
  const filters = useStore((s) => s.filters);
  const { focusOn, setQuadPreset, select, askQuestion, setScoreBy } = useStore.getState();
  const preset = QUAD_PRESETS[quadPreset];
  const [tab, setTab] = useState('prompts');
  const [sort, setSort] = useState({ k: 'cov', d: -1 });
  const counts = useMemo(() => {
    const c = { tl: [], tr: [], bl: [], br: [] };
    kb.atoms.forEach((a, i) => c[atomQuadrant(kb, i, preset, scoreBy)].push(i));
    return c;
  }, [kb, preset, scoreBy]);
  const qFocus = focus?.kind === 'quadrant' ? focus.id : null;
  const gap = QUAD_PRESETS.gap;
  const prompts = useMemo(() => {
    let list = kb.prompts.map((p, id) => ({ ...p, id, quad: quadrantOf(p.cov, p.cit, gap) }));
    if (filters.persona) list = list.filter((p) => p.persona === filters.persona);
    if (filters.domain != null) list = list.filter((p) => kb.ontology.topics[p.topic].domain === filters.domain);
    if (qFocus && quadPreset === 'gap') list = list.filter((p) => p.quad === qFocus);
    const k = sort.k;
    list.sort((a, b) => (k === 'q' ? a.q.localeCompare(b.q) * -sort.d : (a[k] - b[k]) * sort.d));
    return list;
  }, [kb, filters, qFocus, quadPreset, sort, gap]);
  const opp = useMemo(() => counts[preset.action].slice().sort((a, b) => kb.atoms[b].m[preset.x] - kb.atoms[a].m[preset.x]).slice(0, 40), [counts, preset, kb]);
  const th = (k, label, cls = '') => (
    <th className={cls} onClick={() => setSort((s) => ({ k, d: s.k === k ? -s.d : -1 }))}>{label}{sort.k === k ? (sort.d < 0 ? ' ↓' : ' ↑') : ''}</th>
  );
  const pillCls = (q) => (q === 'br' ? 'action' : q === 'tr' ? 'top' : '');
  return (
    <PanelShell eyebrow="Analysis" title="Where coverage meets citations" onClose={onClose} desc={preset.blurb}>
      <div className="panel-tabs seg sm glass" style={{ alignSelf: 'flex-start' }}>
        {Object.values(QUAD_PRESETS).map((p) => (
          <button key={p.id} className={quadPreset === p.id ? 'on' : ''} onClick={() => setQuadPreset(p.id)}>{p.id === 'gap' ? 'Knowledge gaps' : p.id === 'demand' ? 'Demand' : 'Audience'}</button>
        ))}
      </div>
      <div className="panel-body scroll">
        <div className="qgrid">
          {['tl', 'tr', 'bl', 'br'].map((q) => (
            <button key={q} className={`qcard ${q === preset.action ? 'action' : ''} ${qFocus === q ? 'on' : ''}`}
              onClick={() => (qFocus === q ? useStore.getState().clearFocus() : focusOn({ kind: 'quadrant', id: q }))}>
              <div className="q">{preset.plural[q]}</div>
              <div className="v">{counts[q].length.toLocaleString()}</div>
              <div className="p">{fmtPct(counts[q].length / kb.N)} of atoms</div>
            </button>
          ))}
        </div>
        <div className="score-row">
          <span className="eyebrow">Score by</span>
          <div className="seg sm glass">
            <button className={scoreBy === 'atom' ? 'on' : ''} onClick={() => setScoreBy('atom')}>Top atom</button>
            <button className={scoreBy === 'page' ? 'on' : ''} onClick={() => setScoreBy('page')}>Top page</button>
          </div>
        </div>
        <div className="sample-note"><I.info /><span>Coverage is computed from the atoms. Citation strength, demand and engagement are modeled sample data until ACE is connected to live citation tracking.</span></div>
        <div className="seg sm glass" style={{ margin: '0 8px 8px' }}>
          <button className={tab === 'prompts' ? 'on' : ''} onClick={() => setTab('prompts')}>Prompts · {kb.prompts.length}</button>
          <button className={tab === 'atoms' ? 'on' : ''} onClick={() => setTab('atoms')}>{preset.plural[preset.action]}</button>
        </div>
        {tab === 'prompts' && (
          <table className="ptable">
            <thead>
              <tr>{th('q', 'Prompt')}{th('cites', 'Cites', 'num')}{th('cov', 'Cov.', 'num')}</tr>
            </thead>
            <tbody>
              {prompts.slice(0, 250).map((p) => (
                <tr key={p.id} className={isOn(focus, 'prompt', p.id) ? 'on' : ''} onClick={() => focusOn({ kind: 'prompt', id: p.id })} onDoubleClick={() => askQuestion(p.q)} title="Click to light up its atoms · double-click to ask">
                  <td className="qtext">{p.q}<br /><span className={`qpill ${pillCls(p.quad)}`}>{gap.names[p.quad]}</span>{p.src === 'demand' && <span className="qpill" style={{ marginLeft: 4 }}>Demand</span>}</td>
                  <td className="num">{p.cites}</td>
                  <td className="num">{Math.round(p.cov * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'atoms' && opp.map((i) => {
          const a = kb.atoms[i];
          return (
            <button key={i} className="list-row" onClick={() => select(i)}>
              <span style={{ minWidth: 0 }}>
                <div className="t">{a.title}</div>
                <div className="s">{a.id} · {a.page.path}</div>
              </span>
              <span className="n">{Math.round(a.m[preset.x] * 100)}% · {Math.round(a.m[preset.y] * 100)}%</span>
            </button>
          );
        })}
      </div>
    </PanelShell>
  );
}

// ------------------------------------------------------------------ data source
function DataPanel({ onClose }) {
  const kb = useStore((s) => s.kb);
  const [composer, setComposer] = useState(null);
  useEffect(() => {
    let on = true;
    fetch('/api/ask').then((r) => (r.ok ? r.json() : null)).then((j) => on && setComposer(j || { model: null })).catch(() => on && setComposer({ model: null }));
    return () => { on = false; };
  }, []);
  const fmt = {};
  kb.atoms.forEach((a) => { fmt[a.type] = (fmt[a.type] || 0) + 1; });
  return (
    <PanelShell eyebrow="Workspace" title="Data source" onClose={onClose} desc="Where this atlas gets its atoms, and how it will connect to the ACE Knowledge Base.">
      <div className="panel-body scroll">
        <div className="card">
          <h4><span className="status live"><i /></span>{kb.meta.source} — public site crawl</h4>
          <p>Captured {kb.meta.crawled}. Pages were fetched, atomized into self-contained units, and tagged against a shared ontology.</p>
          <dl className="kv" style={{ padding: '10px 0 0' }}>
            <dt>Pages</dt><dd>{kb.pages.length}</dd>
            <dt>Atoms</dt><dd>{kb.N.toLocaleString()}</dd>
            <dt>Assets</dt><dd>{kb.meta.assets} images, PDFs and videos</dd>
            <dt>Formats</dt><dd>{kb.meta.formats.map((f) => `${FORMAT_LABEL[f]} ${fmt[f] || 0}`).join(' · ')}</dd>
            <dt>Prompts</dt><dd>{kb.prompts.length} (derived + real-world demand)</dd>
            <dt>Schema</dt><dd className="mono" style={{ fontSize: 12 }}>{kb.meta.schema}</dd>
          </dl>
        </div>
        <div className="card">
          <h4><span className="status"><i /></span>ACE Knowledge Base</h4>
          <p>Not connected. The atlas reads a static export (<code>/data/kb.json</code>) shaped like ACE atoms: id, format, text, topic, tags, entities, persona, intent, stage and provenance. Pointing it at an ACE Knowledge Base endpoint swaps the export for live atoms and live citation data.</p>
          <button className="btn" style={{ marginTop: 12 }} disabled title="Coming soon"><I.plug /> Connect ACE · coming soon</button>
        </div>
        <div className="card">
          <h4><span className={`status ${composer?.model ? 'live' : ''}`}><i /></span>Answer composer</h4>
          <p>
            {composer == null ? 'Checking…' : composer.model
              ? <>Answers are composed with <code>{composer.model}</code>, grounded only in the atoms retrieved for each question, with citations back to each atom.</>
              : <>Answers are composed in the browser from the retrieved atoms (extractive, always grounded). Set <code>GEMINI_API_KEY</code> or <code>ANTHROPIC_API_KEY</code> on the deployment to generate answers with a model.</>}
          </p>
        </div>
        <div className="card">
          <h4>Metric provenance</h4>
          <p><b>Coverage</b> is computed: how well each atom answers the prompts it is meant to surface for, blended with specificity and neighbourhood support. <b>Citation strength</b>, <b>demand</b> and <b>engagement</b> are modeled sample values for the demo.</p>
        </div>
        <a className="btn" style={{ margin: '4px 8px', display: 'flex' }} href="/data/kb.json" download="ace-uhc-knowledge-base.json"><I.download /> Download knowledge base (JSON)</a>
      </div>
    </PanelShell>
  );
}

export default function SidePanel() {
  const panel = useStore((s) => s.panel);
  const { closePanel } = useStore.getState();
  const [shown, setShown] = useState(panel);
  if (panel && panel !== shown) setShown(panel);
  const P = { ontology: OntologyPanel, tags: TagsPanel, sources: SourcesPanel, performance: PerformancePanel, data: DataPanel }[shown];
  return (
    <section className={`panel glass ${panel ? 'open' : ''}`} aria-hidden={!panel}>
      {P && <P onClose={closePanel} />}
    </section>
  );
}

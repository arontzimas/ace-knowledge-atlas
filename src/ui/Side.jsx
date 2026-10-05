import { useState } from 'react';
import { useStore } from '../store.js';
import { I } from './icons.jsx';
import { AnswerText, CoverageRing, engineRef } from './common.jsx';
import { FORMAT_LABEL } from '../search/kb.js';
import { METRICS } from '../scene/quad.js';

const hot = (i) => {
  const e = engineRef.current;
  if (!e) return;
  e.hovered = i;
  e._updateLinks();
};

export function AtomDrawer() {
  const kb = useStore((s) => s.kb);
  const selected = useStore((s) => s.selected);
  const ask = useStore((s) => s.ask);
  const { clearSelection, select, focusOn, askQuestion } = useStore.getState();
  const [last, setLast] = useState(-1);
  if (selected >= 0 && selected !== last) setLast(selected);
  const i = selected >= 0 ? selected : last;
  const a = i >= 0 ? kb.atoms[i] : null;
  const open = selected >= 0;
  const p = a?.page;
  const topic = a ? kb.ontology.topics[a.topic] : null;
  const domain = a ? kb.ontology.domains[a.domain] : null;
  const theme = a ? kb.themes[a.theme] : null;
  const otherAssets = p ? p.assets.filter((s) => s.src !== p.image) : [];

  return (
    <aside className={`side glass-strong ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Atom detail" style={{ zIndex: 27 }}>
      {a && (
        <>
          <div className="side-head">
            {ask && (
              <button className="chip" onClick={clearSelection}><I.back /> Answer</button>
            )}
            <span className="chip dark">{FORMAT_LABEL[a.type]}</span>
            <span className="mono">{a.id}</span>
            <span className="grow" />
            <button className="iconbtn" onClick={clearSelection} aria-label="Close"><I.close /></button>
          </div>
          <div className="side-body scroll">
            <h2 className="atom-title">{a.title}</h2>
            {a.q && <p className="atom-q"><I.question />{a.q}</p>}
            <p className="atom-text">{a.text}</p>

            <div className="sec">
              <span className="eyebrow">Ontology</span>
              <div className="meta-grid">
                <button className="meta" onClick={() => focusOn({ kind: 'domain', id: a.domain })}><div className="k">Domain</div><div className="v">{domain.name}</div></button>
                <button className="meta" onClick={() => focusOn({ kind: 'topic', id: a.topic })}><div className="k">Topic</div><div className="v">{topic.name}</div></button>
                <button className="meta" onClick={() => focusOn({ kind: 'theme', id: a.theme })}><div className="k">Semantic theme</div><div className="v">{theme.label}</div></button>
                <button className="meta" onClick={() => focusOn({ kind: 'group', by: 'intent', id: kb.meta.intents.indexOf(a.intent) })}><div className="k">Intent</div><div className="v">{a.intent}</div></button>
                <button className="meta" onClick={() => focusOn({ kind: 'group', by: 'stage', id: kb.meta.stages.indexOf(a.stage) })}><div className="k">Stage</div><div className="v">{a.stage}</div></button>
                <button className="meta" onClick={() => focusOn({ kind: 'group', by: 'persona', id: kb.meta.personas.indexOf(a.personas[0]) })}><div className="k">Persona</div><div className="v">{a.personas.join(', ')}</div></button>
              </div>
            </div>

            <div className="sec">
              <span className="eyebrow">Semantic tags</span>
              <div className="chips-wrap">
                {a.tags.map((t) => <button key={t} className="chip" onClick={() => focusOn({ kind: 'tag', id: t })}><I.tag />{t}</button>)}
              </div>
              {a.ents.length > 0 && (
                <div className="chips-wrap" style={{ marginTop: 6 }}>
                  {a.ents.map((t) => <button key={t} className="chip ghost" onClick={() => focusOn({ kind: 'entity', id: t })}>{t}</button>)}
                </div>
              )}
            </div>

            <div className="sec">
              <span className="eyebrow">Source</span>
              <a className="src-card" href={p.url} target="_blank" rel="noopener noreferrer">
                {p.image && <img src={p.image} alt="" referrerPolicy="no-referrer" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                <div className="b">
                  <div className="t">{p.title}</div>
                  <div className="u">{p.url.replace('https://', '')}</div>
                  <div className="row">
                    <span className="chip"><I.ext />Open source page</span>
                    <span className="chip">{p.atoms.length} atoms</span>
                    <span className="chip">{p.type}</span>
                  </div>
                </div>
              </a>
              {otherAssets.length > 0 && (
                <div className="assets-row scroll" style={{ marginTop: 8 }}>
                  {otherAssets.map((s) => (
                    <a key={s.src} href={s.src} target="_blank" rel="noopener noreferrer" title={s.alt || s.kind}>
                      {s.kind === 'image' ? <img src={s.src} alt={s.alt} loading="lazy" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.replaceWith(document.createTextNode('')); }} /> : s.kind === 'pdf' ? <I.pdf /> : <I.video />}
                    </a>
                  ))}
                </div>
              )}
              <button className="btn" style={{ marginTop: 8, width: '100%' }} onClick={() => focusOn({ kind: 'page', id: p.id })}>
                <I.layers /> Light up all {p.atoms.length} atoms from this page
              </button>
            </div>

            <div className="sec">
              <span className="eyebrow">Performance</span>
              {Object.entries(METRICS).map(([k, m]) => (
                <div className="metric" key={k}>
                  <span className="lab">{m.label}{m.sample && <span className="tag-sample">Sample</span>}</span>
                  <span className="val">{Math.round(a.m[k] * 100)}%</span>
                  <span className="bar"><i className={k === 'cit' ? 'red' : ''} style={{ width: `${Math.max(2, a.m[k] * 100)}%` }} /></span>
                </div>
              ))}
            </div>

            {a.qs.length > 0 && (
              <div className="sec">
                <span className="eyebrow">Prompts this atom answers</span>
                <div className="rel">
                  {a.qs.map((q) => (
                    <button key={q} onClick={() => askQuestion(q)}><I.spark style={{ width: 14, height: 14, marginTop: 2, flex: 'none' }} /><span className="t">{q}</span></button>
                  ))}
                </div>
              </div>
            )}

            <div className="sec">
              <span className="eyebrow">Related atoms</span>
              <div className="rel">
                {a.nb.slice(0, 6).map((j) => {
                  const b = kb.atoms[j];
                  return (
                    <button key={j} onClick={() => select(j)} onMouseEnter={() => hot(j)} onMouseLeave={() => hot(-1)}>
                      <span className="dot" />
                      <span><div className="t">{b.title}</div><div className="s">{kb.ontology.topics[b.topic].name} · {FORMAT_LABEL[b.type]}</div></span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="side-actions">
            <button className="btn dark" onClick={() => askQuestion(a.q || a.title)}><I.spark /> Ask about this</button>
            <button className="btn" onClick={() => engineRef.current?.focusAtom(i, { dist: 26 })}><I.target /> Locate</button>
          </div>
        </>
      )}
    </aside>
  );
}

const VERDICT = {
  strong: { t: 'Strong coverage', s: (n, m) => `${n} atoms across ${m} page${m === 1 ? '' : 's'} answer this directly.` },
  partial: { t: 'Partial coverage', s: () => 'Related atoms exist, but none answers the full question.' },
  gap: { t: 'Knowledge gap', s: () => 'Nothing in the knowledge base answers this directly. A candidate for new content.' },
};

export function AnswerPanel() {
  const kb = useStore((s) => s.kb);
  const ask = useStore((s) => s.ask);
  const selected = useStore((s) => s.selected);
  const { clearAsk, select } = useStore.getState();
  const [copied, setCopied] = useState(false);
  const [last, setLast] = useState(null);
  if (ask && ask !== last) setLast(ask);
  const A = ask || last;
  const open = !!ask && selected < 0;
  if (!A) return <aside className="side glass-strong" aria-hidden="true" />;
  const pages = new Set(A.atoms.map((r) => kb.atoms[r.i].p));
  const v = VERDICT[A.verdict] || VERDICT.partial;
  const streaming = A.status === 'composing';
  const copy = async () => {
    const plain = A.text.replace(/\[(\d+)\]/g, (m, n) => `[${kb.atoms[A.atoms[n - 1]?.i]?.id || n}]`);
    try { await navigator.clipboard.writeText(`${A.question}\n\n${plain}`); setCopied(true); setTimeout(() => setCopied(false), 1400); } catch { /* clipboard blocked */ }
  };
  const composerLabel = A.composer === 'local' ? 'Composed from the atoms in your browser (extractive). Add a model key to generate answers.' : A.composer ? `Composed with ${A.composer} from ${A.atoms.length} atoms` : '';
  return (
    <aside className={`side glass-strong ${open ? 'open' : ''}`} aria-hidden={!open} aria-label="Answer" aria-live="polite">
      <div className="side-head">
        <span className="eyebrow" style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}><I.spark style={{ width: 14, height: 14, color: 'var(--red)' }} /> Answer</span>
        <span className="grow" />
        {A.status === 'done' && <button className="iconbtn" onClick={copy} aria-label="Copy answer">{copied ? <I.check /> : <I.copy />}</button>}
        <button className="iconbtn" onClick={clearAsk} aria-label="Close answer"><I.close /></button>
      </div>
      <div className="side-body scroll">
        <h2 className="ans-q">{A.question}</h2>
        {A.status === 'retrieving' && <div className="ans-status"><span className="pulse" /><span className="shimmer">Pulling atoms from the knowledge base…</span></div>}
        {A.status === 'composing' && !A.text && <div className="ans-status"><span className="pulse" /><span className="shimmer">Composing from {A.atoms.length} atoms…</span></div>}
        {A.text && <AnswerText text={A.text} atoms={A.atoms} streaming={streaming} onCite={(i) => select(i)} onHot={hot} />}

        {A.status !== 'retrieving' && (
          <div className={`cov ${A.verdict === 'gap' ? 'gap' : ''}`}>
            <CoverageRing value={A.coverage} gap={A.verdict === 'gap'} />
            <div><div className="t">{v.t}</div><div className="s">{v.s(A.atoms.length, pages.size)}</div></div>
          </div>
        )}

        <div className="sec">
          <span className="eyebrow">Atoms pulled · {A.atoms.length}</span>
          <div className="used">
            {A.atoms.map((r, k) => {
              const a = kb.atoms[r.i];
              return (
                <button key={r.i} onClick={() => select(r.i)} onMouseEnter={() => hot(r.i)} onMouseLeave={() => hot(-1)}>
                  <span className="cite">{k + 1}</span>
                  <span><div className="t">{a.title}</div><div className="s">{a.id} · {a.page.path}</div></span>
                </button>
              );
            })}
          </div>
        </div>
        {A.status === 'done' && composerLabel && <div className="composer"><I.info style={{ width: 13, height: 13 }} />{composerLabel}</div>}
      </div>
    </aside>
  );
}

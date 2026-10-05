import { useEffect, useMemo, useRef, useState } from 'react';
import { AtlasEngine } from '../scene/engine.js';
import { buildLayout } from '../scene/layouts.js';
import { computeVisuals } from '../scene/visuals.js';
import { useStore, makePasses, activeHighlight } from '../store.js';
import { engineRef, useLayoutMetrics } from './common.jsx';
import { FORMAT_LABEL } from '../search/kb.js';

function labelKeysForFocus(kb, focus, view, groupBy, quadPreset) {
  const keys = new Set();
  if (!focus) return keys;
  const { kind, id } = focus;
  if (kind === 'topic') { keys.add('onto-t-' + id); if (groupBy === 'topic') keys.add(`grp-topic-${id}`); }
  if (kind === 'domain') { keys.add('onto-d-' + id); keys.add(`grp-domain-${id}`); }
  if (kind === 'theme') { keys.add('theme-' + id); keys.add(`grp-theme-${id}`); }
  if (kind === 'group') keys.add(`grp-${focus.by}-${id}`);
  if (kind === 'page') keys.add('src-' + id);
  if (kind === 'quadrant') keys.add(`quad-${quadPreset}-${id}`);
  return keys;
}

export default function Stage() {
  const hostRef = useRef(null);
  const labelRef = useRef(null);
  const hoverRef = useRef(null);
  const [hover, setHover] = useState(-1);
  const kb = useStore((s) => s.kb);
  const view = useStore((s) => s.view);
  const groupBy = useStore((s) => s.groupBy);
  const quadPreset = useStore((s) => s.quadPreset);
  const scoreBy = useStore((s) => s.scoreBy);
  const filters = useStore((s) => s.filters);
  const selected = useStore((s) => s.selected);
  const hiSource = useStore((s) => s.hiSource);
  const live = useStore((s) => s.live);
  const focus = useStore((s) => s.focus);
  const ask = useStore((s) => s.ask);
  const fitNonce = useStore((s) => s.fitNonce);
  const paused = useStore((s) => s.paused);
  const intro = useStore((s) => s.intro);
  const metrics = useLayoutMetrics();

  const askAtomsKey = ask ? ask.atoms.map((r) => r.i).join(',') : '';
  const highlight = useMemo(
    () => activeHighlight({ hiSource, live, focus, ask }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hiSource, live, focus, askAtomsKey],
  );

  // ---- engine lifecycle
  useEffect(() => {
    if (!kb || !hostRef.current) return;
    const st = useStore.getState;
    let engine;
    try {
      engine = new AtlasEngine({
      host: hostRef.current,
      labelHost: labelRef.current,
      kb,
      onHover: (i, x, y) => {
        setHover(i);
        const el = hoverRef.current;
        if (!el || i < 0) return;
        const w = el.offsetWidth || 280, h = el.offsetHeight || 100;
        let px = x + 16, py = y + 16;
        if (px + w > window.innerWidth - 12) px = x - w - 16;
        if (py + h > window.innerHeight - 12) py = y - h - 16;
        el.style.transform = `translate3d(${px}px, ${py}px, 0)`;
      },
      onSelect: (i) => {
        st().select(i);
      },
      onBackground: () => {
        const s = st();
        if (s.selected >= 0) s.clearSelection();
        else s.dismissIntro();
      },
      onLabel: (c) => {
        const s = st();
        if (c.kind === 'all') return s.focusOn({ kind: 'all' });
        if (s.focus && s.focus.kind === c.kind && s.focus.id === c.id && s.hiSource === 'focus') return s.clearFocus();
        s.focusOn(c);
      },
      onInteract: () => st().dismissIntro(),
      });
    } catch (err) {
      st().setError('This experience needs WebGL, which is unavailable in this browser. Try a recent version of Chrome, Safari, Edge or Firefox.');
      return undefined;
    }
    engineRef.current = engine;
    if (import.meta.env.DEV) window.__atlas = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, [kb]);

  // ---- layout
  const firstLayout = useRef(true);
  useEffect(() => {
    const e = engineRef.current;
    if (!e || !kb) return;
    const layout = buildLayout(kb, view, { groupBy, quadPreset, scoreBy });
    const s = useStore.getState();
    const hi = activeHighlight(s);
    const keep = !firstLayout.current && hi && hi.map.size > 0 && hi.map.size < kb.N * 0.6;
    e.setLayout(layout, { keepCamera: keep });
    if (keep) setTimeout(() => e.fitAtoms(Array.from(hi.map.keys()), { dur: 1600 }), 60);
    firstLayout.current = false;
  }, [kb, view, groupBy, quadPreset, scoreBy]);

  // ---- visuals
  useEffect(() => {
    const e = engineRef.current;
    if (!e || !kb) return;
    const passes = makePasses(kb, filters);
    const quadFocus = null;
    const v = computeVisuals(kb, { view, passes, highlight: highlight?.map || null, selected, quadPreset, scoreBy, quadFocus });
    if (intro) for (let i = 0; i < v.alpha.length; i++) v.alpha[i] *= 0.72;
    e.setVisualTargets(v);
  }, [kb, view, filters, highlight, selected, quadPreset, scoreBy, intro]);

  // ---- camera follows intent
  useEffect(() => {
    const e = engineRef.current;
    if (!e || !kb || !fitNonce) return;
    const s = useStore.getState();
    const hi = activeHighlight(s);
    if (hi && hi.map.size) e.fitAtoms(Array.from(hi.map.keys()), { dur: 1500 });
    else e.resetCamera();
  }, [fitNonce, kb]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setSelected(selected);
    if (selected >= 0) e.focusAtom(selected, { dist: metrics.mobile ? 48 : 38 });
    const a = selected >= 0 ? kb.atoms[selected] : null;
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    e.setPin(
      a && !metrics.mobile ? selected : -1,
      a ? `${a.page.image ? `<img src="${esc(a.page.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()"/>` : ''}<b>${esc(a.page.title)}</b><span>${esc(a.page.path)}</span>` : '',
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setInsets(metrics.mobile
      ? { l: 0, r: 0, t: 50, b: 140 }
      : { l: metrics.contentL - 14, r: metrics.contentR - 14, t: 56, b: 96 });
  }, [metrics.contentL, metrics.contentR, metrics.mobile, kb]);

  useEffect(() => { engineRef.current?.setPaused(paused); }, [paused, kb]);

  // answer lines converge on the answer panel's leading edge
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    if (ask && ask.atoms.length && selected < 0 && !metrics.mobile) {
      e.setAnswer(ask.atoms.map((r) => r.i), { x: metrics.w - metrics.contentR + 2, y: Math.min(220, metrics.h * 0.28) });
    } else {
      e.setAnswer([], null);
    }
  }, [askAtomsKey, selected, metrics.w, metrics.h, metrics.contentR, metrics.mobile, kb, ask]);

  useEffect(() => {
    if (!kb) return;
    const keys = hiSource === 'focus' ? labelKeysForFocus(kb, focus, view, groupBy, quadPreset) : new Set();
    // source cards follow whatever is lit up (or filtered) so the provenance reads at a glance
    if (view === 'sources') {
      const passes = makePasses(kb, filters);
      const filtered = Object.values(filters).some((v) => v != null);
      if (highlight && highlight.map.size) highlight.map.forEach((_, i) => { if (passes(i)) keys.add('src-' + kb.atoms[i].p); });
      else if (filtered) kb.atoms.forEach((a, i) => { if (passes(i)) keys.add('src-' + a.p); });
      if (!keys.size && (filtered || (highlight && highlight.map.size))) keys.add('__none__');
    }
    engineRef.current?.setActiveLabels(keys.size ? keys : null);
  }, [focus, hiSource, view, groupBy, quadPreset, kb, highlight, filters]);

  const a = kb && hover >= 0 ? kb.atoms[hover] : null;
  return (
    <>
      <div className="stage" ref={hostRef} />
      <div className="labels" ref={labelRef} />
      <div className={`hovercard glass-strong ${a ? 'on' : ''}`} ref={hoverRef} aria-hidden="true">
        {a && (
          <>
            <div className="chips">
              <span className="chip dark">{FORMAT_LABEL[a.type]}</span>
              <span className="chip">{kb.ontology.topics[a.topic].name}</span>
            </div>
            <h4>{a.title}</h4>
            <p>{a.text}</p>
            <div className="src">{a.page.path}</div>
          </>
        )}
      </div>
    </>
  );
}

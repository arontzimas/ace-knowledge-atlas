import { useEffect, useRef, useState, Fragment } from 'react';
import { useStore } from '../store.js';
import { I } from './icons.jsx';

export const engineRef = { current: null };

export function useViewport() {
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

/** Screen real estate taken by chrome, used to centre the 3D scene in the free area. */
export function useLayoutMetrics() {
  const { w, h } = useViewport();
  const navCollapsed = useStore((s) => s.navCollapsed);
  const panel = useStore((s) => s.panel);
  const selected = useStore((s) => s.selected);
  const ask = useStore((s) => s.ask);
  const mobile = w <= 760;
  const gap = mobile ? 10 : 14;
  const navW = w <= 1180 ? 64 : navCollapsed ? 64 : 232;
  const panelW = w <= 1180 ? 340 : 368;
  const sideW = w <= 1180 ? 380 : 420;
  const sideOpen = selected >= 0 || !!ask;
  if (mobile) return { mobile, w, h, gap, contentL: gap, contentR: gap, sideOpen, sideW: w - gap * 2, panelOpen: !!panel };
  const contentL = gap + navW + gap + (panel ? panelW + gap - 4 : 0);
  const contentR = gap + (sideOpen ? sideW + gap : 0);
  return { mobile, w, h, gap, contentL, contentR, sideOpen, sideW, panelOpen: !!panel };
}

export function useClickOutside(ref, onOut, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(); };
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [ref, onOut, active]);
}

export function PillSelect({ label, value, options, onChange, align = 'right', allLabel = 'All' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);
  const cur = options.find((o) => o.value === value);
  return (
    <div className={`pill-select ${open ? 'open' : ''}`} ref={ref}>
      <button className={value != null ? 'set' : ''} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
        {label}: <b>{cur ? cur.label : allLabel}</b>
        <I.chevDown />
      </button>
      {open && (
        <div className={`menu glass-strong scroll ${align === 'left' ? 'left' : ''}`} role="listbox">
          {allLabel && (
            <>
              <button className={value == null ? 'on' : ''} onClick={() => { onChange(null); setOpen(false); }}>{allLabel}</button>
              <hr />
            </>
          )}
          {options.map((o) => (
            <button key={String(o.value)} className={o.value === value ? 'on' : ''} onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
              {o.n != null && <span className="n">{o.n}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CoverageRing({ value, gap }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <svg className="ring" viewBox="0 0 38 38">
      <circle cx="19" cy="19" r={r} fill="none" stroke="rgba(24,24,27,.08)" strokeWidth="3.5" />
      <circle cx="19" cy="19" r={r} fill="none" stroke={gap ? '#e5385a' : '#18181b'} strokeWidth="3.5" strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`} transform="rotate(-90 19 19)" style={{ transition: 'stroke-dasharray .9s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="19" y="22.5" textAnchor="middle" fontSize="10" fontWeight="650" fill="#18181b" fontFamily="Inter Variable, Inter, sans-serif">{Math.round(value * 100)}</text>
    </svg>
  );
}

/** Render composed answer text: paragraphs, bullets, **bold**, and [n] citations as chips. */
export function AnswerText({ text, atoms, onCite, onHot, streaming }) {
  const blocks = [];
  const lines = String(text || '').split('\n');
  let list = null;
  lines.forEach((ln) => {
    const m = ln.match(/^\s*[-*•]\s+(.*)$/);
    if (m) {
      if (!list) { list = []; blocks.push({ type: 'ul', items: list }); }
      list.push(m[1]);
    } else if (ln.trim()) {
      list = null;
      const last = blocks[blocks.length - 1];
      if (last && last.type === 'p' && !last.closed) last.text += ' ' + ln.trim();
      else blocks.push({ type: 'p', text: ln.trim() });
    } else {
      list = null;
      const last = blocks[blocks.length - 1];
      if (last) last.closed = true;
    }
  });
  const inline = (s, key) => {
    const parts = s.split(/(\[\d+(?:\s*[,–-]\s*\d+)*\]|\*\*[^*]+\*\*)/g);
    return parts.map((p, k) => {
      const c = p.match(/^\[(\d+(?:\s*[,–-]\s*\d+)*)\]$/);
      if (c) {
        const nums = c[1].split(/\s*[,–-]\s*/).map(Number).filter((n) => n >= 1 && n <= atoms.length);
        return nums.map((n) => (
          <button key={`${key}-${k}-${n}`} className="cite" onClick={() => onCite(atoms[n - 1].i)} onMouseEnter={() => onHot(atoms[n - 1].i)} onMouseLeave={() => onHot(-1)} title={`Atom ${n}`}>{n}</button>
        ));
      }
      const b = p.match(/^\*\*([^*]+)\*\*$/);
      if (b) return <strong key={`${key}-${k}`}>{b[1]}</strong>;
      return <Fragment key={`${key}-${k}`}>{p}</Fragment>;
    });
  };
  return (
    <div className="ans-body">
      {blocks.map((b, k) => {
        const isLast = k === blocks.length - 1;
        if (b.type === 'ul') {
          return (
            <ul key={k}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, `${k}-${j}`)}{streaming && isLast && j === b.items.length - 1 && <span className="caret-blink" />}</li>
              ))}
            </ul>
          );
        }
        return <p key={k}>{inline(b.text, k)}{streaming && isLast && <span className="caret-blink" />}</p>;
      })}
      {streaming && !blocks.length && <span className="caret-blink" />}
    </div>
  );
}

export function fmtPct(v) {
  return `${Math.round(v * 1000) / 10}%`;
}

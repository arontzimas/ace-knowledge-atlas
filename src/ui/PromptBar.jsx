import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, makePasses } from '../store.js';
import { suggest } from '../search/retrieve.js';
import { I, KIND_ICON } from './icons.jsx';

const WORDS = ['Medicare Advantage', 'D-SNP eligibility', 'level funded plans', 'HSA vs FSA', 'prior authorization', 'Medicaid renewal', 'travel insurance', 'virtual care', 'out-of-pocket limits', 'GLP-1 costs'];
const QUICK = [
  "What's the difference between an HMO and a PPO?",
  'Who qualifies for a Dual Special Needs plan?',
  'How do level funded plans help employers control costs?',
  'Does Medicare cover hearing aids?',
];

function Mark({ text, q }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return text;
  return (<>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>);
}

export default function PromptBar() {
  const kb = useStore((s) => s.kb);
  const intro = useStore((s) => s.intro);
  const filters = useStore((s) => s.filters);
  const storeQuery = useStore((s) => s.query);
  const { setQuery, askQuestion, focusOn, select, dismissIntro } = useStore.getState();
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [w, setW] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const tRef = useRef(null);

  useEffect(() => {
    const id = setInterval(() => setW((x) => (x + 1) % WORDS.length), 2600);
    return () => clearInterval(id);
  }, []);

  // keep in sync when the highlight is cleared elsewhere
  useEffect(() => { if (!storeQuery && value && !focused) setValue(''); }, [storeQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sugg = useMemo(() => {
    if (!focused || value.trim().length < 2) return null;
    return suggest(kb, value, makePasses(kb, filters));
  }, [kb, value, focused, filters]);

  const flat = useMemo(() => {
    const out = [{ kind: 'ask' }];
    if (sugg) ['topics', 'tags', 'pages', 'atoms'].forEach((g) => sugg[g].forEach((x) => out.push(x)));
    return out;
  }, [sugg]);

  useEffect(() => setActive(0), [value]);

  const onChange = (e) => {
    const v = e.target.value;
    setValue(v);
    clearTimeout(tRef.current);
    tRef.current = setTimeout(() => setQuery(v), 90);
  };

  const submit = (q) => {
    const text = (q ?? value).trim();
    if (!text) return;
    clearTimeout(tRef.current);
    setQuery('');
    askQuestion(text);
    setValue(text);
    inputRef.current?.blur();
  };

  const choose = (item) => {
    if (!item || item.kind === 'ask') return submit();
    clearTimeout(tRef.current);
    setQuery('');
    setValue('');
    inputRef.current?.blur();
    if (item.kind === 'atom') return select(item.id);
    focusOn({ kind: item.kind, id: item.id });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[active]); }
    else if (e.key === 'Escape') {
      if (value) { setValue(''); setQuery(''); } else inputRef.current?.blur();
    }
  };

  const groups = sugg ? [
    ['Topics & themes', sugg.topics],
    ['Tags & entities', sugg.tags],
    ['Pages', sugg.pages],
    ['Atoms', sugg.atoms],
  ] : [];
  let idx = 0;
  const showSugg = focused && value.trim().length >= 2;

  return (
    <div className="prompt-wrap" ref={wrapRef}>
      <div className="prompt">
        {showSugg && (
          <div className="sugg glass-strong scroll" role="listbox" onPointerDown={(e) => e.preventDefault()}>
            <button className={`sugg-ask ${active === 0 ? 'on' : ''}`} onClick={() => submit()} onMouseMove={() => active !== 0 && setActive(0)}>
              <span className="ico"><I.spark /></span>
              <span className="l">Ask: {value.trim()}</span>
              <span className="kbd">↵</span>
            </button>
            {groups.map(([title, items]) => {
              if (!items.length) return null;
              return (
                <div className="sugg-group" key={title}>
                  <span className="eyebrow">{title}</span>
                  {items.map((it) => {
                    const k = ++idx;
                    const Icon = KIND_ICON[it.kind] || I.atom;
                    return (
                      <button key={it.kind + it.id} className={`sugg-item ${active === k ? 'on' : ''}`} onClick={() => choose(it)} onMouseMove={() => active !== k && setActive(k)}>
                        <span className="ico"><Icon /></span>
                        <span className="txt">
                          <div className="l"><Mark text={it.label} q={value.trim()} /></div>
                          <div className="s">{it.sub}</div>
                        </span>
                        {it.n != null && <span className="n">{it.n}</span>}
                      </button>
                    );
                  })}
                </div>
              );
            })}
            <div className="sugg-foot"><span><span className="kbd">↑↓</span> navigate</span><span><span className="kbd">↵</span> select</span><span><span className="kbd">esc</span> clear</span></div>
          </div>
        )}
        <div className="prompt-bar glass-strong">
          <I.spark className="prompt-glyph" />
          <div className="prompt-field">
            <input
              ref={inputRef}
              value={value}
              onChange={onChange}
              onFocus={() => { setFocused(true); dismissIntro(); }}
              onBlur={() => setFocused(false)}
              onKeyDown={onKeyDown}
              aria-label="Ask a question or search the knowledge base"
              autoComplete="off"
              spellCheck={false}
            />
            {!value && (
              <div className="prompt-ph" aria-hidden="true">
                {focused ? (
                  <span>Ask a question, or search topics, tags and keywords</span>
                ) : (
                  <>
                    <span>I want to learn about</span>
                    <span className="word" key={w}>{WORDS[w]}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {!intro && !focused && !value && <span className="kbd" title="Focus search">/</span>}
          <button className="prompt-send" onClick={() => submit()} disabled={!value.trim()} aria-label="Ask">
            <I.send />
          </button>
        </div>
      </div>
      <div className="quick">
        {QUICK.map((q) => (
          <button key={q} onClick={() => { setValue(q); submit(q); }}>{q}</button>
        ))}
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { useStore } from './store.js';
import { loadKB } from './search/kb.js';
import Stage from './ui/Stage.jsx';
import { SideNav, TopBar, HighlightChip, Legend, IntroHero } from './ui/Chrome.jsx';
import PromptBar from './ui/PromptBar.jsx';
import SidePanel from './ui/Panels.jsx';
import { AtomDrawer, AnswerPanel } from './ui/Side.jsx';
import { useLayoutMetrics } from './ui/common.jsx';
import { BrandMark } from './ui/icons.jsx';

export default function App() {
  const kb = useStore((s) => s.kb);
  const error = useStore((s) => s.error);
  const intro = useStore((s) => s.intro);
  const navCollapsed = useStore((s) => s.navCollapsed);
  const m = useLayoutMetrics();

  useEffect(() => {
    loadKB()
      .then((k) => useStore.getState().setKB(k))
      .catch((e) => useStore.getState().setError(e.message || String(e)));
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (document.activeElement?.tagName === 'INPUT') return;
      const s = useStore.getState();
      if (s.selected >= 0) s.clearSelection();
      else if (s.ask) s.clearAsk();
      else if (s.hiSource) s.clearHighlight();
      else if (s.panel) s.closePanel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={`app ${intro ? 'intro' : ''} ${navCollapsed ? 'nav-collapsed' : ''} ${m.sideOpen || m.panelOpen ? 'busy' : ''}`}
      style={{ '--content-l': `${m.contentL}px`, '--content-r': `${m.contentR}px` }}
    >
      <div className="atmo" aria-hidden="true"><i /><i /><i /></div>
      <Stage />
      {kb && (
        <>
          <SideNav />
          <SidePanel />
          <TopBar />
          <HighlightChip />
          <IntroHero />
          <Legend />
          <PromptBar />
          <AnswerPanel />
          <AtomDrawer />
        </>
      )}
      <div className={`loading ${kb ? 'done' : ''}`} aria-hidden={!!kb}>
        <div className="inner">
          {error ? (
            <p className="err">The knowledge base could not be loaded. {error}</p>
          ) : (
            <>
              <BrandMark style={{ width: 40, height: 40 }} />
              <div className="bar"><i /></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

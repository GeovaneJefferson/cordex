import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TabBar } from './TabBar';
import { SplitEditor } from './SplitEditor';
import { BottomPanel } from './BottomPanel';
import { BrowserPanel } from './BrowserPanel';
import { useAppState } from '../store/AppContext';
import { useAI } from '../hooks/useAI';

const AIBtn: React.FC<{
  icon: string; label?: string; dark?: boolean;
  loading?: boolean; onClick?: () => void; title: string; shortcut?: string;
  active?: boolean; iconStyle?: React.CSSProperties;
}> = ({ icon, label, dark, loading, onClick, title, shortcut, active, iconStyle }) => (
  <button title={`${title}${shortcut ? ` (${shortcut})` : ''}`} onClick={onClick} disabled={loading}
    className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-medium
      transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-95
      ${dark
        ? 'bg-gray-900 text-white hover:bg-gray-700'
        : active
          ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
          : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
      }`}>
    <span
      className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}
      style={iconStyle}
    >
      {loading ? 'autorenew' : icon}
    </span>
    {label}
  </button>
);

// ── Preview mode button (icon-only, styled distinctly) ──────────────────────
const PreviewBtn: React.FC<{
  icon: string; title: string; active?: boolean; onClick: () => void;
}> = ({ icon, title, active, onClick }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 7,
      border: `1.5px solid ${active ? '#f97316' : '#e2e8f0'}`,
      background: active ? '#fff7ed' : 'white',
      color: active ? '#ea580c' : '#64748b',
      cursor: 'pointer',
      transition: 'all 0.15s',
      flexShrink: 0,
    }}
  >
    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
  </button>
);

export const EditorContainer: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { analyzeCode, bugFixActiveTab, generateDocstring } = useAI();

  const [docLoading,     setDocLoading]     = useState(false);
  const [improveLoading, setImproveLoading] = useState(false);
  const [bugLoading,     setBugLoading]     = useState(false);

  // ── Browser preview state ──────────────────────────────────────────────────
  const [browserMode, setBrowserMode] = useState<'phone' | 'desktop' | null>(null);
  const [splitRatio,  setSplitRatio]  = useState(0.55);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging     = useRef(false);

  const openBrowser = (mode: 'phone' | 'desktop') => {
    if (browserMode === mode) { setBrowserMode(null); return; }
    setBrowserMode(mode);
    setSplitRatio(mode === 'phone' ? 0.6 : 0.5);
  };

  const closeBrowser = () => setBrowserMode(null);

  // ── Browser pane resize divider ────────────────────────────────────────────
  const onDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (mv: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setSplitRatio(Math.min(0.82, Math.max(0.3, (mv.clientX - rect.left) / rect.width)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const activeTab = state.tabs.find(t => t.id === state.activeTabId);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape')   { closeBrowser(); return; }
      if (mod && e.shiftKey && e.key === 'F') { e.preventDefault(); dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'search' }); return; }
      if (mod && e.shiftKey && e.key === 'G') { e.preventDefault(); dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'git' }); return; }
      if (mod && e.key === '`') { e.preventDefault(); dispatch({ type: 'TOGGLE_TERMINAL' }); return; }
      if (mod && e.key === '\\') {
        e.preventDefault();
        if (state.splitTabId) dispatch({ type: 'SET_SPLIT_TAB', tabId: null });
        else {
          const other = state.tabs.find(t => t.id !== state.activeTabId);
          if (other) dispatch({ type: 'SET_SPLIT_TAB', tabId: other.id });
        }
        return;
      }
      if (mod && e.key === ',') { e.preventDefault(); dispatch({ type: 'TOGGLE_AI_SETTINGS' }); return; }
      if (mod && e.key === 'w') {
        e.preventDefault();
        if (state.activeTabId) dispatch({ type: 'REMOVE_TAB', id: state.activeTabId });
        return;
      }
      if (mod && e.key === 'Tab') {
        e.preventDefault();
        const idx = state.tabs.findIndex(t => t.id === state.activeTabId);
        const next = state.tabs[(idx + (e.shiftKey ? -1 : 1) + state.tabs.length) % state.tabs.length];
        if (next) dispatch({ type: 'SET_ACTIVE_TAB', id: next.id });
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.activeTabId, state.tabs, state.splitTabId, dispatch]);

  const handleDoc = async () => {
    if (!activeTab) return;
    setDocLoading(true);
    try {
      const r = await generateDocstring(activeTab.content);
      if (r?.ok) dispatch({ type: 'OPEN_BUG_FIX_MODAL', explanation: r.docstring ?? '', fixedCode: activeTab.content });
    } finally { setDocLoading(false); }
  };

  const handleImprove = async () => {
    if (!activeTab) return;
    setImproveLoading(true);
    try { await analyzeCode(activeTab.content); }
    finally { setImproveLoading(false); }
  };

  const handleBugFix = async () => {
    if (!activeTab) return;
    setBugLoading(true);
    try { await bugFixActiveTab(); }
    finally { setBugLoading(false); }
  };

  const handleFlow = useCallback(() => {
    if (!activeTab || activeTab.tabType === 'flow') return;
    const flowId = `flow::${activeTab.id}`;
    const exists = state.tabs.find(t => t.id === flowId);
    if (exists) { dispatch({ type: 'SET_ACTIVE_TAB', id: flowId }); return; }
    dispatch({
      type: 'ADD_TAB',
      tab: {
        id: flowId, path: flowId,
        name: `Flow: ${activeTab.name}`,
        content: '', language: 'flow', isDirty: false,
        tabType: 'flow', flowSourceTabId: activeTab.id,
      },
    });
  }, [activeTab, state.tabs, dispatch]);

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="h-11 border-b border-gray-100 flex items-center px-3 gap-2 flex-shrink-0 bg-white">

        {/* Left: preview launch button */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <PreviewBtn
            icon="open_in_browser"
            title="Browser preview — localhost:8081"
            active={browserMode !== null}
            onClick={() => openBrowser(browserMode === 'desktop' ? 'desktop' : 'desktop')}
          />
        </div>

        <div className="w-px h-5 bg-gray-100 flex-shrink-0" />

        {/* Right: AI action buttons */}
        <div className="flex items-center gap-1.5 flex-1 justify-end">
          <AIBtn icon="description"      label="Documentation" dark  title="Generate docs"     shortcut="Ctrl+D" loading={docLoading}     onClick={handleDoc}     />
          <AIBtn icon="auto_awesome"     label="Improve"             title="Analyze & improve" shortcut="Ctrl+I" loading={improveLoading} onClick={handleImprove} />
          <AIBtn icon="medical_services" label="Bug Fix"             title="AI bug fix"        shortcut="Ctrl+B" loading={bugLoading}     onClick={handleBugFix}  />
          <AIBtn icon="account_tree"     label="Flow"                title="Code flow diagram"                                           onClick={handleFlow}    />
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button title="AI Settings (Ctrl+,)" onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <span className="material-symbols-outlined text-[16px]">settings</span>
          </button>
        </div>
      </header>

      <TabBar />

      {/* ── Editor + optional browser split ─────────────────────────────────── */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden min-h-0">

        {/* Editor pane */}
        <div
          style={{ width: browserMode ? `${splitRatio * 100}%` : '100%' }}
          className="flex flex-col min-w-0 min-h-0 transition-none"
        >
          <SplitEditor />
        </div>

        {/* Browser pane */}
        {browserMode && (
          <>
            {/* Resize divider */}
            <div
              onMouseDown={onDivider}
              style={{
                width: 4, flexShrink: 0,
                background: '#e2e8f0',
                cursor: 'col-resize',
                transition: 'background 0.15s',
                position: 'relative',
                zIndex: 10,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f97316')}
              onMouseLeave={e => (e.currentTarget.style.background = '#e2e8f0')}
            />

            {/* Browser panel */}
            <div
              style={{ width: `${(1 - splitRatio) * 100}%` }}
              className="flex flex-col min-w-0 min-h-0 border-l border-gray-100"
            >
              <BrowserPanel
                initialMode={browserMode}
                onClose={closeBrowser}
                onModeChange={(m: 'phone' | 'desktop') => setBrowserMode(m)}
              />
            </div>
          </>
        )}
      </div>

      <BottomPanel />
    </main>
  );
};

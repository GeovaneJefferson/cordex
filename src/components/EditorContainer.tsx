import React, { useState, useRef, useCallback } from 'react';
import { TabBar } from './TabBar';
import { SplitEditor } from './SplitEditor';
import { BottomPanel } from './BottomPanel';
import { BrowserPanel } from './BrowserPanel';
import { ChatPanel } from './ChatPanel';
import { LocalHistoryPanel } from './LocalHistoryPanel';
import { useAppState } from '../store/AppContext';
import { useAI } from '../hooks/useAI';
import { Tab } from '../types';

const Cordex = (window as any).Cordex;

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
  // Only keep the AI methods we actually use
  const { analyzeCode, bugFixActiveTab } = useAI();

  const [docLoading,     setDocLoading]     = useState(false);
  const [improveLoading, setImproveLoading] = useState(false);
  const [bugLoading,     setBugLoading]     = useState(false);

  const [browserMode,     setBrowserMode]    = useState<'phone' | 'desktop'>('desktop');
  const [rightPanelWidth, setRightPanelWidth] = useState(350);
  const [isDraggingResizer, setIsDraggingResizer] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging     = useRef(false);

  const toggleBrowser = () => {
    if (!state.browserVisible && state.chatVisible) dispatch({ type: 'TOGGLE_CHAT_PANEL' });
    if (!state.browserVisible && state.historyPanelVisible) dispatch({ type: 'TOGGLE_HISTORY_PANEL' });
    dispatch({ type: 'TOGGLE_BROWSER' });
  };

  const handleChat = () => {
    if (!state.chatVisible && state.browserVisible) dispatch({ type: 'TOGGLE_BROWSER' });
    if (!state.chatVisible && state.historyPanelVisible) dispatch({ type: 'TOGGLE_HISTORY_PANEL' });
    dispatch({ type: 'TOGGLE_CHAT_PANEL' });
  };

  const handleHistory = () => {
    if (!state.historyPanelVisible && state.browserVisible) dispatch({ type: 'TOGGLE_BROWSER' });
    if (!state.historyPanelVisible && state.chatVisible) dispatch({ type: 'TOGGLE_CHAT_PANEL' });
    dispatch({ type: 'TOGGLE_HISTORY_PANEL' });
  };

  const onDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    setIsDraggingResizer(true);
    const startX = e.clientX;
    const startWidth = rightPanelWidth;

    const onMove = (mv: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const dx = startX - mv.clientX;
      const newWidth = Math.min(600, Math.max(250, startWidth + dx));
      setRightPanelWidth(newWidth);
    };
    const onUp = () => {
      dragging.current = false;
      setIsDraggingResizer(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const activeTab = state.tabs.find((t: Tab) => t.id === state.activeTabId);

  // ── Documentation button: AI‑powered full project doc generator ──────
  const handleDoc = async () => {
    if (!state.projectRoot) return;
    setDocLoading(true);
    try {
      const res = await Cordex.ai.documentProject(state.projectRoot, state.aiSettings.analyze);
      if (res.ok) {
        // Refresh the file tree so PROJECT_DOCS.md appears
        const result = await Cordex.fs.readDir(state.projectRoot);
        if (result?.ok) dispatch({ type: 'SET_FILE_TREE', tree: result.tree });
      } else {
        alert('Documentation generation failed: ' + res.error);
      }
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setDocLoading(false);
    }
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
    const exists = state.tabs.find((t: Tab) => t.id === flowId);
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
      <header className="h-11 border-b border-gray-100 flex items-center px-3 gap-2 flex-shrink-0 bg-white">
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <PreviewBtn
            icon="public"
            title="Browser preview — localhost:8081"
            active={state.browserVisible}
            onClick={toggleBrowser}
          />
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <AIBtn icon="description"      label="Documentation" dark  title="Generate full project docs" shortcut="Ctrl+D" loading={docLoading}     onClick={handleDoc} />
          <AIBtn icon="auto_awesome"     label="Improve"             title="Analyze & improve"          shortcut="Ctrl+I" loading={improveLoading} onClick={handleImprove} />
          <AIBtn icon="medical_services" label="Bug Fix"             title="AI bug fix"                 shortcut="Ctrl+B" loading={bugLoading}     onClick={handleBugFix} />
          <AIBtn icon="account_tree"     label="Flow"                title="Code flow diagram"                                                     onClick={handleFlow} />
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <AIBtn icon="history"          label="History"             title="Local file history"         active={state.historyPanelVisible}           onClick={handleHistory} />
          <AIBtn icon="forum"            label="Chat"                title="Open AI Chat"               active={state.chatVisible}                   onClick={handleChat} />
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <button title="AI Settings (Ctrl+,)" onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
            <span className="material-symbols-outlined text-[16px]">settings</span>
          </button>
        </div>
      </header>

      <TabBar />

      <div ref={containerRef} className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          <SplitEditor />
          {isDraggingResizer && (
            <div
              style={{
                position: 'absolute', inset: 0, zIndex: 99,
                cursor: 'col-resize',
              }}
            />
          )}
        </div>

        <div
          style={{
            width: (state.browserVisible || state.chatVisible || state.historyPanelVisible) ? rightPanelWidth : 0,
            flexShrink: 0,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            transition: 'width 180ms ease',
          }}
        >
          {(state.browserVisible || state.chatVisible || state.historyPanelVisible) && (
            <div
              onMouseDown={onDivider}
              style={{
                position: 'absolute',
                left: -4, top: 0, bottom: 0,
                width: 4,
                cursor: 'col-resize',
                background: '#e2e8f0',
                transition: 'background 0.15s',
                zIndex: 10,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f97316')}
              onMouseLeave={e => (e.currentTarget.style.background = '#e2e8f0')}
            />
          )}

          <div style={{ height: '100%', display: state.browserVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <BrowserPanel
              mode={browserMode}
              onModeChange={setBrowserMode}
              visible={state.browserVisible}
              onClose={() => dispatch({ type: 'TOGGLE_BROWSER' })}
            />
          </div>

          <div style={{ height: '100%', display: state.chatVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <ChatPanel />
          </div>

          <div style={{ height: '100%', display: state.historyPanelVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <LocalHistoryPanel onClose={() => dispatch({ type: 'TOGGLE_HISTORY_PANEL' })} />
          </div>
        </div>
      </div>

      <BottomPanel />
    </main>
  );
};
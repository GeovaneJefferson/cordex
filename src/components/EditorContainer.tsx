import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TabBar } from './TabBar';
import { SplitEditor } from './SplitEditor';
import { BottomPanel } from './BottomPanel';
import { BrowserPanel } from './BrowserPanel';
import { AndroidEmulatorPanel } from './AndroidEmulatorPanel';
import { CustomActionsPanel } from './CustomActionsPanel';
import { ChatPanel } from './ChatPanel';
import { LocalHistoryPanel } from './LocalHistoryPanel';
import { AgentPopover } from './AgentPopover';
import { useAI } from '../hooks/useAI';
import { Tab } from '../types';
import { useAppState } from '../store/AppContext';

const Cordex = (window as any).Cordex;

const AIBtn: React.FC<{
  icon: string; label?: string; dark?: boolean;
  loading?: boolean; onClick?: () => void; title: string; shortcut?: string;
  active?: boolean; iconStyle?: React.CSSProperties; hasSelection?: boolean; selectionPreview?: string;
}> = ({ icon, label, dark, loading, onClick, title, shortcut, active, iconStyle, hasSelection, selectionPreview }) => {
  const btnTitle = `${title}${shortcut ? ` (${shortcut})` : ''}${hasSelection ? ' — using selected code' : ''}`;
  return (
    <div style={{ position: 'relative' }}>
      <button title={btnTitle} onClick={onClick} disabled={loading}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-medium
          transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-95
          ${dark
            ? 'bg-gray-900 text-white hover:bg-gray-700'
            : active || hasSelection
              ? 'bg-orange-50 text-orange-600 border border-orange-200 hover:bg-orange-100'
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:border-gray-300'
          }`}
        style={
          dark
            ? { backgroundColor: 'var(--gray-900)', color: 'white' }
            : active || hasSelection
              ? {
                  backgroundColor: 'var(--accent-light)',
                  color: 'var(--accent)',
                  borderColor: 'var(--accent-border)',
                }
              : {
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  borderColor: 'var(--border-color)',
                }
        }
      >
        <span
          className={`material-symbols-outlined text-[14px] ${loading ? 'animate-spin' : ''}`}
          style={iconStyle}
        >
          {loading ? 'autorenew' : icon}
        </span>
        {label}
      </button>
      {hasSelection && (
        <span style={{
          position: 'absolute', top: -4, right: -4,
          width: 16, height: 16, background: 'var(--success)', borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontSize: '10px', fontWeight: 'bold', border: '2px solid var(--bg-primary)'
        }} title={`Selection active: ${selectionPreview}`}>✓</span>
      )}
    </div>
  );
};

const PreviewBtn: React.FC<{
  icon: string; title: string; active?: boolean; onClick: () => void;
}> = ({ icon, title, active, onClick }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 7,
      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-color)'}`,
      background: active ? 'var(--accent-light)' : 'var(--bg-primary)',
      color: active ? 'var(--accent-hover)' : 'var(--text-muted)',
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
  const { analyzeCode, bugFixActiveTab, improveActiveTab } = useAI();

  const [docLoading,     setDocLoading]     = useState(false);
  const [improveLoading, setImproveLoading] = useState(false);
  const [bugLoading,     setBugLoading]     = useState(false);
  const [selectionInfo, setSelectionInfo] = useState<{ hasSelection: boolean; preview: string; lineCount: number }>({ hasSelection: false, preview: '', lineCount: 0 });

  const [browserMode,       setBrowserMode]      = useState<'phone' | 'desktop'>('desktop');
  const [emulatorVisible,   setEmulatorVisible]  = useState(false);
  const [actionsVisible,    setActionsVisible]    = useState(false);
  const [rightPanelWidth, setRightPanelWidth] = useState(350);
  const [isDraggingResizer, setIsDraggingResizer] = useState(false);
  const containerRef  = useRef<HTMLDivElement>(null);

  // ── Stable selection polling (NO BLINKING) ─────────────────
  const prevInfoRef = useRef<typeof selectionInfo>(selectionInfo);

  useEffect(() => {
    const id = setInterval(() => {
      const info = (window as any).__cordexGetSelectionInfo?.();
      if (!info) {
        if (prevInfoRef.current.hasSelection) {
          setSelectionInfo({ hasSelection: false, preview: '', lineCount: 0 });
          prevInfoRef.current = { hasSelection: false, preview: '', lineCount: 0 };
        }
        return;
      }
      if (
        info.hasSelection !== prevInfoRef.current.hasSelection ||
        info.preview !== prevInfoRef.current.preview ||
        info.lineCount !== prevInfoRef.current.lineCount
      ) {
        setSelectionInfo(info);
        prevInfoRef.current = info;
      }
    }, 100);
    return () => clearInterval(id);
  }, []);

  // ── Expose panel openers globally ──
  useEffect(() => {
    (window as any).__cordexOpenEmulator = () => {
      if (emulatorVisible) {
        setEmulatorVisible(false);
      } else {
        setEmulatorVisible(true);
        setActionsVisible(false);
        if (state.browserVisible) dispatch({ type: 'TOGGLE_BROWSER' });
        if (state.chatVisible)    dispatch({ type: 'TOGGLE_CHAT_PANEL' });
      }
    };
    (window as any).__cordexOpenActions = () => {
      if (actionsVisible) {
        setActionsVisible(false);
      } else {
        setActionsVisible(true);
        setEmulatorVisible(false);
        if (state.browserVisible) dispatch({ type: 'TOGGLE_BROWSER' });
        if (state.chatVisible)    dispatch({ type: 'TOGGLE_CHAT_PANEL' });
      }
    };
    (window as any).__cordexToggleBrowser = () => {
      if (!state.browserVisible && state.chatVisible) dispatch({ type: 'TOGGLE_CHAT_PANEL' });
      if (!state.browserVisible && state.historyPanelVisible) dispatch({ type: 'TOGGLE_HISTORY_PANEL' });
      dispatch({ type: 'TOGGLE_BROWSER' });
    };
    (window as any).__cordexGetPanelState = () => ({
      emulatorVisible,
      actionsVisible,
      browserVisible: state.browserVisible,
      chatVisible: state.chatVisible,
      historyPanelVisible: state.historyPanelVisible,
    });
    (window as any).__cordexGetTabContent = (tabId: string) => {
      const t = state.tabs.find((tab: Tab) => tab.id === tabId);
      return t?.content ?? null;
    };
  }, [emulatorVisible, actionsVisible, state.browserVisible, state.chatVisible, state.historyPanelVisible, dispatch]);

  const resizerRef    = useRef<HTMLDivElement>(null);

  const rightPanelWidthRef = useRef(350);
  useEffect(() => { rightPanelWidthRef.current = rightPanelWidth; }, [rightPanelWidth]);

  const rightPanelVisible = state.browserVisible || state.chatVisible || state.historyPanelVisible || emulatorVisible || actionsVisible;

  useEffect(() => {
    const el = resizerRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = rightPanelWidthRef.current;
      const onMove = (mv: PointerEvent) => {
        const w = Math.min(700, Math.max(260, startW - (mv.clientX - startX)));
        setRightPanelWidth(w);
        rightPanelWidthRef.current = w;
      };
      const onUp = () => {
        setIsDraggingResizer(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      setIsDraggingResizer(true);
      el.setPointerCapture?.(e.pointerId);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [rightPanelVisible]);

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

  const activeTab = state.tabs.find((t: Tab) => t.id === state.activeTabId);

  const handleDoc = async () => {
    if (!state.projectRoot) return;
    setDocLoading(true);
    try {
      const res = await Cordex.ai.documentProject(state.projectRoot, state.aiSettings.analyze);
      if (res.ok) {
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
    try { await improveActiveTab(); }
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
        content: activeTab.content,
        language: activeTab.language,
        isDirty: false,
        tabType: 'flow',
        flowSourceTabId: activeTab.id,
        projectRoot: (activeTab as any).projectRoot ?? null,
        fileHash: activeTab.fileHash,
      },
    });
  }, [activeTab, state.tabs, dispatch]);

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="h-11 border-b flex items-center px-3 gap-2 flex-shrink-0"
        style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-primary)' }}>
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
          <AIBtn icon="auto_awesome"     label="Improve"             title="Analyze & improve"          shortcut="Ctrl+I" loading={improveLoading} onClick={handleImprove} hasSelection={selectionInfo.hasSelection} selectionPreview={selectionInfo.preview} />
          <AIBtn icon="medical_services" label="Bug Fix"             title="AI bug fix"                 shortcut="Ctrl+B" loading={bugLoading}     onClick={handleBugFix} hasSelection={selectionInfo.hasSelection} selectionPreview={selectionInfo.preview} />
          <AgentPopover />
          <AIBtn icon="account_tree"     label="Flow"                title="Code flow diagram"                                                     onClick={handleFlow} />
          <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border-color)' }} />
          <AIBtn icon="history"          label="History"             title="Local file history"         active={state.historyPanelVisible}           onClick={handleHistory} />
          <AIBtn icon="forum"            label="Chat"                title="Open AI Chat"               active={state.chatVisible}                   onClick={handleChat} />
          <div className="w-px h-4 mx-0.5" style={{ backgroundColor: 'var(--border-color)' }} />
          <button title="AI Settings (Ctrl+,)" onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })}
            className="p-1.5 rounded-full transition-colors"
            style={{ color: 'var(--text-muted)', ':hover': { color: 'var(--text-primary)', backgroundColor: 'var(--bg-secondary)' } }}>
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
            width: (state.browserVisible || state.chatVisible || state.historyPanelVisible || emulatorVisible || actionsVisible) ? rightPanelWidth : 0,
            flexShrink: 0,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            transition: isDraggingResizer ? 'none' : 'width 180ms ease',
          }}
        >
          {(state.browserVisible || state.chatVisible || state.historyPanelVisible || emulatorVisible || actionsVisible) && (
            <div
              ref={resizerRef}
              style={{
                position: 'absolute', left: -5, top: 0, bottom: 0, width: 10,
                cursor: 'col-resize', zIndex: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => {
                const bar = e.currentTarget.querySelector('.resizer-bar') as HTMLElement;
                if (bar) bar.style.background = 'var(--accent)';
              }}
              onMouseLeave={e => {
                const bar = e.currentTarget.querySelector('.resizer-bar') as HTMLElement;
                if (bar) bar.style.background = 'var(--border-color)';
              }}
            >
              <div
                className="resizer-bar"
                style={{
                  width: 3, height: '100%',
                  background: 'var(--border-color)',
                  transition: 'background 0.15s',
                  borderRadius: 2,
                }}
              />
            </div>
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

          <div style={{ height: '100%', display: emulatorVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <AndroidEmulatorPanel
              visible={emulatorVisible}
              onClose={() => setEmulatorVisible(false)}
            />
          </div>

          <div style={{ height: '100%', display: actionsVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <CustomActionsPanel
              projectRoot={state.projectRoot}
              onClose={() => setActionsVisible(false)}
            />
          </div>
        </div>
      </div>

      <BottomPanel />
    </main>
  );
};
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
import { CommandPalette } from './CommandPalette';
import { Tab } from '../types';
import { useAppState } from '../store/AppContext';
import { BugFloatingPanel } from './BugFloatingPanel';

const Cordex = (window as any).Cordex;

// ── Compact icon button (theme-aware) ──────────────────────────────────────
const IconBtn: React.FC<{
  icon: string; label?: string; title: string;
  onClick?: () => void; active?: boolean;
}> = ({ icon, label, title, onClick, active }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 10px', borderRadius: 9999,
      fontSize: 11.5, fontWeight: 600,
      border: `1px solid ${active ? 'var(--border-default)' : 'transparent'}`,
      backgroundColor: active ? 'var(--bg-muted)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
      cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.backgroundColor = 'var(--bg-subtle)';
      e.currentTarget.style.borderColor = 'var(--border-default)';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.backgroundColor = active ? 'var(--bg-muted)' : 'transparent';
      e.currentTarget.style.borderColor = active ? 'var(--border-default)' : 'transparent';
    }}
  >
    <span className="material-symbols-outlined text-[14px]">{icon}</span>
    {label && <span>{label}</span>}
  </button>
);

// ── Browser toggle button ──────────────────────────────────────────────────
const PreviewBtn: React.FC<{ active?: boolean; onClick: () => void }> = ({ active, onClick }) => (
  <button
    title="Browser preview — localhost:8081"
    onClick={onClick}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: 7,
      border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-default)'}`,
      background: active ? 'var(--bg-muted)' : 'transparent',
      color: active ? 'var(--accent)' : 'var(--text-muted)',
      cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
    }}
  >
    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>public</span>
  </button>
);

// ── Command palette trigger (VSCode-style top search bar) ──────────────────
const CommandBar: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    title="Search files, content, and symbols (append : to go to line or @ to go to symbol)"
    style={{
      display: 'flex', alignItems: 'center', gap: 6,
      flex: '0 1 320px', maxWidth: 600, minWidth: 160,
      height: 26, borderRadius: 6,
      border: '1px solid var(--border-default)',
      background: 'var(--bg-elevated)',
      color: 'var(--text-muted)',
      cursor: 'text', padding: '0 8px',
      fontSize: 11.5, transition: 'border-color 0.15s, box-shadow 0.15s',
    }}
    onMouseEnter={e => {
      e.currentTarget.style.borderColor = 'var(--accent)';
      e.currentTarget.style.boxShadow = '0 0 0 2px var(--accent)22';
    }}
    onMouseLeave={e => {
      e.currentTarget.style.borderColor = 'var(--border-default)';
      e.currentTarget.style.boxShadow = 'none';
    }}
  >
    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>search</span>
    <span style={{ flex: 1, textAlign: 'left' }}>Search files, content, symbols...</span>
    <span style={{ fontSize: 10, opacity: 0.5, fontFamily: 'monospace' }}>Ctrl+P</span>
  </button>
);

export const EditorContainer: React.FC = () => {
  const { state, dispatch } = useAppState();

  const [browserMode, setBrowserMode] = useState<'phone' | 'desktop'>('desktop');
  const [emulatorVisible,  setEmulatorVisible]  = useState(false);
  const [actionsVisible,   setActionsVisible]    = useState(false);
  const [rightPanelWidth,  setRightPanelWidth]   = useState(350);
  const [isDraggingResizer, setIsDraggingResizer] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizerRef   = useRef<HTMLDivElement>(null);
  const rightPanelWidthRef = useRef(350);

  useEffect(() => { rightPanelWidthRef.current = rightPanelWidth; }, [rightPanelWidth]);

  // Expose panel openers globally
  useEffect(() => {
    (window as any).__cordexOpenEmulator = () => {
      if (emulatorVisible) { setEmulatorVisible(false); return; }
      setEmulatorVisible(true); setActionsVisible(false);
      if (state.browserVisible) dispatch({ type: 'TOGGLE_BROWSER' });
      if (state.chatVisible)    dispatch({ type: 'TOGGLE_CHAT_PANEL' });
    };
    (window as any).__cordexOpenActions = () => {
      if (actionsVisible) { setActionsVisible(false); return; }
      setActionsVisible(true); setEmulatorVisible(false);
      if (state.browserVisible) dispatch({ type: 'TOGGLE_BROWSER' });
      if (state.chatVisible)    dispatch({ type: 'TOGGLE_CHAT_PANEL' });
    };
    (window as any).__cordexToggleBrowser = () => {
      if (!state.browserVisible && state.chatVisible) dispatch({ type: 'TOGGLE_CHAT_PANEL' });
      if (!state.browserVisible && state.historyPanelVisible) dispatch({ type: 'TOGGLE_HISTORY_PANEL' });
      dispatch({ type: 'TOGGLE_BROWSER' });
    };
    (window as any).__cordexGetPanelState = () => ({
      emulatorVisible, actionsVisible,
      browserVisible: state.browserVisible,
      chatVisible: state.chatVisible,
      historyPanelVisible: state.historyPanelVisible,
    });
    (window as any).__cordexGetTabContent = (tabId: string) => {
      const t = state.tabs.find((tab: Tab) => tab.id === tabId);
      return t?.content ?? null;
    };
  }, [emulatorVisible, actionsVisible, state.browserVisible, state.chatVisible, state.historyPanelVisible, dispatch]);

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
    <main className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
      {/* Header / Toolbar — 3-column grid: left | center | right */}
      <header
        style={{
          height: 44, borderBottom: '1px solid var(--border-default)',
          backgroundColor: 'var(--bg-app)', display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center', padding: '0 10px', gap: 8, flexShrink: 0,
        }}
      >
        {/* Left: browser preview button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 6 }}>
          <PreviewBtn active={state.browserVisible} onClick={toggleBrowser} />
        </div>

        {/* Center: command palette — always truly centered */}
        <div>
          <CommandBar onClick={() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' })} />
        </div>

        {/* Right: Agent, Flow, | History, Chat */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <AgentPopover />
          <IconBtn icon="account_tree" label="Flow"    title="Code flow diagram"     onClick={handleFlow} />
          <div style={{ width: 1, height: 16, background: 'var(--border-default)', margin: '0 2px' }} />
          <IconBtn icon="history"      label="History" title="Local file history"     active={state.historyPanelVisible} onClick={handleHistory} />
          <IconBtn icon="forum"        label="Chat"    title="Open AI Chat"           active={state.chatVisible}         onClick={handleChat} />
        </div>
      </header>

      <TabBar />

      <div ref={containerRef} className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          <SplitEditor />
          <BugFloatingPanel />
          {isDraggingResizer && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 99, cursor: 'col-resize' }} />
          )}
        </div>

        {/* Right panel (browser / chat / history / emulator / actions) */}
        <div style={{
          width: rightPanelVisible ? rightPanelWidth : 0,
          flexShrink: 0, minHeight: 0, position: 'relative', overflow: 'hidden',
          transition: isDraggingResizer ? 'none' : 'width 180ms ease',
        }}>
          {rightPanelVisible && (
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
                if (bar) bar.style.background = 'var(--border-default)';
              }}
            >
              <div className="resizer-bar" style={{ width: 3, height: '100%', background: 'var(--border-default)', transition: 'background 0.15s', borderRadius: 2 }} />
            </div>
          )}

          <div style={{ height: '100%', display: state.browserVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <BrowserPanel mode={browserMode} onModeChange={setBrowserMode} visible={state.browserVisible} onClose={() => dispatch({ type: 'TOGGLE_BROWSER' })} />
          </div>
          <div style={{ height: '100%', display: state.chatVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <ChatPanel />
          </div>
          <div style={{ height: '100%', display: state.historyPanelVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <LocalHistoryPanel onClose={() => dispatch({ type: 'TOGGLE_HISTORY_PANEL' })} />
          </div>
          <div style={{ height: '100%', display: emulatorVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <AndroidEmulatorPanel visible={emulatorVisible} onClose={() => setEmulatorVisible(false)} />
          </div>
          <div style={{ height: '100%', display: actionsVisible ? 'flex' : 'none', flexDirection: 'column' }}>
            <CustomActionsPanel projectRoot={state.projectRoot} onClose={() => setActionsVisible(false)} />
          </div>
        </div>
      </div>

      <BottomPanel />
      {state.commandPaletteOpen && <CommandPalette />}
    </main>
  );
};

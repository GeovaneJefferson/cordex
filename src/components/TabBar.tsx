import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppState } from '../store/AppContext';
import { getFileIcon } from '../utils/fileIcons';
import { Tab } from '../types';
import { terminalService } from '../services/terminalService';

const Cordex = (window as any).Cordex;

interface TabContextMenu {
  tabId: string;
  x: number;
  y: number;
}

export const TabBar: React.FC = () => {
  const { state, dispatch } = useAppState();
  const activeTab = state.tabs.find((t: Tab) => t.id === state.activeTabId);

  const [ctxMenu,   setCtxMenu]   = useState<TabContextMenu | null>(null);
  const [dragSrc,   setDragSrc]   = useState<string | null>(null);
  const [dragOver,  setDragOver]  = useState<string | null>(null);
  const ctxRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click / escape
  useEffect(() => {
    if (!ctxMenu) return;
    const close = (e: MouseEvent) => {
      if (ctxRef.current && !ctxRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtxMenu(null); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [ctxMenu]);

  const handleRun = () => {
    if (!activeTab || activeTab.tabType === 'flow') return;

    const cmds: Record<string, string> = {
      python: `python3 "${activeTab.path}"`,
      javascript: `node "${activeTab.path}"`,
      typescript: `npx ts-node "${activeTab.path}"`,
      rust: `cargo run`,
      shell: `bash "${activeTab.path}"`,
      go: `go run "${activeTab.path}"`,
    };
    const cmd = cmds[activeTab.language] ?? `echo "Cannot run ${activeTab.language} directly"`;

    // Append a visible confirmation that the command was executed
    const fullCommand = `${cmd}; echo "--- Command finished ---"\r`;

    const send = () => {
      const termId = (window as any).__terminalId ?? 'main-terminal';
      try {
        terminalService.write(termId, fullCommand);
        console.log(`Command sent to terminal "${termId}": ${cmd}`);
      } catch (e) {
        console.error('terminalService.write failed', e);
      }
    };

    if (!state.terminalVisible) {
      dispatch({ type: 'TOGGLE_TERMINAL' });
      // Wait a bit more for the terminal panel + PTY to fully initialise
      setTimeout(send, 800);
    } else {
      send();
    }
  };

  const closeTab  = useCallback((id: string) => dispatch({ type: 'REMOVE_TAB', id }), [dispatch]);
  const closeOthers = (id: string) => {
    state.tabs.filter((t: Tab) => t.id !== id).forEach((t: Tab) => dispatch({ type: 'REMOVE_TAB', id: t.id }));
  };
  const closeAll  = () => {
    [...state.tabs].forEach((t: Tab) => dispatch({ type: 'REMOVE_TAB', id: t.id }));
  };
  const closeRight = (id: string) => {
    const idx = state.tabs.findIndex((t: Tab) => t.id === id);
    state.tabs.slice(idx + 1).forEach((t: Tab) => dispatch({ type: 'REMOVE_TAB', id: t.id }));
  };

  const copyPath = (id: string) => {
    const tab = state.tabs.find((t: Tab) => t.id === id);
    if (tab?.path) navigator.clipboard.writeText(tab.path);
  };

  const revealInExplorer = (id: string) => {
    const tab = state.tabs.find((t: Tab) => t.id === id);
    if (tab?.path) Cordex?.fs?.revealInExplorer?.(tab.path);
  };

  // ── Drag-to-reorder ──────────────────────────────────────────────────────
  const onDragStart = (e: React.DragEvent, tabId: string) => {
    setDragSrc(tabId);
    e.dataTransfer.setData('application/x-cordex-tab', tabId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    if (dragSrc && dragSrc !== tabId) setDragOver(tabId);
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const srcId = e.dataTransfer.getData('application/x-cordex-tab');
    if (!srcId || srcId === targetId) { setDragSrc(null); setDragOver(null); return; }

    if (!srcId.includes('::') && !targetId.includes('::')) {
      dispatch({ type: 'REORDER_TABS', srcId, targetId });
    }
    setDragSrc(null); setDragOver(null);
  };

  const isFlowActive = activeTab?.tabType === 'flow';

  return (
    <>
      <div className="flex h-9 border-b border-gray-100 flex-shrink-0" style={{ background: 'var(--tabbar-bg)' }}>
        {/* Scrollable tabs */}
        <div className="flex flex-1 overflow-x-auto hide-scrollbar">
          {state.tabs.map((tab: Tab) => {
            const isActive = tab.id === state.activeTabId;
            const isSplit  = tab.id === state.splitTabId;
            const isFlow   = tab.tabType === 'flow';
            const isDrop   = dragOver === tab.id;
            const { icon, color } = isFlow
              ? { icon: 'account_tree', color: 'text-orange-500' }
              : getFileIcon(tab.name);

            return (
              <div
                key={tab.id}
                draggable
                onDragStart={e => onDragStart(e, tab.id)}
                onDragOver={e => onDragOver(e, tab.id)}
                onDragLeave={() => setDragOver(null)}
                onDrop={e => onDrop(e, tab.id)}
                onDragEnd={() => { setDragSrc(null); setDragOver(null); }}
                onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', id: tab.id })}
                onAuxClick={e => { if (e.button === 1) { e.preventDefault(); closeTab(tab.id); } }}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ tabId: tab.id, x: e.clientX, y: e.clientY }); }}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 min-w-[100px] max-w-[200px]
                  border-r border-gray-100 cursor-pointer select-none flex-shrink-0 group transition-colors duration-100
                  ${isActive ? 'bg-white' : 'hover:bg-gray-100 text-gray-500'}
                  ${isDrop ? 'border-l-2 border-l-orange-400' : ''}`}
              >
                {isActive && <span className={`absolute top-0 left-0 right-0 h-[2px] rounded-b-sm ${isFlow ? 'bg-orange-400' : 'bg-orange-500'}`} />}
                {isSplit && !isActive && <span className="absolute top-0 left-0 right-0 h-[2px] bg-blue-400 rounded-b-sm" />}

                <span className={`material-symbols-outlined text-[13px] flex-shrink-0 ${color}`}>{icon}</span>
                <span className={`text-[12px] truncate flex-1 ${isActive ? 'text-gray-800 font-medium' : ''}`}>{tab.name}</span>

                <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {tab.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 group-hover:hidden" />}
                  <button
                    onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                    className={`${tab.isDirty ? 'hidden group-hover:flex' : 'opacity-0 group-hover:opacity-100'}
                      items-center justify-center w-4 h-4 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded transition-all`}
                  >
                    <span className="material-symbols-outlined text-[12px]">close</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right actions */}
        {state.tabs.length > 0 && (
          <div className="flex items-center px-2 gap-1 flex-shrink-0 border-l border-gray-100">
            <button title="Split right (Ctrl+\)"
              onClick={() => {
                if (state.splitTabId) dispatch({ type: 'SET_SPLIT_TAB', tabId: null });
                else {
                  const other = state.tabs.find((t: Tab) => t.id !== state.activeTabId);
                  if (other) dispatch({ type: 'SET_SPLIT_TAB', tabId: other.id });
                }
              }}
              className={`p-1.5 rounded transition-all ${state.splitTabId ? 'text-orange-500 bg-orange-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
              <span className="material-symbols-outlined text-[16px]">vertical_split</span>
            </button>
            <div className="w-px h-4 bg-gray-200" />
            <button title="Run file" onClick={handleRun} disabled={!activeTab || isFlowActive}
              className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 transition-all text-[11px] font-semibold">
              <span className="material-symbols-outlined text-[15px]">play_arrow</span>
              Run
            </button>
          </div>
        )}
      </div>

      {/* ── Tab context menu (unchanged) ────────────────────────────────────── */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setCtxMenu(null)} />
          <div
            ref={ctxRef}
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 200),
              top:  Math.min(ctxMenu.y, window.innerHeight - 260),
              animation: 'slideUp 100ms cubic-bezier(0.4,0,0.2,1)',
            }}
            className="fixed z-[200] bg-white border border-gray-200 rounded-lg shadow-2xl py-1 w-52 text-[12px] font-medium text-gray-700 select-none"
          >
            {(() => {
              const tab = state.tabs.find((t: Tab) => t.id === ctxMenu.tabId);
              const idx = state.tabs.findIndex((t: Tab) => t.id === ctxMenu.tabId);
              return (
                <>
                  <CtxItem icon="close" label="Close" shortcut="Ctrl+W"
                    onClick={() => { closeTab(ctxMenu.tabId); setCtxMenu(null); }} />
                  <CtxItem icon="tab_close" label="Close Others"
                    onClick={() => { closeOthers(ctxMenu.tabId); setCtxMenu(null); }} />
                  <CtxItem icon="keyboard_tab_rtl" label="Close to the Right" disabled={idx === state.tabs.length - 1}
                    onClick={() => { closeRight(ctxMenu.tabId); setCtxMenu(null); }} />
                  <CtxItem icon="close_fullscreen" label="Close All"
                    onClick={() => { closeAll(); setCtxMenu(null); }} />
                  <div className="h-px bg-gray-100 my-1" />
                  {tab?.path && !tab.path.startsWith('flow::') && (
                    <>
                      <CtxItem icon="content_copy" label="Copy Path"
                        onClick={() => { copyPath(ctxMenu.tabId); setCtxMenu(null); }} />
                      <CtxItem icon="folder_open" label="Reveal in Explorer"
                        onClick={() => { revealInExplorer(ctxMenu.tabId); setCtxMenu(null); }} />
                      <div className="h-px bg-gray-100 my-1" />
                    </>
                  )}
                  <CtxItem icon="vertical_split" label="Open to the Side"
                    onClick={() => { dispatch({ type: 'SET_SPLIT_TAB', tabId: ctxMenu.tabId }); setCtxMenu(null); }} />
                </>
              );
            })()}
          </div>
        </>
      )}
    </>
  );
};

const CtxItem: React.FC<{ icon: string; label: string; onClick: () => void; shortcut?: string; disabled?: boolean; danger?: boolean }> = ({ icon, label, onClick, shortcut, disabled, danger }) => (
  <button
    onClick={disabled ? undefined : onClick}
    className={`w-full flex items-center gap-2 px-3 py-1.5 transition-colors duration-100
      ${disabled ? 'opacity-40 cursor-default' : danger ? 'text-red-600 hover:bg-red-50' : 'hover:bg-gray-50 cursor-pointer'}`}
  >
    <span className={`material-symbols-outlined text-[14px] ${danger ? 'text-red-500' : 'text-gray-400'}`}>{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {shortcut && <span className="text-[10px] text-gray-400 ml-2">{shortcut}</span>}
  </button>
);
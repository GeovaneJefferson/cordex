import React, { useRef, useState, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { CodeEditor } from './CodeEditor';
import { FlowView } from './FlowView';
import { Tab } from '../types';   

const PaneContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state } = useAppState();
  const tab = state.tabs.find((t: Tab) => t.id === tabId);
  if (!tab) return null;
  if (tab.tabType === 'flow') return <FlowView flowTab={tab} />;
  return <CodeEditor tabId={tabId} />;
};

type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null;

// VSCode-style drop zones that appear while dragging over a pane
const DropZoneOverlay: React.FC<{ zone: DropZone; onDrop: (zone: DropZone, tabId: string) => void }> = ({ zone, onDrop }) => {
  const zones: { id: DropZone; style: React.CSSProperties; label: string }[] = [
    { id: 'left',   label: 'left',   style: { left: 0,    top: '25%',  width: '25%',  height: '50%' } },
    { id: 'right',  label: 'right',  style: { right: 0,   top: '25%',  width: '25%',  height: '50%' } },
    { id: 'top',    label: 'top',    style: { top: 0,     left: '25%', width: '50%',  height: '25%' } },
    { id: 'bottom', label: 'bottom', style: { bottom: 0,  left: '25%', width: '50%',  height: '25%' } },
    { id: 'center', label: 'open',   style: { top: '25%', left: '25%', width: '50%',  height: '50%' } },
  ];

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      {zones.map(z => (
        <div
          key={z.id}
          className="absolute pointer-events-auto flex items-center justify-center"
          style={z.style}
          onDragEnter={e => e.preventDefault()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const tabId = e.dataTransfer.getData('application/x-cordex-tab');
            if (tabId) onDrop(z.id, tabId);
          }}
        >
          <div className={`rounded-lg border-2 transition-all duration-100 flex items-center justify-center
            ${zone === z.id
              ? 'bg-blue-500/20 border-blue-500 scale-105'
              : 'bg-white/80 border-gray-300 hover:bg-blue-50 hover:border-blue-400'
            }`}
            style={{ width: 52, height: 44 }}
          >
            <span className="material-symbols-outlined text-[18px] text-blue-500">
              {z.id === 'left' ? 'vertical_split' : z.id === 'right' ? 'vertical_split' : z.id === 'center' ? 'tab' : 'horizontal_split'}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const SplitEditor: React.FC = () => {
  const { state, dispatch } = useAppState();
  const activeTab = state.tabs.find((t: Tab) => t.id === state.activeTabId);
  const splitTab  = state.tabs.find((t: Tab) => t.id === state.splitTabId);

  const containerRef  = useRef<HTMLDivElement>(null);
  const [splitRatio,  setSplitRatio]  = useState(0.5);
  const [splitDir,    setSplitDir]    = useState<'horizontal' | 'vertical'>('horizontal');
  const [draggingOver, setDraggingOver] = useState(false);
  const [hoverZone,   setHoverZone]   = useState<DropZone>(null);
  const resizeDragging = useRef(false);

  // ── Resize divider ─────────────────────────────────────────────────────────
  const onDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeDragging.current = true;
    const onMove = (mv: MouseEvent) => {
      if (!resizeDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (splitDir === 'horizontal') {
        setSplitRatio(Math.min(0.8, Math.max(0.2, (mv.clientX - rect.left) / rect.width)));
      } else {
        setSplitRatio(Math.min(0.8, Math.max(0.2, (mv.clientY - rect.top) / rect.height)));
      }
    };
    const onUp = () => {
      resizeDragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Drop handler from zone overlay ────────────────────────────────────────
  const handleZoneDrop = useCallback((zone: DropZone, tabId: string) => {
    setDraggingOver(false);
    setHoverZone(null);
    if (!zone || zone === 'center') {
      dispatch({ type: 'SET_ACTIVE_TAB', id: tabId });
    } else if (zone === 'right' || zone === 'bottom') {
      setSplitDir(zone === 'right' ? 'horizontal' : 'vertical');
      dispatch({ type: 'SET_SPLIT_TAB', tabId });
    } else if (zone === 'left' || zone === 'top') {
      // Move current to split, new tab becomes primary
      setSplitDir(zone === 'left' ? 'horizontal' : 'vertical');
      if (state.activeTabId) dispatch({ type: 'SET_SPLIT_TAB', tabId: state.activeTabId });
      dispatch({ type: 'SET_ACTIVE_TAB', id: tabId });
    }
  }, [dispatch, state.activeTabId]);

  const hasSplit   = !!splitTab;
  const isVertical = splitDir === 'vertical';

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex overflow-hidden min-h-0 ${isVertical ? 'flex-col' : 'flex-row'}`}
    >
      {/* ── Primary pane ──────────────────────────────────────────────────── */}
      <div
        style={hasSplit
          ? (isVertical ? { height: `${splitRatio * 100}%` } : { width: `${splitRatio * 100}%` })
          : { flex: 1 }}
        className="flex flex-col min-w-0 min-h-0 relative"
        onDragEnter={e => { if (!hasSplit) { e.preventDefault(); setDraggingOver(true); } }}
        onDragLeave={e => { if (!hasSplit && !e.currentTarget.contains(e.relatedTarget as Node)) setDraggingOver(false); }}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {
          e.preventDefault();
          setDraggingOver(false);
          const tabId = e.dataTransfer.getData('application/x-cordex-tab');
          if (tabId) dispatch({ type: 'SET_ACTIVE_TAB', id: tabId });
        }}
      >
        {activeTab ? (
          <PaneContent tabId={activeTab.id} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 select-none bg-[#fafafa]">
            <span className="material-symbols-outlined text-[52px] mb-2">code</span>
            <p className="text-sm">Open a file to start editing</p>
          </div>
        )}

        {/* VSCode-style drop zones — shown while dragging over pane */}
        {draggingOver && (
          <DropZoneOverlay zone={hoverZone} onDrop={handleZoneDrop} />
        )}
      </div>

      {/* ── Resize divider ────────────────────────────────────────────────── */}
      {hasSplit && (
        <div
          onMouseDown={onDivider}
          className={`flex-shrink-0 bg-gray-100 hover:bg-orange-400 transition-colors duration-150
            ${isVertical ? 'h-[3px] cursor-row-resize w-full' : 'w-[3px] cursor-col-resize h-full'}`}
        />
      )}

      {/* ── Secondary pane ────────────────────────────────────────────────── */}
      {hasSplit && (
        <div
          style={isVertical ? { height: `${(1 - splitRatio) * 100}%` } : { width: `${(1 - splitRatio) * 100}%` }}
          className="flex flex-col min-w-0 min-h-0 border-l border-gray-100"
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const tabId = e.dataTransfer.getData('application/x-cordex-tab');
            if (tabId) dispatch({ type: 'SET_SPLIT_TAB', tabId });
          }}
        >
          <div className="h-8 flex items-center px-2 border-b border-gray-100 bg-gray-50 gap-2 flex-shrink-0">
            <span className="material-symbols-outlined text-[14px] text-gray-400">
              {splitTab?.tabType === 'flow' ? 'account_tree' : 'description'}
            </span>
            <span className="text-[12px] text-gray-600 flex-1 truncate">{splitTab.name}</span>
            <button onClick={() => dispatch({ type: 'SET_SPLIT_TAB', tabId: null })}
              className="p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors">
              <span className="material-symbols-outlined text-[14px]">close</span>
            </button>
          </div>
          <PaneContent tabId={splitTab.id} />
        </div>
      )}
    </div>
  );
};

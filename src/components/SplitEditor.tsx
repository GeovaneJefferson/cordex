import React, { useRef, useState, useCallback, useEffect } from 'react';
import { useAppState } from '../store/AppContext';
import { useFileTree } from '../hooks/useFileTree';
import { CodeEditor } from './CodeEditor';
import { FlowView } from './FlowView';
import { Tab } from '../types';

// ── What zone the user is hovering while dragging ─────────────────────────────
type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center' | null;

// ── Pane content switcher ─────────────────────────────────────────────────────
const PaneContent: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state } = useAppState();
  const tab = state.tabs.find((t: Tab) => t.id === tabId);
  if (!tab) return null;
  return tab.tabType === 'flow' ? <FlowView flowTab={tab} /> : <CodeEditor tabId={tabId} />;
};

// ── Empty pane ────────────────────────────────────────────────────────────────
const EmptyPane: React.FC = () => (
  <div style={{
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    color: 'var(--text-muted)', userSelect: 'none',
    background: 'var(--bg-app)',
  }}>
    <span className="material-symbols-outlined" style={{ fontSize: 44, marginBottom: 8 }}>code</span>
    <p style={{ fontSize: 12 }}>Drag a file here to open</p>
  </div>
);

// ── Resizable sash ────────────────────────────────────────────────────────────
const Sash: React.FC<{ vertical: boolean; onDrag: (d: number) => void }> = ({ vertical, onDrag }) => {
  const down = (e: React.MouseEvent) => {
    e.preventDefault();
    const start = vertical ? e.clientX : e.clientY;
    const move  = (mv: MouseEvent) => onDrag(vertical ? mv.clientX - start : mv.clientY - start);
    const up    = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div
      onMouseDown={down}
      style={{
        flexShrink: 0, zIndex: 10, position: 'relative',
        [vertical ? 'width' : 'height']: 5,
        [vertical ? 'cursor' : 'cursor']: vertical ? 'col-resize' : 'row-resize',
        background: 'transparent',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e  => (e.currentTarget.style.background = 'var(--accent)')}
      onMouseLeave={e  => (e.currentTarget.style.background = 'transparent')}
    />
  );
};

// ── VSCode-style transparent drop overlay ─────────────────────────────────────
// Shown while a tab or file is being dragged over a pane.
const DropOverlay: React.FC<{ zone: DropZone }> = ({ zone }) => {
  if (!zone) return null;

  const style: React.CSSProperties = {
    position: 'absolute', zIndex: 100, pointerEvents: 'none',
    background: 'rgba(0,120,215,0.25)',
    border: '2px solid rgba(0,120,215,0.7)',
    transition: 'all 70ms ease',
    borderRadius: 3,
  };

  if (zone === 'left')   Object.assign(style, { top: 0, left: 0, width: '50%', height: '100%' });
  if (zone === 'right')  Object.assign(style, { top: 0, right: 0, left: '50%', width: '50%', height: '100%' });
  if (zone === 'top')    Object.assign(style, { top: 0, left: 0, width: '100%', height: '50%' });
  if (zone === 'bottom') Object.assign(style, { top: '50%', left: 0, width: '100%', height: '50%' });
  if (zone === 'center') Object.assign(style, { top: '4%', left: '4%', width: '92%', height: '92%' });

  return <div style={style} />;
};

// ── Hit-test: which zone is the cursor in? ───────────────────────────────────
function getZone(e: React.DragEvent, el: HTMLElement): DropZone {
  const r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  const y = (e.clientY - r.top)  / r.height;
  if (x < 0.2) return 'left';
  if (x > 0.8) return 'right';
  if (y < 0.2) return 'top';
  if (y > 0.8) return 'bottom';
  return 'center';
}

// ── Single pane wrapper — handles drag-over/drop with zone overlay ────────────
interface PaneWrapperProps {
  tabId: string | null;
  style?: React.CSSProperties;
  onDropZone: (zone: DropZone, tabId: string | null, filePath: string | null) => void;
  children?: React.ReactNode;
}

const PaneWrapper: React.FC<PaneWrapperProps> = ({ tabId, style, onDropZone, children }) => {
  const { readFile } = useFileTree();
  const [zone, setZone] = useState<DropZone>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Guard: only intercept drag events when a real Cordex drag is in progress.
  // window.__cordexDragging is set true only on TabBar/Sidebar dragStart and
  // cleared on dragEnd — so text-selection mouse drags never trigger this.
  const isCordexDrag = () => !!(window as any).__cordexDragging;

  const dragOver = (e: React.DragEvent) => {
    if (!isCordexDrag()) return;  // text selection — do nothing at all
    e.preventDefault();
    e.stopPropagation();
    if (!ref.current) return;
    const z = getZone(e, ref.current);
    if (z !== zone) setZone(z);
  };

  const dragLeave = (e: React.DragEvent) => {
    if (!zone) return;
    if (ref.current && ref.current.contains(e.relatedTarget as Node)) return;
    setZone(null);
  };

  const drop = async (e: React.DragEvent) => {
    if (!isCordexDrag()) return;
    (window as any).__cordexDragging = false;  // clear on drop
    e.preventDefault();
    e.stopPropagation();
    const dropZone = zone;
    setZone(null);

    const droppedTabId = e.dataTransfer.getData('application/x-cordex-tab');
    if (droppedTabId) { onDropZone(dropZone, droppedTabId, null); return; }

    // File tree node
    try {
      const node = JSON.parse(e.dataTransfer.getData('application/x-cordex-node'));
      if (node?.type === 'file') onDropZone(dropZone, null, node.path);
    } catch {}
  };

  return (
    <div
      ref={ref}
      style={{ ...style, position: 'relative', overflow: 'clip' }}
      onDragOver={dragOver}
      onDragLeave={dragLeave}
      onDrop={drop}
    >
      {children ?? (tabId ? <PaneContent tabId={tabId} /> : <EmptyPane />)}
      <DropOverlay zone={zone} />
    </div>
  );
};

// ── Pane mini-header (shown only on non-primary panes) ────────────────────────
const PaneTitleBar: React.FC<{ tab: Tab; onClose: () => void }> = ({ tab, onClose }) => (
  <div style={{
    height: 28, display: 'flex', alignItems: 'center', padding: '0 8px',
    borderBottom: '1px solid var(--border-default)',
    background: 'var(--bg-elevated)',
    gap: 6, flexShrink: 0,
  }}>
    <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
      {tab.tabType === 'flow' ? 'account_tree' : 'description'}
    </span>
    <span style={{ fontSize: 11.5, color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {tab.name}{tab.isDirty ? ' ●' : ''}
    </span>
    <button
      title="Close pane"
      onClick={onClose}
      style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, borderRadius: 4 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
    </button>
  </div>
);

// ── Pane slot — shows titlebar if split pane, just content if primary ─────────
const PaneSlot: React.FC<{ tabId: string | null; isPrimary?: boolean; onClose?: () => void }> = ({ tabId, isPrimary, onClose }) => {
  const { state } = useAppState();
  const tab = tabId ? state.tabs.find((t: Tab) => t.id === tabId) ?? null : null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      {!isPrimary && tab && onClose && <PaneTitleBar tab={tab} onClose={onClose} />}
      {tabId ? <PaneContent tabId={tabId} /> : <EmptyPane />}
    </div>
  );
};

// ── Main SplitEditor ──────────────────────────────────────────────────────────
// Clear cordex drag flag on dragend (no capture-phase listeners — those interfere with Monaco)
if (typeof window !== 'undefined') {
  document.addEventListener('dragend', () => { (window as any).__cordexDragging = false; });
  document.addEventListener('drop',    () => { (window as any).__cordexDragging = false; });
}

export const SplitEditor: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { readFile } = useFileTree();
  const containerRef = useRef<HTMLDivElement>(null);

  // Sash ratios (0.0–1.0)
  const [ratioH, setRatioH] = useState(0.5);
  const [ratioV, setRatioV] = useState(0.5);

  const { splitMode } = state;
  const primaryId  = state.activeTabId;
  const splitId    = state.splitTabId;
  const splitId2   = state.splitTabId2;
  const splitId3   = state.splitTabId3;

  const dragH = useCallback((d: number) => {
    if (!containerRef.current) return;
    setRatioH(r => Math.min(0.8, Math.max(0.2, r + d / containerRef.current!.getBoundingClientRect().width)));
  }, []);
  const dragV = useCallback((d: number) => {
    if (!containerRef.current) return;
    setRatioV(r => Math.min(0.8, Math.max(0.2, r + d / containerRef.current!.getBoundingClientRect().height)));
  }, []);

  // ── Handle a drop onto any pane with a zone ───────────────────────────────
  const handleDrop = useCallback(async (
    zone: DropZone,
    targetPane: 'primary' | 'split' | 'split2' | 'split3',
    droppedTabId: string | null,
    droppedFilePath: string | null
  ) => {
    // Resolve what tab we're placing
    let tabId = droppedTabId;
    if (!tabId && droppedFilePath) {
      // Open the file first to get a tab ID
      await readFile(droppedFilePath);
      // readFile sets activeTabId, give state a tick to update
      await new Promise(r => setTimeout(r, 50));
      tabId = (window as any).__cordexLastOpenedTabId ?? droppedFilePath;
    }
    if (!tabId) return;

    if (zone === 'center') {
      // Just switch the pane to this tab
      if (targetPane === 'primary') { dispatch({ type: 'SET_ACTIVE_TAB', id: tabId }); return; }
      const modeNow = state.splitMode === 'none' ? 'horizontal' : state.splitMode;
      const ids = [state.splitTabId ?? null, state.splitTabId2 ?? null, state.splitTabId3 ?? null];
      if (targetPane === 'split')  ids[0] = tabId;
      if (targetPane === 'split2') ids[1] = tabId;
      if (targetPane === 'split3') ids[2] = tabId;
      dispatch({ type: 'SET_SPLIT_MODE', mode: modeNow, tabIds: ids });
      return;
    }

    // Zone-based splits — create a new split pane with the dropped tab
    if (zone === 'right') {
      dispatch({ type: 'SET_SPLIT_MODE', mode: 'horizontal', tabIds: [tabId, null, null] });
    } else if (zone === 'left') {
      // Make the dropped file active, move current to split
      const curPrimary = state.activeTabId;
      dispatch({ type: 'SET_ACTIVE_TAB', id: tabId });
      dispatch({ type: 'SET_SPLIT_MODE', mode: 'horizontal', tabIds: [curPrimary, null, null] });
    } else if (zone === 'bottom') {
      dispatch({ type: 'SET_SPLIT_MODE', mode: 'vertical', tabIds: [tabId, null, null] });
    } else if (zone === 'top') {
      const curPrimary = state.activeTabId;
      dispatch({ type: 'SET_ACTIVE_TAB', id: tabId });
      dispatch({ type: 'SET_SPLIT_MODE', mode: 'vertical', tabIds: [curPrimary, null, null] });
    }
  }, [state, dispatch, readFile]);

  const closePane = (which: 'split' | 'split2' | 'split3') => {
    const ids: [string | null, string | null, string | null] = [
      state.splitTabId ?? null,
      state.splitTabId2 ?? null,
      state.splitTabId3 ?? null,
    ];
    if (which === 'split')  ids[0] = null;
    if (which === 'split2') ids[1] = null;
    if (which === 'split3') ids[2] = null;
    const remaining = ids.filter(Boolean).length;
    dispatch({ type: 'SET_SPLIT_MODE', mode: remaining === 0 ? 'none' : state.splitMode, tabIds: ids });
  };

  const noSplit = splitMode === 'none' || !splitId;

  // ── Single-pane (no split) ────────────────────────────────────────────────
  if (noSplit) {
    return (
      <PaneWrapper
        tabId={primaryId}
        style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
        onDropZone={(zone, tabId, fp) => handleDrop(zone, 'primary', tabId, fp)}
      >
        {primaryId ? <PaneContent tabId={primaryId} /> : <EmptyPane />}
      </PaneWrapper>
    );
  }

  // ── Horizontal split (left | right) ──────────────────────────────────────
  if (splitMode === 'horizontal') {
    return (
      <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0, overflow: 'hidden' }}>
        <PaneWrapper
          tabId={primaryId}
          style={{ width: `${ratioH * 100}%`, display: 'flex', flexDirection: 'column', minWidth: 0 }}
          onDropZone={(z, t, f) => handleDrop(z, 'primary', t, f)}
        >
          {primaryId ? <PaneContent tabId={primaryId} /> : <EmptyPane />}
        </PaneWrapper>

        <Sash vertical onDrag={dragH} />

        <PaneWrapper
          tabId={splitId}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
          onDropZone={(z, t, f) => handleDrop(z, 'split', t, f)}
        >
          {splitId ? (
            <>
              <PaneTitleBar
                tab={state.tabs.find((t: Tab) => t.id === splitId)!}
                onClose={() => closePane('split')}
              />
              <PaneContent tabId={splitId} />
            </>
          ) : <EmptyPane />}
        </PaneWrapper>
      </div>
    );
  }

  // ── Vertical split (top / bottom) ────────────────────────────────────────
  if (splitMode === 'vertical') {
    return (
      <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <PaneWrapper
          tabId={primaryId}
          style={{ height: `${ratioV * 100}%`, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          onDropZone={(z, t, f) => handleDrop(z, 'primary', t, f)}
        >
          {primaryId ? <PaneContent tabId={primaryId} /> : <EmptyPane />}
        </PaneWrapper>

        <Sash vertical={false} onDrag={dragV} />

        <PaneWrapper
          tabId={splitId}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}
          onDropZone={(z, t, f) => handleDrop(z, 'split', t, f)}
        >
          {splitId ? (
            <>
              <PaneTitleBar
                tab={state.tabs.find((t: Tab) => t.id === splitId)!}
                onClose={() => closePane('split')}
              />
              <PaneContent tabId={splitId} />
            </>
          ) : <EmptyPane />}
        </PaneWrapper>
      </div>
    );
  }

  // ── Grid (2×2) ────────────────────────────────────────────────────────────
  if (splitMode === 'grid') {
    return (
      <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {/* Top row */}
        <div style={{ height: `${ratioV * 100}%`, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
          <PaneWrapper
            tabId={primaryId}
            style={{ width: `${ratioH * 100}%`, display: 'flex', flexDirection: 'column', minWidth: 0 }}
            onDropZone={(z, t, f) => handleDrop(z, 'primary', t, f)}
          >
            {primaryId ? <PaneContent tabId={primaryId} /> : <EmptyPane />}
          </PaneWrapper>
          <Sash vertical onDrag={dragH} />
          <PaneWrapper
            tabId={splitId}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
            onDropZone={(z, t, f) => handleDrop(z, 'split', t, f)}
          >
            {splitId ? (
              <>
                <PaneTitleBar tab={state.tabs.find((t: Tab) => t.id === splitId)!} onClose={() => closePane('split')} />
                <PaneContent tabId={splitId} />
              </>
            ) : <EmptyPane />}
          </PaneWrapper>
        </div>

        <Sash vertical={false} onDrag={dragV} />

        {/* Bottom row */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 0 }}>
          <PaneWrapper
            tabId={splitId2 ?? null}
            style={{ width: `${ratioH * 100}%`, display: 'flex', flexDirection: 'column', minWidth: 0 }}
            onDropZone={(z, t, f) => handleDrop(z, 'split2', t, f)}
          >
            {splitId2 ? (
              <>
                <PaneTitleBar tab={state.tabs.find((t: Tab) => t.id === splitId2)!} onClose={() => closePane('split2')} />
                <PaneContent tabId={splitId2} />
              </>
            ) : <EmptyPane />}
          </PaneWrapper>
          <Sash vertical onDrag={dragH} />
          <PaneWrapper
            tabId={splitId3 ?? null}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
            onDropZone={(z, t, f) => handleDrop(z, 'split3', t, f)}
          >
            {splitId3 ? (
              <>
                <PaneTitleBar tab={state.tabs.find((t: Tab) => t.id === splitId3)!} onClose={() => closePane('split3')} />
                <PaneContent tabId={splitId3} />
              </>
            ) : <EmptyPane />}
          </PaneWrapper>
        </div>
      </div>
    );
  }

  return null;
};

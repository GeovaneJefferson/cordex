import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { Terminal } from './Terminal';

type PanelTab = 'Terminal' | 'Output' | 'Problems';

interface TerminalInstanceData {
  id: string;
  name: string;
  command?: string;
}

// Monaco marker severity numbers
const SEVERITY: Record<number, { label: string; color: string; icon: string }> = {
  8: { label: 'Error',   color: '#ef4444', icon: 'error'   },
  4: { label: 'Warning', color: '#f59e0b', icon: 'warning' },
  2: { label: 'Info',    color: '#3b82f6', icon: 'info'    },
  1: { label: 'Hint',    color: '#10b981', icon: 'lightbulb' },
}

interface MarkerItem {
  message: string;
  severity: number;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  resource?: { path?: string; fsPath?: string };
  owner?: string;
}

const PANEL_MIN = 100;
const PANEL_MAX = 0.85; // fraction of window height
const PANEL_DEFAULT = 260;

export const BottomPanel: React.FC = () => {
  const { state, dispatch } = useAppState();
  const [activePanel, setActivePanel] = useState<PanelTab>('Terminal');

  // ── Resize state ──────────────────────────────────────────────────────
  const [panelHeight, setPanelHeight] = useState<number>(() => {
    const saved = localStorage.getItem('cordex:bottomPanelHeight');
    return saved ? Math.max(PANEL_MIN, parseInt(saved, 10)) : PANEL_DEFAULT;
  });
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartH.current = panelHeight;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartY.current - ev.clientY;
      const maxH = Math.floor(window.innerHeight * PANEL_MAX);
      const next = Math.min(maxH, Math.max(PANEL_MIN, dragStartH.current + delta));
      setPanelHeight(next);
    };

    const onMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setPanelHeight(h => { localStorage.setItem('cordex:bottomPanelHeight', String(h)); return h; });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [panelHeight]);

  // ── Terminal instances ────────────────────────────────────────────────
  const [terminals, setTerminals] = useState<TerminalInstanceData[]>([
    { id: 'terminal-1', name: 'bash' }
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('terminal-1');
  const terminalCounter = useRef<number>(1);
  const terminalsRef = useRef<TerminalInstanceData[]>([]);

  // ── Expose active terminal ID globally so custom actions / Android panel can use it ──
  useEffect(() => {
    (window as any).__cordexActiveTerminalId = activeTerminalId;
  }, [activeTerminalId]);

  // ── Problems: Monaco markers ──────────────────────────────────────────
  const [markers, setMarkers] = useState<MarkerItem[]>([]);

  useEffect(() => { terminalsRef.current = terminals; }, [terminals]);

  useEffect(() => {
    const handleMarkersChanged = (e: Event) => {
      const detail = (e as CustomEvent).detail as MarkerItem[];
      // Only show errors and warnings in Problems, not informational/hint markers.
      setMarkers((detail ?? []).filter(m => m.severity === 8 || m.severity === 4));
    };
    window.addEventListener('cordex:markers-changed', handleMarkersChanged);
    return () => window.removeEventListener('cordex:markers-changed', handleMarkersChanged);
  }, []);

  // Count errors/warnings for tab badge
  const errorCount   = markers.filter(m => m.severity === 8).length;
  const warningCount = markers.filter(m => m.severity === 4).length;
  // ── Listen for "run in terminal" events from Custom Actions / Android panel ──
  useEffect(() => {
    const handler = (e: Event) => {
      const { label, command } = (e as CustomEvent).detail as { label: string; command: string };

      const existing = terminalsRef.current.find(t => t.name === label && t.command === command);
      if (existing) {
        setActiveTerminalId(existing.id);
        setActivePanel('Terminal');
        setTerminals(prev => prev.map(t => t.id === existing.id ? { ...t, name: label, command } : t));
        setTimeout(() => {
          (window as any).Cordex?.terminal?.write?.(existing.id, command + '\n');
        }, 700);
        return;
      }

      terminalCounter.current += 1;
      const newId = `terminal-${terminalCounter.current}`;

      setTerminals(prev => [...prev, { id: newId, name: label, command }]);
      setActiveTerminalId(newId);
      setActivePanel('Terminal');

      // Small delay to let the PTY process start before writing
      setTimeout(() => {
        (window as any).Cordex?.terminal?.write?.(newId, command + '\n');
      }, 700);
    };
    window.addEventListener('cordex:run-in-terminal', handler);
    return () => window.removeEventListener('cordex:run-in-terminal', handler);
  }, []);

  // ── Terminal management ───────────────────────────────────────────────
  const handleAddTerminal = () => {
    terminalCounter.current += 1;
    const newId = `terminal-${terminalCounter.current}`;
    setTerminals(prev => [...prev, { id: newId, name: `bash` }]);
    setActiveTerminalId(newId);
    setActivePanel('Terminal');
  };

  const handleCloseTerminal = (e: React.MouseEvent, idToClose: string) => {
    e.stopPropagation();
    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== idToClose);
      if (activeTerminalId === idToClose && filtered.length > 0) {
        setActiveTerminalId(filtered[filtered.length - 1].id);
      } else if (filtered.length === 0) {
        terminalCounter.current += 1;
        const fallbackId = `terminal-${terminalCounter.current}`;
        setActiveTerminalId(fallbackId);
        return [{ id: fallbackId, name: 'bash' }];
      }
      return filtered;
    });
  };

  return (
    <div
      style={{
        height: state.terminalVisible ? `${panelHeight}px` : '0px',
        minHeight: state.terminalVisible ? `${PANEL_MIN}px` : '0px',
        transition: isDragging.current ? 'none' : 'height 240ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
        backgroundColor: 'var(--bg-app)',
        position: 'relative',
      }}
      className="border-t border-gray-100 flex flex-col shrink-0"
    >
      {/* ── Resize handle ─────────────────────────────────────────────── */}
      {state.terminalVisible && (
        <div
          onMouseDown={onResizeMouseDown}
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: 4, cursor: 'ns-resize', zIndex: 50,
            backgroundColor: 'transparent',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--border-default)')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
        />
      )}
      {/* HEADER */}
      <div className="h-9 flex items-center justify-between px-3 border-b border-gray-100 select-none flex-shrink-0" style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="flex items-center h-full gap-4">
          {(['Terminal', 'Output', 'Problems'] as PanelTab[]).map(tab => (
            <button key={tab} onClick={() => setActivePanel(tab)}
              className={`h-full text-[11px] font-semibold uppercase tracking-wider transition-all duration-150 rounded-sm flex items-center gap-1
                ${activePanel === tab ? 'text-gray-800 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-700'}`}>
              {tab}
              {/* Error/warning badge on Problems tab */}
              {tab === 'Problems' && (errorCount > 0 || warningCount > 0) && (
                <span className="flex items-center gap-0.5 ml-0.5">
                  {errorCount > 0 && (
                    <span style={{ fontSize: 9, background: '#ef4444', color: 'white', borderRadius: 3, padding: '0 4px', fontWeight: 700 }}>
                      {errorCount}
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span style={{ fontSize: 9, background: '#f59e0b', color: 'white', borderRadius: 3, padding: '0 4px', fontWeight: 700 }}>
                      {warningCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* TOP RIGHT ACTIONS */}
        <div className="flex items-center gap-1 text-gray-400">
          {activePanel === 'Terminal' && (
            <>
              <button onClick={handleAddTerminal} className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors" title="New Terminal">
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
              <button onClick={(e) => handleCloseTerminal(e, activeTerminalId)} className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors" title="Kill Active Terminal">
                <span className="material-symbols-outlined text-[16px]">delete</span>
              </button>
              <div className="w-px h-3 bg-gray-200 mx-1" />
            </>
          )}
          <button onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })} className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors" title="Close Panel">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-hidden relative flex flex-row">

        {/* LEFT: Terminals + other panels */}
        <div className="flex-1 relative" style={{ backgroundColor: 'var(--bg-app)' }}>

          {/* Terminal instances */}
          <div style={{ display: activePanel === 'Terminal' ? 'block' : 'none' }} className="w-full h-full absolute inset-0">
            {terminals.map(t => (
              <div
                key={t.id}
                style={{ display: activeTerminalId === t.id ? 'block' : 'none' }}
                className="w-full h-full absolute inset-0"
              >
                <Terminal id={t.id} isVisible={activeTerminalId === t.id && state.terminalVisible} />
              </div>
            ))}
          </div>

          {/* Output panel (placeholder) */}
          {activePanel === 'Output' && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm select-none">
              Output
            </div>
          )}

          {/* Problems panel */}
          {activePanel === 'Problems' && (
            <ProblemsPanel markers={markers} />
          )}
        </div>

        {/* RIGHT: Terminal tab list (only in Terminal mode) */}
        {activePanel === 'Terminal' && (
          <div className="w-48 flex-shrink-0 border-l border-gray-100 overflow-y-auto py-1 flex flex-col gap-0.5" style={{ backgroundColor: 'var(--bg-subtle)' }}>
            {terminals.map(t => (
              <TerminalRow
                key={t.id}
                terminal={t}
                isActive={activeTerminalId === t.id}
                onClick={() => setActiveTerminalId(t.id)}
                onClose={(e) => handleCloseTerminal(e, t.id)}
                onRename={(newName) => {
                  setTerminals(prev => prev.map(item =>
                    item.id === t.id ? { ...item, name: newName } : item
                  ));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ── Problems Panel ────────────────────────────────────────────────────────────
const ProblemsPanel: React.FC<{ markers: MarkerItem[] }> = ({ markers }) => {
  if (markers.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-300 select-none">
        <span className="material-symbols-outlined text-[32px]">check_circle</span>
        <span className="text-xs text-gray-400">No problems detected</span>
        <span className="text-[10px] text-gray-300">TypeScript errors and warnings appear here in real-time</span>
      </div>
    );
  }

  // Group by file
  const grouped: Record<string, MarkerItem[]> = {};
  for (const m of markers) {
    const filePath = m.resource?.fsPath ?? m.resource?.path ?? 'Unknown file';
    const short = filePath.split('/').slice(-2).join('/');
    if (!grouped[short]) grouped[short] = [];
    grouped[short].push(m);
  }

  return (
    <div className="absolute inset-0 overflow-y-auto" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
      {Object.entries(grouped).map(([file, items]) => (
        <div key={file}>
          {/* File header */}
          <div style={{
            padding: '4px 12px', fontSize: 10, fontWeight: 700, color: '#374151',
            background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', gap: 6,
            position: 'sticky', top: 0, zIndex: 1,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: '#94a3b8' }}>insert_drive_file</span>
            {file}
            <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 400, marginLeft: 'auto' }}>
              {items.length} issue{items.length !== 1 ? 's' : ''}
            </span>
          </div>
          {/* Markers */}
          {items.map((m, i) => {
            const sev = SEVERITY[m.severity] ?? SEVERITY[8];
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '5px 12px', borderBottom: '1px solid #f1f5f9',
                fontSize: 11,
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: sev.color, flexShrink: 0, marginTop: 1 }}>
                  {sev.icon}
                </span>
                <span style={{ flex: 1, color: '#1e293b', lineHeight: 1.5 }}>{m.message}</span>
                <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0, marginTop: 1 }}>
                  {m.startLineNumber}:{m.startColumn}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

// ── Terminal Row ──────────────────────────────────────────────────────────────
const TerminalRow: React.FC<{
  terminal: TerminalInstanceData;
  isActive: boolean;
  onClick: () => void;
  onClose: (e: React.MouseEvent) => void;
  onRename: (name: string) => void;
}> = ({ terminal, isActive, onClick, onClose, onRename }) => {
  const [isRenaming, setIsRenaming] = useState(false);
  const [tempName, setTempName] = useState(terminal.name);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onRename(tempName);
      setIsRenaming(false);
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setTempName(terminal.name);
    }
  };

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2 py-1.5 mx-1 rounded cursor-pointer group
        ${isActive ? 'shadow-sm border border-gray-100' : 'hover:bg-gray-100'}`}
      style={isActive ? { backgroundColor: 'var(--bg-app)' } : undefined}
    >
      <span className="material-symbols-outlined text-[13px] text-gray-400 flex-shrink-0">
        terminal
      </span>
      {isRenaming ? (
        <input
          autoFocus
          value={tempName}
          onChange={e => setTempName(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { onRename(tempName); setIsRenaming(false); }}
          onClick={e => e.stopPropagation()}
          className="flex-1 text-[11px] outline-none border border-orange-400 rounded px-1 min-w-0"
          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-primary)' , fontSize: 11 }}
        />
      ) : (
        <span
          className={`flex-1 text-[11px] truncate ${isActive ? 'text-gray-700 font-medium' : 'text-gray-500'}`}
          onDoubleClick={e => { e.stopPropagation(); setIsRenaming(true); setTempName(terminal.name); }}
          title={terminal.name}
        >
          {terminal.name}
        </span>
      )}
      <button
        onClick={onClose}
        className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
        title="Close terminal"
      >
        <span className="material-symbols-outlined text-[11px]">close</span>
      </button>
    </div>
  );
};
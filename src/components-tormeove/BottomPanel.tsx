import React, { useState, useCallback, useRef } from 'react';
import { useAppState } from '../store/AppContext';
import { useTerminal } from '../hooks/useTerminal';

let termCounter = 1;

interface TermTab { id: string; title: string; }

// One terminal instance per tab ID
const TerminalInstance: React.FC<{ id: string; cwd?: string; active: boolean }> = ({ id, cwd, active }) => {
  const { containerRef } = useTerminal({ id, cwd });
  return (
    <div
      ref={containerRef}
      style={{ display: active ? 'block' : 'none', padding: '4px 8px' }}
      className="absolute inset-0 bg-white"
    />
  );
};

type PanelTab = 'Terminal' | 'Output' | 'Problems';

export const BottomPanel: React.FC = () => {
  const { state, dispatch } = useAppState();

  const [panelTab,   setPanelTab]   = useState<PanelTab>('Terminal');
  const [termTabs,   setTermTabs]   = useState<TermTab[]>([{ id: 'terminal-1', title: 'bash' }]);
  const [activeTermId, setActiveTermId] = useState('terminal-1');

  const addTerminal = useCallback(() => {
    termCounter += 1;
    const id = `terminal-${termCounter}`;
    const tab: TermTab = { id, title: `bash` };
    setTermTabs(prev => [...prev, tab]);
    setActiveTermId(id);
    if (!state.terminalVisible) dispatch({ type: 'TOGGLE_TERMINAL' });
  }, [state.terminalVisible, dispatch]);

  const closeTerminal = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTermTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (next.length === 0) {
        dispatch({ type: 'TOGGLE_TERMINAL' });
        return [{ id: 'terminal-1', title: 'bash' }];
      }
      if (activeTermId === id) setActiveTermId(next[next.length - 1].id);
      return next;
    });
  }, [activeTermId, dispatch]);

  return (
    <div style={{
      height:    state.terminalVisible ? '260px' : '0px',
      minHeight: state.terminalVisible ? '260px' : '0px',
      transition: 'height 240ms cubic-bezier(0.4,0,0.2,1), min-height 240ms cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
    }} className="border-t border-gray-100 flex flex-col shrink-0 bg-white">

      {/* Header bar */}
      <div className="h-9 flex items-center justify-between px-3 bg-white border-b border-gray-100 select-none flex-shrink-0">

        {/* Panel type tabs */}
        <div className="flex items-center h-full gap-0.5">
          {(['Terminal', 'Output', 'Problems'] as PanelTab[]).map(t => (
            <button key={t} onClick={() => setPanelTab(t)}
              className={`h-full px-3 text-[11px] font-semibold uppercase tracking-wider transition-all duration-150 rounded-sm
                ${panelTab === t ? 'text-gray-800 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* Terminal instance tabs + controls */}
        <div className="flex items-center gap-0">
          {panelTab === 'Terminal' && (
            <div className="flex items-center gap-0 mr-2">
              {termTabs.map((tt, i) => (
                <button key={tt.id} onClick={() => setActiveTermId(tt.id)}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] transition-colors group
                    ${activeTermId === tt.id ? 'text-gray-800 bg-gray-100' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
                  <span className="material-symbols-outlined text-[11px]">terminal</span>
                  <span>{tt.title} {i + 1}</span>
                  {termTabs.length > 1 && (
                    <span onClick={e => closeTerminal(tt.id, e)}
                      className="material-symbols-outlined text-[11px] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity">
                      close
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <button title="New terminal" onClick={addTerminal}
            className="p-1 hover:bg-gray-100 hover:text-gray-700 text-gray-400 rounded transition-colors">
            <span className="material-symbols-outlined text-[15px]">add</span>
          </button>
          <div className="w-px h-3 bg-gray-200 mx-0.5" />
          <button onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })}
            className="p-1 hover:bg-gray-100 hover:text-gray-700 text-gray-400 rounded transition-colors">
            <span className="material-symbols-outlined text-[15px]">keyboard_arrow_down</span>
          </button>
          <button onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })}
            className="p-1 hover:bg-gray-100 hover:text-gray-700 text-gray-400 rounded transition-colors">
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {panelTab === 'Terminal' && termTabs.map(tt => (
          <TerminalInstance
            key={tt.id}
            id={tt.id}
            cwd={state.projectRoot ?? undefined}
            active={activeTermId === tt.id}
          />
        ))}
        {panelTab !== 'Terminal' && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm select-none">
            {panelTab}
          </div>
        )}
      </div>
    </div>
  );
};

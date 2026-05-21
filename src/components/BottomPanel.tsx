import React, { useState } from 'react';
import { useAppState } from '../store/AppContext';
import { Terminal } from './Terminal';

type PanelTab = 'Terminal' | 'Output' | 'Problems';

export const BottomPanel: React.FC = () => {
  const { state, dispatch } = useAppState();
  const [activePanel, setActivePanel] = useState<PanelTab>('Terminal');

  return (
    <div
      style={{
        height: state.terminalVisible ? '260px' : '0px',
        minHeight: state.terminalVisible ? '260px' : '0px',
        transition: 'height 240ms cubic-bezier(0.4,0,0.2,1), min-height 240ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}
      className="border-t border-gray-100 flex flex-col shrink-0 bg-white"
    >
      <div className="h-9 flex items-center justify-between px-3 bg-white border-b border-gray-100 select-none flex-shrink-0">
        <div className="flex items-center h-full gap-0.5">
          {(['Terminal', 'Output', 'Problems'] as PanelTab[]).map(tab => (
            <button key={tab} onClick={() => setActivePanel(tab)}
              className={`h-full px-3 text-[11px] font-semibold uppercase tracking-wider transition-all duration-150 rounded-sm
                ${activePanel === tab ? 'text-gray-800 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5 text-gray-400">
          <button className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors">
            <span className="material-symbols-outlined text-[15px]">add</span>
          </button>
          <div className="w-px h-3 bg-gray-200 mx-0.5" />
          <button onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })}
            className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors">
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <div style={{ display: activePanel === 'Terminal' ? 'flex' : 'none' }} className="absolute inset-0 flex flex-col">
          <Terminal />
        </div>
        {activePanel !== 'Terminal' && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm select-none">
            {activePanel}
          </div>
        )}
      </div>
    </div>
  );
};

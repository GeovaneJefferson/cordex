import React, { useState, useRef } from 'react';
import { useAppState } from '../store/AppContext';
import { Terminal } from './Terminal';

type PanelTab = 'Terminal' | 'Output' | 'Problems';

interface TerminalInstanceData {
  id: string;
  name: string;
}

export const BottomPanel: React.FC = () => {
  const { state, dispatch } = useAppState();
  const [activePanel, setActivePanel] = useState<PanelTab>('Terminal');
  
  // Track open terminal instances
  const [terminals, setTerminals] = useState<TerminalInstanceData[]>([
    { id: 'terminal-1', name: 'bash' }
  ]);
  const [activeTerminalId, setActiveTerminalId] = useState<string>('terminal-1');
  const terminalCounter = useRef<number>(1);

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
        height: state.terminalVisible ? '260px' : '0px',
        minHeight: state.terminalVisible ? '260px' : '0px',
        transition: 'height 240ms cubic-bezier(0.4,0,0.2,1), min-height 240ms cubic-bezier(0.4,0,0.2,1)',
        overflow: 'hidden',
      }}
      className="border-t border-gray-100 flex flex-col shrink-0 bg-white"
    >
      {/* HEADER */}
      <div className="h-9 flex items-center justify-between px-3 bg-white border-b border-gray-100 select-none flex-shrink-0">
        <div className="flex items-center h-full gap-4">
          {(['Terminal', 'Output', 'Problems'] as PanelTab[]).map(tab => (
            <button key={tab} onClick={() => setActivePanel(tab)}
              className={`h-full text-[11px] font-semibold uppercase tracking-wider transition-all duration-150 rounded-sm
                ${activePanel === tab ? 'text-gray-800 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-700'}`}>
              {tab}
            </button>
          ))}
        </div>

        {/* TOP RIGHT ACTIONS */}
        <div className="flex items-center gap-1 text-gray-400">
          <button onClick={handleAddTerminal} className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors" title="New Terminal">
            <span className="material-symbols-outlined text-[16px]">add</span>
          </button>
          <button onClick={(e) => handleCloseTerminal(e, activeTerminalId)} className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors" title="Kill Active Terminal">
            <span className="material-symbols-outlined text-[16px]">delete</span>
          </button>
          <div className="w-px h-3 bg-gray-200 mx-1" />
          <button onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })} className="p-1 hover:bg-gray-100 hover:text-gray-700 rounded transition-colors" title="Close Panel">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      </div>

      {/* BODY AREA (Splits Terminal and Sidebar) */}
      <div className="flex-1 overflow-hidden relative flex flex-row">
        
        {/* LEFT COMPONENT: The Actual Terminals */}
        <div className="flex-1 relative bg-white">
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
          
          {activePanel !== 'Terminal' && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm select-none">
              {activePanel}
            </div>
          )}
        </div>

        {/* RIGHT COMPONENT: VSCode Style Terminal Tabs */}
        {activePanel === 'Terminal' && (
          <div className="w-48 flex-shrink-0 border-l border-gray-100 bg-[#fafafa] overflow-y-auto py-1 flex flex-col gap-0.5">
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
      onDoubleClick={() => setIsRenaming(true)}
      className={`group flex items-center justify-between px-2 py-1 cursor-pointer text-[12px] mx-1 rounded-md transition-colors
        ${isActive ? 'bg-gray-200 text-gray-800 font-medium' : 'text-gray-500 hover:bg-gray-100'}`}
    >
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        <span className="material-symbols-outlined text-[14px]">terminal</span>
        {isRenaming ? (
          <input
            autoFocus
            value={tempName}
            onChange={(e) => setTempName(e.target.value)}
            onBlur={() => { onRename(tempName); setIsRenaming(false); }}
            onKeyDown={handleKeyDown}
            className="bg-white border border-blue-400 outline-none w-full px-1 rounded-sm text-gray-800"
          />
        ) : (
          <span className="truncate">{terminal.name}</span>
        )}
      </div>

      <button 
        onClick={onClose}
        className={`p-0.5 rounded-md hover:bg-gray-300 flex items-center justify-center transition-opacity
          ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
      >
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
  );
};
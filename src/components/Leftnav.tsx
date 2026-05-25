import React from 'react';
import { useAppState } from '../store/AppContext';

type Panel = 'explorer' | 'search' | 'git' | 'extensions';

const NavBtn: React.FC<{ icon: string; title: string; active?: boolean; onClick?: () => void }> = ({ icon, title, active, onClick }) => (
  <button title={title} onClick={onClick}
    className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 ease-in-out group ${
      active ? 'text-orange-500 bg-orange-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
    }`}>
    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r-full -ml-px" />}
    <span className="material-symbols-outlined text-[20px] leading-none">{icon}</span>
  </button>
);

export const LeftNav: React.FC = () => {
  const { state, dispatch } = useAppState();

  const handleNav = (panel: Panel) => {
    if (state.sidebarVisible && state.sidebarPanel === panel) {
      dispatch({ type: 'TOGGLE_SIDEBAR' });
    } else {
      dispatch({ type: 'SET_SIDEBAR_PANEL', panel });
    }
  };

  const isActive = (panel: Panel) => state.sidebarVisible && state.sidebarPanel === panel;

  return (
    <nav className="w-12 border-r border-gray-100 bg-white flex flex-col items-center py-3 z-20 flex-shrink-0">
      {/* Logo */}
      <div className="mb-4 flex items-center justify-center">
        <div className="w-7 h-7 bg-orange-500 rounded-md flex items-center justify-center relative overflow-hidden shadow-sm">
          <div className="w-2.5 h-2.5 bg-white rounded-full absolute top-1 left-1" />
          <div className="w-2.5 h-2.5 border-[1.5px] border-white rounded-full absolute bottom-1 right-1" />
        </div>
      </div>

      {/* Primary nav */}
      <div className="flex flex-col items-center gap-1 flex-1 w-full px-1.5">
        <NavBtn icon="folder"       title="Explorer"       active={isActive('explorer')}   onClick={() => handleNav('explorer')} />
        <NavBtn icon="search"       title="Search"         active={isActive('search')}     onClick={() => handleNav('search')} />
        <NavBtn icon="account_tree" title="Source Control" active={isActive('git')}        onClick={() => handleNav('git')} />
        <NavBtn icon="terminal"     title="Toggle Terminal" active={state.terminalVisible} onClick={() => dispatch({ type: 'TOGGLE_TERMINAL' })} />
        <NavBtn icon="extension"    title="Extensions"     active={isActive('extensions')} onClick={() => handleNav('extensions')} />
      </div>

      {/* Bottom */}
      <div className="flex flex-col items-center gap-1 px-1.5 mb-1">
        <NavBtn icon="brush"    title="Theme" />
        <NavBtn icon="settings" title="AI Settings" onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })} />
      </div>
    </nav>
  );
};

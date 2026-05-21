import React from 'react';
import { useAppState } from '../store/AppContext';

interface NavBtnProps {
  icon: string; title: string; active?: boolean;
  onClick?: () => void; badge?: number;
}

const NavBtn: React.FC<NavBtnProps> = ({ icon, title, active, onClick, badge }) => (
  <button title={title} onClick={onClick}
    className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-200 group
      ${active ? 'text-orange-500 bg-orange-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'}`}>
    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-orange-500 rounded-r-full -ml-px" />}
    <span className="material-symbols-outlined text-[20px] leading-none">{icon}</span>
    {badge != null && badge > 0 && (
      <span className="absolute top-0.5 right-0.5 min-w-[14px] h-[14px] bg-orange-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5">
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

export const LeftNav: React.FC = () => {
  const { state, dispatch } = useAppState();

  const handleNav = (panel: 'explorer' | 'search' | 'git') => {
    if (state.sidebarVisible && state.sidebarPanel === panel) {
      dispatch({ type: 'TOGGLE_SIDEBAR' });
    } else {
      dispatch({ type: 'SET_SIDEBAR_PANEL', panel });
    }
  };

  const isActive = (panel: 'explorer' | 'search' | 'git') =>
    state.sidebarVisible && state.sidebarPanel === panel;

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
        <NavBtn icon="folder"          title="Explorer (Ctrl+Shift+E)" active={isActive('explorer')} onClick={() => handleNav('explorer')} />
        <NavBtn icon="search"          title="Search (Ctrl+Shift+F)"   active={isActive('search')}   onClick={() => handleNav('search')} />
        <NavBtn icon="source_branch"   title="Source Control (Ctrl+Shift+G)" active={isActive('git')} onClick={() => handleNav('git')} />
      </div>

      {/* Bottom */}
      <div className="flex flex-col items-center gap-1 w-full px-1.5">
        <NavBtn icon="settings" title="AI Settings (Ctrl+,)"
          onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })} />
      </div>
    </nav>
  );
};

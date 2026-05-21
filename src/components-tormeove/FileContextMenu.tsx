import React, { useEffect, useRef, useState } from 'react';
import { useAppState } from '../store/AppContext';
import { FileNode } from '../types';

const Cordex = (window as any).Cordex;

interface MenuItem {
  label: string;
  icon: string;
  danger?: boolean;
  action: () => void;
  divider?: boolean;
}

export const FileContextMenu: React.FC = () => {
  const { state, dispatch } = useAppState();
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  const menu = state.contextMenu;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        dispatch({ type: 'SET_CONTEXT_MENU', menu: null });
        setRenaming(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'SET_CONTEXT_MENU', menu: null });
        setRenaming(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu, dispatch]);

  useEffect(() => {
    if (renaming) setTimeout(() => renameRef.current?.select(), 50);
  }, [renaming]);

  if (!menu) return null;
  const { x, y, node } = menu;

  const close = () => { dispatch({ type: 'SET_CONTEXT_MENU', menu: null }); setRenaming(false); };

  const handleRename = async () => {
    const newName = renameVal.trim();
    if (!newName || newName === node.name) return close();
    await Cordex?.fs?.rename?.(node.path, newName);
    // Refresh tree
    const root = (window as any).__cordexRoot;
    if (root) {
      const result = await Cordex?.fs?.readDir?.(root);
      if (result?.ok) dispatch({ type: 'SET_FILE_TREE', tree: result.tree });
    }
    close();
  };

  const handleDelete = async () => {
    const ok = window.confirm(`Delete "${node.name}"? This cannot be undone.`);
    if (!ok) return close();
    await Cordex?.fs?.delete?.(node.path);
    // Remove from open tabs if file
    const tab = (window as any).__cordexTabs?.find?.((t: any) => t.path === node.path);
    if (tab) dispatch({ type: 'REMOVE_TAB', id: tab.id });
    // Refresh tree
    const root = (window as any).__cordexRoot;
    if (root) {
      const result = await Cordex?.fs?.readDir?.(root);
      if (result?.ok) dispatch({ type: 'SET_FILE_TREE', tree: result.tree });
    }
    close();
  };

  const handleNewFile = async () => {
    const name = window.prompt('New file name:');
    if (!name) return close();
    const dir = node.type === 'folder' ? node.path : node.path.split('/').slice(0, -1).join('/');
    await Cordex?.fs?.createFile?.(dir, name);
    const root = (window as any).__cordexRoot;
    if (root) {
      const result = await Cordex?.fs?.readDir?.(root);
      if (result?.ok) dispatch({ type: 'SET_FILE_TREE', tree: result.tree });
    }
    close();
  };


  const handleReveal = () => {
    Cordex?.fs?.revealInExplorer?.(node.path);
    close();
  };

  // Position so menu stays inside viewport
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const mw = 196;
  const mh = 240;
  const px = x + mw > vw ? x - mw : x;
  const py = y + mh > vh ? y - mh : y;

  return (
    <div
      ref={menuRef}
      style={{ left: px, top: py, animation: 'slideUp 120ms cubic-bezier(0.4,0,0.2,1)' }}
      className="fixed z-[200] bg-white border border-gray-200 rounded-lg shadow-2xl py-1 w-48 text-[12px] font-medium text-gray-700 select-none"
    >
      {renaming ? (
        <div className="px-2 py-1">
          <input
            ref={renameRef}
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setRenaming(false); } }}
            className="w-full border border-orange-400 rounded px-2 py-1 text-[12px] outline-none bg-white"
          />
          <div className="flex gap-1 mt-1">
            <button onClick={handleRename} className="flex-1 px-2 py-0.5 bg-orange-500 text-white rounded text-[11px] hover:bg-orange-600 transition-colors">OK</button>
            <button onClick={() => setRenaming(false)} className="flex-1 px-2 py-0.5 bg-gray-100 rounded text-[11px] hover:bg-gray-200 transition-colors">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <Item icon="note_add" label="New File Here" onClick={handleNewFile} />
          <div className="h-px bg-gray-100 my-1" />
          <Item icon="edit" label="Rename" onClick={() => { setRenameVal(node.name); setRenaming(true); }} />
          <Item icon="content_copy" label="Copy Path" onClick={() => { navigator.clipboard.writeText(node.path); close(); }} />
          <Item icon="folder_open" label="Reveal in Files" onClick={handleReveal} />
          <div className="h-px bg-gray-100 my-1" />
          <Item icon="delete" label="Delete" onClick={handleDelete} danger />
        </>
      )}
    </div>
  );
};

const Item: React.FC<{ icon: string; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button
    className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 transition-colors duration-100 ${danger ? 'text-red-600 hover:bg-red-50' : ''}`}
    onClick={onClick}
  >
    <span className={`material-symbols-outlined text-[15px] ${danger ? 'text-red-500' : 'text-gray-400'}`}>{icon}</span>
    {label}
  </button>
);

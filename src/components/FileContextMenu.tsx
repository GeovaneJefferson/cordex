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
  const [creatingFile, setCreatingFile] = useState(false);       // NEW
  const [newFileName, setNewFileName] = useState('');            // NEW
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const newFileInputRef = useRef<HTMLInputElement>(null);        // NEW

  const menu = state.contextMenu;

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        dispatch({ type: 'SET_CONTEXT_MENU', menu: null });
        setRenaming(false);
        setCreatingFile(false);    // also reset new-file mode
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'SET_CONTEXT_MENU', menu: null });
        setRenaming(false);
        setCreatingFile(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu, dispatch]);

  // Focus the rename input when entering rename mode
  useEffect(() => {
    if (renaming) setTimeout(() => renameRef.current?.select(), 50);
  }, [renaming]);

    // Focus the new file input when entering create mode
    useEffect(() => {
      if (creatingFile) setTimeout(() => newFileInputRef.current?.focus(), 50);
    }, [creatingFile]);

      if (!menu) return null;
      const { x, y, node } = menu;

  const close = () => {
    dispatch({ type: 'SET_CONTEXT_MENU', menu: null });
    setRenaming(false);
    setCreatingFile(false);
  };

  const refreshTree = async () => {
    const root = (window as any).__cordexRoot ?? state.projectRoot;
    if (root) {
      const result = await Cordex?.fs?.readDir?.(root);
      if (result?.ok) dispatch({ type: 'SET_FILE_TREE', tree: result.tree });
    }
  };

  const handleRename = async () => {
    const newName = renameVal.trim();
    if (!newName || newName === node.name) return close();
    await Cordex?.fs?.rename?.(node.path, newName);
    await refreshTree();
    close();
  };

  const handleDelete = async () => {
    const ok = window.confirm(`Delete "${node.name}"? This cannot be undone.`);
    if (!ok) return close();
    await Cordex?.fs?.delete?.(node.path);
    // Remove from open tabs if file
    const tab = (window as any).__cordexTabs?.find?.((t: any) => t.path === node.path);
    if (tab) dispatch({ type: 'REMOVE_TAB', id: tab.id });
    await refreshTree();
    close();
  };

  // Start new file flow
  const startNewFile = () => {
    setNewFileName('');
    setCreatingFile(true);
    // Do not close menu yet – user will interact with the inline input
  };

  // Commit new file creation
  const commitNewFile = async () => {
    const name = newFileName.trim();
    if (!name) return close();
    // Determine target directory
    const dir = node.type === 'folder' ? node.path : node.path.split('/').slice(0, -1).join('/');
    try {
      if (Cordex?.fs?.createFile) {
        await Cordex.fs.createFile(dir, name);
      } else {
        await Cordex?.fs?.writeFile?.(`${dir}/${name}`, '');
      }
      await refreshTree();
    } catch (e) {
      console.error('Failed to create file:', e);
    } finally {
      close();
    }
  };

  const handleOpenRight = () => {
    if (node.type === 'file') {
      dispatch({ type: 'SET_SPLIT_TAB', tabId: node.id });
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
    {/* Rename mode */}
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
    ) : creatingFile ? (
      /* New file inline input */
      <div className="px-2 py-1">
      <input
      ref={newFileInputRef}
      value={newFileName}
      onChange={e => setNewFileName(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commitNewFile(); if (e.key === 'Escape') setCreatingFile(false); }}
      placeholder="filename.txt"
      className="w-full border border-orange-400 rounded px-2 py-1 text-[12px] outline-none bg-white"
      />
      <div className="flex gap-1 mt-1">
      <button onClick={commitNewFile} className="flex-1 px-2 py-0.5 bg-orange-500 text-white rounded text-[11px] hover:bg-orange-600 transition-colors">OK</button>
      <button onClick={() => setCreatingFile(false)} className="flex-1 px-2 py-0.5 bg-gray-100 rounded text-[11px] hover:bg-gray-200 transition-colors">Cancel</button>
      </div>
      </div>
    ) : (
      /* Normal menu items */
      <>
      <Item icon="file_open" label="Open in Right Panel" onClick={handleOpenRight} />
      <Item icon="note_add" label="New File Here" onClick={startNewFile} />
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

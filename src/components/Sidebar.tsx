import React, { useState } from 'react';
import { useAppState } from '../store/AppContext';
import { useFileTree } from '../hooks/useFileTree';
import { FileNode } from '../types';
import { getFileIcon } from '../utils/fileIcons';
import { SearchPanel } from './SearchPanel';
import { GitPanel } from './GitPanel';

const Cordex = (window as any).Cordex;

interface TreeNodeProps {
  node: FileNode; depth: number;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onDrop: (src: FileNode, destDir: FileNode) => void;
}

const FileTreeNode: React.FC<TreeNodeProps> = ({ node, depth, onSelect, onContextMenu, onDrop }) => {
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const isFolder = node.type === 'folder';
  const { icon, color } = isFolder
    ? { icon: open ? 'folder_open' : 'folder', color: 'text-blue-400' }
    : getFileIcon(node.name);

  return (
    <div>
      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/x-cordex-node', JSON.stringify({ id: node.id, path: node.path, name: node.name, type: node.type }));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={e => { if (!isFolder) return; e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setDragOver(false);
          if (!isFolder) return;
          try { onDrop(JSON.parse(e.dataTransfer.getData('application/x-cordex-node')), node); } catch {}
        }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node); }}
        onClick={() => isFolder ? setOpen(o => !o) : onSelect(node.path)}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className={`flex items-center py-[3px] pr-2 cursor-pointer text-sm text-gray-700 transition-all duration-100 rounded-sm mx-1 group
          ${dragOver ? 'bg-orange-50 ring-1 ring-orange-300' : 'hover:bg-gray-50'}`}
      >
        <span className={`material-symbols-outlined text-[14px] mr-0.5 text-gray-400 flex-shrink-0 transition-transform duration-150
          ${isFolder ? (open ? 'rotate-90' : '') : 'opacity-0 pointer-events-none'}`} style={{ width: 14 }}>
          chevron_right
        </span>
        <span className={`material-symbols-outlined text-[15px] mr-1.5 flex-shrink-0 ${color}`}>{icon}</span>
        <span className="truncate text-[12.5px] flex-1">{node.name}</span>
      </div>
      <div style={{ maxHeight: open ? '99999px' : '0', overflow: 'hidden', transition: 'max-height 180ms ease' }}>
        {node.children?.map(child => (
          <FileTreeNode key={child.id} node={child} depth={depth + 1}
            onSelect={onSelect} onContextMenu={onContextMenu} onDrop={onDrop} />
        ))}
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { openProject, readFile, refreshTree } = useFileTree();

  const handleDrop = async (src: FileNode, destDir: FileNode) => {
    if (src.path === destDir.path || src.path.startsWith(destDir.path + '/')) return;
    await Cordex?.fs?.move?.(src.path, destDir.path);
    await refreshTree();
  };

  const handleExternalDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (!files.length || !state.projectRoot) return;
    for (const file of files) {
      const content = await file.text();
      await Cordex?.fs?.writeFile?.(`${state.projectRoot}/${file.name}`, content);
    }
    await refreshTree();
  };

  const iconBtn = (icon: string, title: string, onClick?: () => void) => (
    <button title={title} onClick={onClick}
      className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-all duration-150">
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
    </button>
  );

  const panelTitle = state.sidebarPanel === 'explorer' ? 'Explorer'
    : state.sidebarPanel === 'search' ? 'Search'
    : 'Source Control';

  return (
    <aside style={{
      width:    state.sidebarVisible ? '260px' : '0px',
      minWidth: state.sidebarVisible ? '260px' : '0px',
      transition: 'width 220ms cubic-bezier(0.4,0,0.2,1), min-width 220ms cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
    }} className="border-r border-gray-100 bg-white flex flex-col flex-shrink-0 z-10">

      {/* Explorer panel */}
      {state.sidebarPanel === 'explorer' && (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
            <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Explorer</h2>
            <div className="flex items-center gap-0.5">
              {iconBtn('note_add',             'New File')}
              {iconBtn('drive_folder_upload',  'Open Folder', openProject)}
              {iconBtn('refresh',              'Refresh',     refreshTree)}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto sidebar-scroll py-1"
            onDragOver={e => e.preventDefault()} onDrop={handleExternalDrop}>
            {state.fileTree.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-300 text-xs text-center px-4 gap-2 select-none">
                <span className="material-symbols-outlined text-[32px]">folder_open</span>
                <span>Open a folder to see files</span>
                <button onClick={openProject}
                  className="mt-1 px-3 py-1 text-orange-500 border border-orange-200 rounded-full text-[11px] hover:bg-orange-50 transition-colors">
                  Open Folder
                </button>
              </div>
            ) : (
              state.fileTree.map(node => (
                <FileTreeNode key={node.id} node={node} depth={0}
                  onSelect={p => readFile(p)} onContextMenu={(e, n) => dispatch({ type: 'SET_CONTEXT_MENU', menu: { x: e.clientX, y: e.clientY, node: n } })}
                  onDrop={handleDrop} />
              ))
            )}
          </div>
        </>
      )}

      {/* Search panel */}
      {state.sidebarPanel === 'search' && <SearchPanel />}

      {/* Git panel */}
      {state.sidebarPanel === 'git' && <GitPanel />}
    </aside>
  );
};

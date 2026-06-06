import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppState } from '../store/AppContext';
import { useFileTree } from '../hooks/useFileTree';
import { FileNode } from '../types';
import { getFileIcon } from '../utils/fileIcons';
import { SearchPanel } from './SearchPanel';
import { GitPanel } from './GitPanel';
import { ExtensionPanel } from './ExtensionPanel';

const Cordex = (window as any).Cordex;

// ── Flatten tree for arrow‑key navigation ───────────────────────────
function flattenTree(nodes: FileNode[], expanded: Set<string>): FileNode[] {
  const result: FileNode[] = [];
  const helper = (list: FileNode[]) => {
    for (const node of list) {
      result.push(node);
      if (node.type === 'folder' && expanded.has(node.id) && node.children) {
        helper(node.children);
      }
    }
  };
  helper(nodes);
  return result;
}

// ── TreeNode – now receives focusedId instead of isFocused ──────────
interface TreeNodeProps {
  node: FileNode;
  depth: number;
  expanded: Set<string>;
  focusedId: string | null;
  onToggleExpand: (id: string) => void;
  onSelect: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void;
  onDrop: (src: FileNode, destDir: FileNode) => void;
}

const FileTreeNode: React.FC<TreeNodeProps> = React.memo(({
  node, depth, expanded, focusedId, onToggleExpand, onSelect,
  onContextMenu, onDrop
}) => {
  const [dragOver, setDragOver] = useState(false);
  const isFolder = node.type === 'folder';
  const isExpanded = isFolder && expanded.has(node.id);
  const isFocused = focusedId === node.id;      // highlight if this node is the focused one

  const { icon, color } = isFolder
    ? { icon: isExpanded ? 'folder_open' : 'folder', color: 'text-blue-400' }
    : getFileIcon(node.name);

  return (
    <div>
      <div
        draggable
        onDragStart={e => {
          e.dataTransfer.setData('application/x-cordex-node', JSON.stringify({
            id: node.id, path: node.path, name: node.name, type: node.type
          }));
          e.dataTransfer.effectAllowed = 'move';
          (window as any).__cordexDragging = true;
        }}
        onDragEnd={() => { (window as any).__cordexDragging = false; }}
        onDragOver={e => { if (!isFolder) return; e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setDragOver(false);
          if (!isFolder) return;
          try {
            const src = JSON.parse(e.dataTransfer.getData('application/x-cordex-node'));
            onDrop(src, node);
          } catch { }
        }}
        onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onContextMenu(e, node); }}
        onClick={() => {
          if (isFolder) {
            onToggleExpand(node.id);
          } else {
            onSelect(node.path);
          }
        }}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className={`flex items-center py-[3px] pr-2 cursor-pointer text-sm text-gray-700 transition-all duration-100 rounded-sm mx-1 group
          ${dragOver ? 'bg-orange-50 ring-1 ring-orange-300' : isFocused ? 'bg-blue-100/70 ring-1 ring-blue-300' : 'hover:bg-gray-50'}`}
        tabIndex={-1}
        data-node-id={node.id}
      >
        <span className={`material-symbols-outlined text-[14px] mr-0.5 text-gray-400 flex-shrink-0 transition-transform duration-150
          ${isFolder ? (isExpanded ? 'rotate-90' : '') : 'opacity-0 pointer-events-none'}`} style={{ width: 14 }}>
          chevron_right
        </span>
        <span className={`material-symbols-outlined text-[15px] mr-1.5 flex-shrink-0 ${color}`}>{icon}</span>
        <span className="truncate text-[12.5px] flex-1">{node.name}</span>
      </div>
      {isFolder && isExpanded && node.children?.map(child => (
        <FileTreeNode key={child.id} node={child} depth={depth + 1}
          expanded={expanded}
          focusedId={focusedId}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onContextMenu={onContextMenu}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
});

// ── Main Sidebar ─────────────────────────────────────────────────────
export const Sidebar: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { openProject, readFile, refreshTree } = useFileTree();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const flatNodes = useMemo(
    () => flattenTree(state.fileTree as FileNode[], expanded),
    [state.fileTree, expanded]
  );

  const [focusIndex, setFocusIndex] = useState(-1);
  const [isKeyboardNav, setIsKeyboardNav] = useState(false);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const focusedId = useMemo(() => {
    if (!isKeyboardNav || focusIndex < 0 || focusIndex >= flatNodes.length) return null;
    return flatNodes[focusIndex].id;
  }, [isKeyboardNav, focusIndex, flatNodes]);

  useEffect(() => {
    if (state.sidebarVisible && treeContainerRef.current) {
      treeContainerRef.current.focus();
    }
  }, [state.sidebarVisible]);

  useEffect(() => {
    if (focusIndex >= flatNodes.length) setFocusIndex(Math.max(0, flatNodes.length - 1));
  }, [flatNodes.length, focusIndex]);

  useEffect(() => {
    const id = flatNodes[focusIndex]?.id;
    if (!id || !treeContainerRef.current) return;
    const el = treeContainerRef.current.querySelector(`[data-node-id="${id}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusIndex, flatNodes]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!isKeyboardNav) setIsKeyboardNav(true);

    if (focusIndex < 0 && flatNodes.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { setFocusIndex(0); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { setFocusIndex(flatNodes.length - 1); return; }
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex(prev => Math.max(0, prev - 1));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex(prev => Math.min(flatNodes.length - 1, prev + 1));
        break;
      case 'ArrowRight': {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node?.type === 'folder') {
          if (!expanded.has(node.id)) {
            toggleExpand(node.id);
          } else if (focusIndex < flatNodes.length - 1) {
            setFocusIndex(focusIndex + 1);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        const node = flatNodes[focusIndex];
        if (node?.type === 'folder' && expanded.has(node.id)) {
          toggleExpand(node.id);
        } else if (node) {
          const parentPath = node.path.split('/').slice(0, -1).join('/');
          const parentIdx = flatNodes.findIndex(n => n.path === parentPath);
          if (parentIdx !== -1) setFocusIndex(parentIdx);
        }
        break;
      }
      case 'Enter':
        e.preventDefault();
        const sel = flatNodes[focusIndex];
        if (!sel) return;
        if (sel.type === 'folder') toggleExpand(sel.id);
        else readFile(sel.path);
        break;
      case 'Escape':
        setIsKeyboardNav(false);
        setFocusIndex(-1);
        (treeContainerRef.current as HTMLElement)?.blur();
        break;
    }
  }, [flatNodes, focusIndex, isKeyboardNav, expanded, toggleExpand, readFile]);

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-node-id]');
    if (target) {
      setIsKeyboardNav(false);
      setFocusIndex(-1);
    }
  };

  // ── New file / upload helpers ──────────────────────────────────────
  const [creatingFile, setCreatingFile] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const newFileInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (creatingFile && newFileInputRef.current) newFileInputRef.current.focus();
  }, [creatingFile]);

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

  const handleNewFileClick = () => {
    if (!state.projectRoot) { alert('Please open a project folder first.'); return; }
    setNewFileName('');
    setCreatingFile(true);
  };

  const commitNewFile = async () => {
    const name = newFileName.trim();
    if (!name) { setCreatingFile(false); return; }
    const targetPath = `${state.projectRoot}/${name}`;
    try {
      if (Cordex?.fs?.createFile) await Cordex.fs.createFile(state.projectRoot, name);
      else await Cordex?.fs?.writeFile?.(targetPath, '');
      await refreshTree();
    } catch (e) { console.error('Failed to create file:', e); }
    finally { setCreatingFile(false); setNewFileName(''); }
  };

  const handleOpenFile = async () => {
    const filePath = await Cordex?.fs?.openFileDialog?.();
    if (!filePath) return;
    const result = await Cordex?.fs?.readFile(filePath);
    if (result.ok) {
      const ext = filePath.split('.').pop();
      const langMap: Record<string, string> = {
        js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
        py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
        html: 'html', css: 'css', json: 'json', md: 'markdown',
      };
      const language = (ext && langMap[ext]) || 'plaintext';
      dispatch({ type: 'OPEN_FILE', payload: { path: filePath, content: result.content, language } });
    }
  };

  const iconBtn = (icon: string, title: string, onClick?: () => void) => (
    <button title={title} onClick={onClick}
      className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-all duration-150">
      <span className="material-symbols-outlined text-[15px]">{icon}</span>
    </button>
  );

  return (
    <aside style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}
      className="border-r border-gray-100 bg-white flex flex-col flex-shrink-0 z-10 h-full">

      {/* Explorer panel */}
      {state.sidebarPanel === 'explorer' && (
        <>
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
            {creatingFile ? (
              <div className="flex items-center gap-1 flex-1 mr-2">
                <input
                  ref={newFileInputRef}
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitNewFile();
                    if (e.key === 'Escape') { setCreatingFile(false); setNewFileName(''); }
                  }}
                  placeholder="filename.txt"
                  className="flex-1 px-2 py-1 text-[12px] border border-orange-400 rounded outline-none bg-white"
                />
                <button onClick={commitNewFile} className="p-1 text-green-600 hover:bg-green-50 rounded">
                  <span className="material-symbols-outlined text-[15px]">check</span>
                </button>
                <button onClick={() => { setCreatingFile(false); setNewFileName(''); }} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Explorer</h2>
                <div className="flex items-center gap-0.5">
                  {iconBtn('note_add', 'New File', handleNewFileClick)}
                  {iconBtn('open_in_browser', 'Open File', handleOpenFile)}
                  {iconBtn('drive_folder_upload', 'Open Folder', openProject)}
                  {iconBtn('refresh', 'Refresh', refreshTree)}
                </div>
              </>
            )}
          </div>
          <div
            ref={treeContainerRef}
            className="flex-1 overflow-y-auto sidebar-scroll py-1 outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onMouseDown={handleContainerMouseDown}
            onDragOver={e => e.preventDefault()}
            onDrop={handleExternalDrop}
          >
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
              state.fileTree.map((node: FileNode) => (
                <FileTreeNode key={node.id} node={node} depth={0}
                  expanded={expanded}
                  focusedId={focusedId}
                  onToggleExpand={toggleExpand}
                  onSelect={p => readFile(p)}
                  onContextMenu={(e, n) => dispatch({ type: 'SET_CONTEXT_MENU', menu: { x: e.clientX, y: e.clientY, node: n } })}
                  onDrop={handleDrop}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Search panel */}
      {state.sidebarPanel === 'search' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <SearchPanel />
        </div>
      )}

      {/* Git panel */}
      {state.sidebarPanel === 'git' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <GitPanel />
        </div>
      )}

      {/* Extensions panel */}
      {state.sidebarPanel === 'extensions' && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          <ExtensionPanel />
        </div>
      )}
    </aside>
  );
};
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useAppState } from '../store/AppContext';
import { useFileTree } from '../hooks/useFileTree';
import { Tab } from '../types';

const Cordex = (window as any).Cordex;

interface Item {
  type: 'file' | 'tab' | 'command';
  id: string;
  label: string;
  detail?: string;
  icon: string;
  score: number;
  action: () => void;
}

const COMMANDS: Omit<Item, 'action' | 'score'>[] = [
  { type: 'command', id: 'cmd-new-file',     label: 'New File',           detail: 'Create untitled file',       icon: 'add' },
  { type: 'command', id: 'cmd-open-folder',  label: 'Open Folder',        detail: 'Open project folder',        icon: 'folder_open' },
  { type: 'command', id: 'cmd-ai-settings',  label: 'AI Settings',        detail: 'Configure models & agents',  icon: 'settings' },
  { type: 'command', id: 'cmd-search',       label: 'Search in Files',    detail: 'Global project search',      icon: 'manage_search' },
  { type: 'command', id: 'cmd-git',          label: 'Git Panel',          detail: 'Open source control',        icon: 'call_split' },
  { type: 'command', id: 'cmd-extensions',   label: 'Extensions',         detail: 'Manage language extensions', icon: 'extension' },
  { type: 'command', id: 'cmd-split-right',  label: 'Split Editor Right', detail: 'Vertical split',             icon: 'vertical_split' },
  { type: 'command', id: 'cmd-split-down',   label: 'Split Editor Down',  detail: 'Horizontal split',           icon: 'horizontal_split' },
  { type: 'command', id: 'cmd-split-grid',   label: 'Split Editor Grid',  detail: '2×2 grid layout',            icon: 'grid_view' },
  { type: 'command', id: 'cmd-split-close',  label: 'Close Split',        detail: 'Single editor view',         icon: 'fullscreen' },
  { type: 'command', id: 'cmd-word-jump',    label: 'Jump to Word',       detail: 'EasyMotion (Ctrl+Shift+J)',  icon: 'keyboard_tab' },
];

// ── Scoring: higher = better match ────────────────────────────────────────────
// Priorities (descending):
//   1. Exact filename match        → 1000
//   2. Filename starts with query  → 800
//   3. Filename contains query     → 600
//   4. Path segment starts with q  → 400
//   5. Path contains query         → 200
//   6. No match                    → -1 (exclude)
function scoreFile(name: string, relPath: string, q: string): number {
  const nl  = name.toLowerCase();
  const rl  = (relPath || '').toLowerCase();
  const ql  = q.toLowerCase();
  if (!ql) return 500;
  if (nl === ql)              return 1000;
  if (nl.startsWith(ql))     return 800 + (1 / name.length);  // shorter name ranks higher
  if (nl.includes(ql))       return 600 + (1 / name.length);
  // Check each path segment
  const segments = rl.split('/');
  for (const seg of segments) {
    if (seg.startsWith(ql)) return 400;
    if (seg.includes(ql))   return 200;
  }
  return -1;
}

function scoreTab(name: string, path: string, q: string): number {
  return scoreFile(name, path, q);
}

// Walk the file tree depth-first and collect all file paths.
// Filters out files that are in the exclude list.
function flattenTree(tree: any[]): { name: string; path: string; relPath: string }[] {
  const results: { name: string; path: string; relPath: string }[] = [];
  const excludeList: string[] = ['node_modules', 'dist', 'build', 'tmp'];

  function walk(nodes: any[], prefix = '') {
    for (const node of nodes) {
      if (node.type === 'file' && !excludeList.some(exclude => node.path.includes(exclude))) {
        results.push({ name: node.name, path: node.path, relPath: prefix + node.name });
      } else if (node.children && !excludeList.some(exclude => node.path.includes(exclude))) {
        walk(node.children, prefix + node.name + '/');
      }
    }
  }

  walk(tree);
  return results;
}

export const CommandPalette: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { readFile } = useFileTree();
  const [query, setQuery]     = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  const close = useCallback(() => dispatch({ type: 'TOGGLE_COMMAND_PALETTE' }), [dispatch]);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 30); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) close();
    };
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler); };
  }, [close]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [close]);

  const makeCommandAction = (id: string): (() => void) => {
    const map: Record<string, () => void> = {
      'cmd-new-file':    () => { dispatch({ type: 'NEW_FILE' }); close(); },
      'cmd-open-folder': async () => {
        const dir = await Cordex?.fs?.openFolderDialog?.();
        if (!dir) return;
        const result = await Cordex?.fs?.readDir?.(dir);
        if (result?.ok) dispatch({ type: 'SET_PROJECT', root: dir, tree: result.tree });
        close();
      },
      'cmd-ai-settings': () => { dispatch({ type: 'TOGGLE_AI_SETTINGS' }); close(); },
      'cmd-search':      () => { dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'search' }); close(); },
      'cmd-git':         () => { dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'git' }); close(); },
      'cmd-extensions':  () => { dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'extensions' }); close(); },
      'cmd-split-right': () => {
        const other = state.tabs.find((t: Tab) => t.id !== state.activeTabId);
        if (other) dispatch({ type: 'SET_SPLIT_MODE', mode: 'horizontal', tabIds: [other.id] });
        close();
      },
      'cmd-split-down':  () => {
        const other = state.tabs.find((t: Tab) => t.id !== state.activeTabId);
        if (other) dispatch({ type: 'SET_SPLIT_MODE', mode: 'vertical', tabIds: [other.id] });
        close();
      },
      'cmd-split-grid':  () => {
        const others = state.tabs.filter((t: Tab) => t.id !== state.activeTabId);
        dispatch({ type: 'SET_SPLIT_MODE', mode: 'grid', tabIds: [others[0]?.id ?? null, others[1]?.id ?? null, others[2]?.id ?? null] });
        close();
      },
      'cmd-split-close': () => { dispatch({ type: 'SET_SPLIT_MODE', mode: 'none' }); close(); },
      'cmd-word-jump':   () => { window.dispatchEvent(new CustomEvent('cordex:word-jump')); close(); },
    };
    return map[id] ?? close;
  };

  const isCommandMode = query.startsWith('>');
  const q = isCommandMode ? query.slice(1).trim() : query.trim();

  // ── Build items ────────────────────────────────────────────────────────────
  const items: Item[] = (() => {
    if (isCommandMode) {
      const ql = q.toLowerCase();
      return COMMANDS
        .filter(c => !ql || c.label.toLowerCase().includes(ql) || (c.detail ?? '').toLowerCase().includes(ql))
        .map(c => ({ ...c, score: 0, action: makeCommandAction(c.id) }));
    }

    if (!q) {
      // No query: show open tabs (most recently used order is natural from state)
      return state.tabs.map((t: Tab) => ({
        type: 'tab' as const, id: `tab::${t.id}`, label: t.name,
        detail: t.path, icon: 'description', score: 500,
        action: () => { dispatch({ type: 'SET_ACTIVE_TAB', id: t.id }); close(); },
      })).slice(0, 12);
    }

    const results: Item[] = [];

    // 1. Score open tabs (always searched, very fast)
    for (const t of state.tabs as Tab[]) {
      const s = scoreTab(t.name, t.path, q);
      if (s >= 0) {
        results.push({
          type: 'tab', id: `tab::${t.id}`, label: t.name,
          detail: t.path, icon: 'description', score: s + 50, // slight boost for open tabs
          action: () => { dispatch({ type: 'SET_ACTIVE_TAB', id: t.id }); close(); },
        });
      }
    }

    // 2. Score project file tree (local, no IPC, instant)
    if (state.fileTree?.length) {
      const allFiles = flattenTree(state.fileTree);
      for (const f of allFiles) {
        // Skip if already shown as open tab
        if (results.find(r => r.detail === f.path)) continue;
        const s = scoreFile(f.name, f.relPath, q);
        if (s >= 0) {
          results.push({
            type: 'file', id: `file::${f.path}`, label: f.name,
            detail: f.relPath, icon: 'description', score: s,
            action: async () => { await readFile(f.path); close(); },
          });
        }
      }
    }

    // Sort by score descending, then alpha by label
    results.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    return results.slice(0, 25);
  })();

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selected] as HTMLElement;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape')    { close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, items.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && items[selected]) { items[selected].action(); }
  };

  // ── Highlight matching chars in label ──────────────────────────────────────
  const Highlight: React.FC<{ text: string; q: string }> = ({ text, q }) => {
    if (!q || q.startsWith('>')) return <>{text}</>;
    const ql  = q.toLowerCase();
    const tl  = text.toLowerCase();
    const idx = tl.indexOf(ql);
    if (idx === -1) return <>{text}</>;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: '#f97316', fontWeight: 800 }}>{text.slice(idx, idx + q.length)}</span>
        {text.slice(idx + q.length)}
      </>
    );
  };

  const dropdown = (
    <div
      ref={dropRef}
      style={{
        position: 'fixed',
        top: 44,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 540,
        zIndex: 9000,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderTop: 'none',
        borderRadius: '0 0 10px 10px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
        overflow: 'hidden',
      }}
    >
      {/* Input */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        padding: '7px 12px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-muted)', flexShrink: 0 }}>
          {isCommandMode ? 'terminal' : 'search'}
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search files… or type > for commands"
          style={{
            flex: 1, fontSize: 13, border: 'none', outline: 'none',
            background: 'transparent', color: 'var(--text-primary)',
          }}
        />
        {query && (
          <button onClick={() => setQuery('')}
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
        )}
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', opacity: 0.6 }}>Esc</span>
      </div>

      {/* Hint bar */}
      <div style={{
        display: 'flex', gap: 14, padding: '3px 12px',
        fontSize: 10, color: 'var(--text-muted)',
        background: 'var(--bg-subtle)',
        borderBottom: items.length ? '1px solid var(--border-subtle)' : 'none',
      }}>
        <span>↑↓ navigate</span>
        <span>Enter open</span>
        <span style={{ marginLeft: 'auto' }}>
          {items.length > 0 ? `${items.length} result${items.length !== 1 ? 's' : ''}` : ''}
          {' · '}Type <code style={{ fontFamily: 'monospace', fontSize: 9 }}>&gt;</code> for commands
        </span>
      </div>

      {/* Results */}
      <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            {query ? `No files matching "${q}"` : 'No open tabs'}
          </div>
        ) : items.map((item, i) => (
          <div
            key={item.id}
            onClick={item.action}
            style={{
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 12px', cursor: 'pointer',
              background: i === selected ? 'var(--bg-muted)' : 'transparent',
              borderLeft: `2px solid ${i === selected ? 'var(--accent)' : 'transparent'}`,
            }}
            onMouseEnter={() => setSelected(i)}
          >
            <span className="material-symbols-outlined" style={{
              fontSize: 14, flexShrink: 0,
              color: i === selected ? 'var(--accent)' : 'var(--text-muted)',
            }}>
              {item.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Highlight text={item.label} q={q} />
              </p>
              {item.detail && (
                <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.detail}
                </p>
              )}
            </div>
            <span style={{
              fontSize: 9, color: 'var(--text-muted)',
              background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)',
              borderRadius: 4, padding: '1px 5px', flexShrink: 0,
            }}>
              {item.type === 'tab' ? 'open' : item.type === 'command' ? 'cmd' : 'file'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  return ReactDOM.createPortal(dropdown, document.body);
};

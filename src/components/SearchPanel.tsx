import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { useFileTree } from '../hooks/useFileTree';
import { Tab } from '../types';

const Cordex = (window as any).Cordex;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Match {
  line: number;
  text: string;
  colStart: number;
  colEnd: number;
}

interface FileResult {
  path: string;
  relPath: string;
  name: string;
  matches: Match[];
}

export const SearchPanel: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { readFile } = useFileTree();

  const [query, setQuery] = useState('');
  const [replaceVal, setReplaceVal] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [capped, setCapped] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus the search input on mount AND whenever Ctrl+Shift+F is pressed
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    const handler = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('cordex:focus-search', handler);
    return () => window.removeEventListener('cordex:focus-search', handler);
  }, []);

  // ── debounced search ──────────────────────────────────────────────────────
  const runSearch = useCallback(async (q: string) => {
    const root = state.projectRoot;
    if (!q.trim()) { setResults([]); setCapped(false); return; }
    if (!root) { setResults([]); return; }

    setSearching(true);
    try {
      const res = await Cordex?.fs?.search?.({
        root, query: q,
        caseSensitive, wholeWord, useRegex,
      });
      if (res?.ok) {
        setResults(res.results ?? []);
        setCapped(res.capped ?? false);
        // auto-expand all files
        setExpanded(new Set((res.results ?? []).map((r: FileResult) => r.path)));
      } else if (res?.error) {
        setResults([]);
      }
    } finally {
      setSearching(false);
    }
  }, [state.projectRoot, caseSensitive, wholeWord, useRegex]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(query), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, runSearch]);

  // ── replace in a single file ──────────────────────────────────────────────
  const doReplace = async (filePath: string) => {
    if (!query || !replaceVal) return;
    try {
      const content = await Cordex?.fs?.readFile?.(filePath);
      if (!content?.ok) return;
      const flags = caseSensitive ? 'g' : 'gi';
      const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pat = new RegExp(useRegex ? query : (wholeWord ? `\\b${esc}\\b` : esc), flags);
      const next = content.content.replace(pat, replaceVal);

      await Cordex?.fs?.writeFile?.(filePath, next);

      // If the file is open as a tab, update it in state too
      const tab = state.tabs.find((t: Tab) => t.path === filePath);
      if (tab) dispatch({ type: 'UPDATE_TAB_CONTENT', id: tab.id, content: next });

      // Re-run search to refresh results
      await runSearch(query);
    } catch { }
  };

  const doReplaceAll = async () => {
    for (const r of results) await doReplace(r.path);
  };

  // ── open file and jump to line ────────────────────────────────────────────
  const openFile = async (filePath: string, line?: number) => {
    const tab = state.tabs.find((t: Tab) => t.path === filePath);
    if (tab) {
      dispatch({ type: 'SET_ACTIVE_TAB', id: tab.id });
    } else {
      await readFile(filePath);
    }
    if (line) {
      // Small delay so the editor has time to mount before we scroll
      setTimeout(() => dispatch({ type: 'GOTO_LINE', line }), 80);
    }
  };

  const toggleFile = (p: string) => {
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(p) ? s.delete(p) : s.add(p);
      return s;
    });
  };

  const totalMatches = results.reduce((n, r) => n + r.matches.length, 0);

  // ── highlight match ───────────────────────────────────────────────────────
  const hi = (text: string, s: number, e: number) => {
    const pre = text.slice(0, s);
    const hit = text.slice(s, e);
    const post = text.slice(e);
    const trim = (x: string, n = 26) => x.length > n ? '…' + x.slice(-n) : x;
    return (
      <span className="font-mono text-[11px] text-gray-500">
        {trim(pre)}
        <mark className="bg-yellow-200 text-gray-900 rounded-[2px] px-[1px]">{hit}</mark>
        {post.slice(0, 36)}{post.length > 36 ? '…' : ''}
      </span>
    );
  };

  const pill = (active: boolean, title: string, lbl: string, fn: () => void) => (
    <button title={title} onClick={fn}
      className={`px-1 py-0.5 rounded text-[10px] font-mono font-bold border transition-colors duration-100
        ${active
          ? 'bg-orange-100 text-orange-600 border-orange-300'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100 border-transparent'}`}>
      {lbl}
    </button>
  );

  const noProject = !state.projectRoot;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Search</h2>
        {searching && (
          <span className="material-symbols-outlined text-[14px] text-orange-400 animate-spin">autorenew</span>
        )}
      </div>

      {/* Inputs */}
      <div className="px-2 pt-2 pb-1 space-y-1 flex-shrink-0">
        <div className="flex items-start gap-1">
          {/* VSCode-style expand/collapse toggle on the left */}
          <button
            title={showReplace ? 'Collapse replace' : 'Expand replace'}
            onClick={() => setShowReplace(v => !v)}
            className="mt-[5px] p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors duration-150 flex-shrink-0"
          >
            <span className={`material-symbols-outlined text-[16px] transition-transform duration-150 ${showReplace ? 'rotate-90' : ''}`}>
              chevron_right
            </span>
          </button>

          <div className="flex-1 space-y-1">
            {/* Search input */}
            <div className="relative">
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={noProject ? 'Open a folder first…' : 'Search files…'}
                disabled={noProject}
                className="w-full pl-2 pr-[72px] py-1.5 text-[12px] border border-gray-200 rounded-md bg-gray-50
      focus:bg-white focus:border-orange-400 focus:outline-none transition-colors duration-150
      disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {pill(caseSensitive, 'Match Case', 'Aa', () => setCaseSensitive(v => !v))}
                {pill(wholeWord, 'Whole Word', 'W', () => setWholeWord(v => !v))}
                {pill(useRegex, 'Use Regex', '.*', () => setUseRegex(v => !v))}
              </div>
            </div>

            {/* Replace input — animated */}
            <div style={{
              maxHeight: showReplace ? '44px' : '0',
              overflow: 'hidden',
              opacity: showReplace ? 1 : 0,
              transition: 'max-height 180ms ease, opacity 150ms ease',
            }}>
              <div className="relative">
                <input
                  value={replaceVal}
                  onChange={e => setReplaceVal(e.target.value)}
                  placeholder="Replace"
                  className="w-full pl-2 pr-12 py-1.5 text-[12px] border border-gray-200 rounded-md bg-gray-50
      focus:bg-white focus:border-orange-400 focus:outline-none transition-colors duration-150"
                />
                <button
                  onClick={doReplaceAll}
                  disabled={!query || results.length === 0 || !replaceVal}
                  title="Replace all matches in all files"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5
      bg-orange-500 text-white rounded hover:bg-orange-600
      disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
                >
                  All
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      {query.trim() && !searching && (
        <div className="px-3 py-1 text-[10px] border-b border-gray-100 flex items-center gap-1 flex-shrink-0">
          {results.length === 0 ? (
            <span className="text-gray-400">No results</span>
          ) : (
            <>
              <span className="text-gray-500 font-medium">{totalMatches}</span>
              <span className="text-gray-400">result{totalMatches !== 1 ? 's' : ''} in</span>
              <span className="text-gray-500 font-medium">{results.length}</span>
              <span className="text-gray-400">file{results.length !== 1 ? 's' : ''}</span>
              {capped && <span className="text-amber-500 ml-1">· capped at 500</span>}
            </>
          )}
        </div>
      )}

      {/* Results list */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {results.map(fr => {
          const isOpen = expanded.has(fr.path);
          return (
            <div key={fr.path} className="border-b border-gray-50 last:border-0">
              {/* File row */}
              <div
                onClick={() => toggleFile(fr.path)}
                className="flex items-center px-2 py-1.5 hover:bg-gray-50 cursor-pointer select-none transition-colors duration-100 group"
              >
                <span className={`material-symbols-outlined text-[13px] text-gray-400 mr-1 flex-shrink-0
            transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>
                  chevron_right
                </span>
                <span className="material-symbols-outlined text-[13px] text-blue-400 mr-1.5 flex-shrink-0">description</span>
                <span className="text-[12px] font-medium text-gray-700 truncate flex-1" title={fr.relPath}>
                  {fr.name}
                </span>
                <span className="text-[10px] text-gray-400 truncate ml-1 max-w-[80px] hidden group-hover:block" title={fr.relPath}>
                  {fr.relPath.split('/').slice(0, -1).join('/')}
                </span>
                {/* Per-file replace button */}
                {showReplace && replaceVal && (
                  <button
                    title="Replace in this file"
                    onClick={e => { e.stopPropagation(); doReplace(fr.path); }}
                    className="ml-1 text-orange-400 hover:text-orange-600 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-[14px]">find_replace</span>
                  </button>
                )}
                <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 ml-1.5 flex-shrink-0">
                  {fr.matches.length}
                </span>
              </div>

              {/* Match lines */}
              <div style={{
                maxHeight: isOpen ? `${fr.matches.length * 34}px` : '0',
                overflow: 'hidden',
                transition: 'max-height 180ms ease',
              }}>
                {fr.matches.map((m, i) => (
                  <div
                    key={i}
                    onClick={() => openFile(fr.path, m.line)}
                    className="flex items-center pl-7 pr-3 py-[5px] hover:bg-orange-50 cursor-pointer transition-colors duration-100"
                  >
                    <span className="text-[10px] text-gray-300 w-7 text-right mr-2 flex-shrink-0 font-mono">{m.line}</span>
                    <span className="flex-1 truncate">{hi(m.text, m.colStart, m.colEnd)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Empty states */}
        {!query.trim() && !noProject && (
          <div className="flex flex-col items-center justify-center h-28 text-gray-300 text-xs text-center px-4 select-none gap-1">
            <span className="material-symbols-outlined text-[28px]">manage_search</span>
            <span>Search across all project files</span>
          </div>
        )}

        {noProject && (
          <div className="flex flex-col items-center justify-center h-28 text-gray-300 text-xs text-center px-4 select-none gap-1">
            <span className="material-symbols-outlined text-[28px]">folder_open</span>
            <span>Open a folder to enable search</span>
          </div>
        )}
      </div>
    </div>
  );
};

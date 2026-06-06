import React, { useEffect, useState, memo } from 'react';
import { useAppState } from '../store/AppContext';
import { HardwareBadge } from './HardwareBadge';
import { themes } from '../themes';
import { useTheme } from '../hooks/useTheme';

const Cordex = (window as any).Cordex;

interface MarkerItem { severity: number; message: string; startLineNumber: number; }

const Chip: React.FC<{
  icon?: string; text: string; color?: string; title?: string;
  onClick?: () => void; pulse?: boolean; dotColor?: string;
}> = ({ icon, text, color = 'text-gray-400', title, onClick, pulse, dotColor }) => (
  <button
    title={title}
    onClick={onClick}
    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors duration-100
      ${onClick ? 'hover:bg-gray-100 cursor-pointer' : 'cursor-default pointer-events-none'} ${color}`}
  >
    {dotColor && <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-0.5 ${dotColor} ${pulse ? 'animate-pulse' : ''}`} />}
    {icon && <span className="material-symbols-outlined text-[12px]">{icon}</span>}
    <span>{text}</span>
  </button>
);

const LANG_LABELS: Record<string, string> = {
  typescript: 'TypeScript', javascript: 'JavaScript', python: 'Python', rust: 'Rust',
  cpp: 'C++', c: 'C', go: 'Go', java: 'Java', json: 'JSON', html: 'HTML',
  css: 'CSS', scss: 'SCSS', markdown: 'Markdown', shell: 'Shell', yaml: 'YAML', toml: 'TOML',
  plaintext: 'Plain Text', rb: 'Ruby', php: 'PHP',
  cjs: 'CommonJS', mjs: 'ESModule',
  gdscript: 'GDScript', gd: 'GDScript',
  lua: 'Lua', sql: 'SQL', graphql: 'GraphQL', vue: 'Vue', svelte: 'Svelte', 
  qrc: 'qrc', qml: 'qml', qss: 'css',
  htmx: 'html', xhtml: 'html', htmlx: 'html'
};

export const StatusBar: React.FC = memo(() => {
  const { state, dispatch } = useAppState();
  const { currentThemeId, setTheme } = useTheme();
  const activeTab    = state.tabs.find(t => t.id === state.activeTabId);
  const currentTheme = themes.find(t => t.id === currentThemeId);
  const isDirty      = activeTab?.isDirty ?? false;
  const lang         = activeTab?.language ?? '';
  const langLabel    = LANG_LABELS[lang] ?? lang;
  const lineCount    = activeTab ? activeTab.content.split('\n').length : 0;
  const charCount    = activeTab?.content.length ?? 0;
  const projectName  = state.projectRoot ? state.projectRoot.split('/').pop() : null;

  const [gitBranch, setGitBranch] = useState<string | null>(null);
  const [markers,   setMarkers]   = useState<MarkerItem[]>([]);

  // ── Vector indexer state ─────────────────────────────────────────────────
  const [idxState,  setIdxState]  = useState<'idle'|'scanning'|'indexing'>('idle');
  const [idxCur,    setIdxCur]    = useState(0);
  const [idxTotal,  setIdxTotal]  = useState(0);
  const [idxPct,    setIdxPct]    = useState(0);

  useEffect(() => {
    if (!state.projectRoot) { setGitBranch(null); return; }
    Cordex.git.status(state.projectRoot)
      .then((res: any) => setGitBranch(res?.hasRepo && res.branch ? res.branch : null))
      .catch(() => setGitBranch(null));
  }, [state.projectRoot]);

  // ── Subscribe to vector indexer events ──────────────────────────────────
  useEffect(() => {
    const Cordex = (window as any).Cordex;
    const unsub = Cordex?.indexer?.onStatus?.((data: any) => {
      if (data.state === 'indexing') {
        setIdxState('indexing');
        setIdxCur(data.current ?? 0);
        setIdxTotal(data.total ?? 0);
        setIdxPct(data.pct ?? 0);
      } else if (data.state === 'scanning') {
        setIdxState('scanning');
      } else {
        setIdxState('idle');
      }
    });
    return () => unsub?.();
  }, []);

  // Subscribe to Monaco markers for real error/warning counts
  useEffect(() => {
    const handler = (e: Event) => setMarkers((e as CustomEvent).detail ?? []);
    window.addEventListener('cordex:markers-changed', handler);
    return () => window.removeEventListener('cordex:markers-changed', handler);
  }, []);

  const errorCount   = markers.filter(m => m.severity === 8).length;
  const warningCount = markers.filter(m => m.severity === 4).length;

  const openProblems = () => {
    // Open the bottom panel if it's hidden, then switch to Problems tab
    if (!state.terminalVisible) dispatch({ type: 'TOGGLE_TERMINAL' });
    window.dispatchEvent(new CustomEvent('cordex:open-problems'));
  };

  const llamaRunning  = state.llamaStatus === 'running';
  const llamaStarting = state.llamaStatus === 'starting';
  const llamaError    = state.llamaStatus === 'error';

  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-[22px] flex items-center select-none z-50 text-[10px]"
      style={{ background: 'var(--statusbar-bg)', borderTop: '1px solid var(--statusbar-border)' }}
    >
      {/* Left */}
      <div className="flex items-center pl-1 gap-0 flex-1 min-w-0 overflow-hidden">
        <Chip
          icon="account_tree"
          text={projectName ? `${projectName}${isDirty ? ' ●' : ''}` : 'No project'}
          color={isDirty ? 'text-amber-600' : 'text-gray-500'}
          title="Project"
          onClick={() => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'explorer' })}
        />

        {gitBranch && (
          <Chip
            icon="call_split" text={gitBranch} color="text-purple-500"
            title={`Git branch: ${gitBranch}`}
            onClick={() => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'git' })}
          />
        )}

        {/* Real error/warning counts */}
        <Chip
          icon="error_outline"
          text={String(errorCount)}
          color={errorCount > 0 ? 'text-red-500' : 'text-gray-400'}
          title={errorCount > 0 ? `${errorCount} error${errorCount !== 1 ? 's' : ''} — click to open Problems` : 'No errors'}
          onClick={openProblems}
        />
        <Chip
          icon="warning_amber"
          text={String(warningCount)}
          color={warningCount > 0 ? 'text-amber-500' : 'text-gray-400'}
          title={warningCount > 0 ? `${warningCount} warning${warningCount !== 1 ? 's' : ''} — click to open Problems` : 'No warnings'}
          onClick={openProblems}
        />

        <Chip
          icon="palette"
          text={currentTheme?.name || 'Theme'}
          color="text-gray-400"
          title={`Theme: ${currentTheme?.name}. Click to cycle.`}
          onClick={() => {
            const idx  = themes.findIndex(t => t.id === currentThemeId);
            const next = themes[(idx + 1) % themes.length];
            setTheme(next.id);
          }}
        />

        <div className="w-px h-3 bg-gray-300 mx-1 flex-shrink-0" />
        <HardwareBadge />
        <div className="w-px h-3 bg-gray-300 mx-1 flex-shrink-0" />

        {llamaRunning && (
          <Chip dotColor="bg-orange-400" pulse text="Ollama" color="text-orange-600"
            title="Ollama running — AI active"
            onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })} />
        )}
        {llamaStarting && (
          <Chip dotColor="bg-amber-400" pulse text="Ollama loading…" color="text-amber-600" title="Ollama starting" />
        )}
        {llamaError && (
          <Chip dotColor="bg-red-400" text="Ollama error" color="text-red-500"
            title={state.llamaError ?? 'Ollama error'}
            onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })} />
        )}
        {/* ── Vector indexer widget ────────────────────────────── */}
        <div className="w-px h-3 bg-gray-300 mx-1 flex-shrink-0" />
        <button
          title={idxState === 'idle' ? 'Index ready — click to re-index project' : `Indexing… ${idxPct}%`}
          onClick={() => {
            if (idxState === 'idle' && state.projectRoot) {
              (window as any).Cordex?.indexer?.start?.(state.projectRoot, true);
            }
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px', background: 'none', border: 'none', cursor: idxState === 'idle' ? 'pointer' : 'default', color: 'var(--text-muted)', fontSize: 10 }}
        >
          <span
            className={`material-symbols-outlined ${idxState !== 'idle' ? 'animate-spin' : ''}`}
            style={{ fontSize: 12, color: idxState !== 'idle' ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {idxState !== 'idle' ? 'autorenew' : 'database'}
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 9 }}>
            {idxState === 'idle'
              ? 'Index: Ready'
              : idxState === 'scanning'
              ? 'Index: Scanning…'
              : `Indexing [${idxCur}/${idxTotal}] (${idxPct}%)`}
          </span>
        </button>

        {!llamaRunning && !llamaStarting && !llamaError && (
          <Chip dotColor="bg-gray-300" text="Ollama" color="text-gray-400"
            title="Ollama offline — click to configure"
            onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })} />
        )}
      </div>

      {/* Right */}
      {activeTab && activeTab.tabType !== 'flow' && (
        <div className="flex items-center pr-1 gap-0 flex-shrink-0">
          <Chip text={`Ln ${state.cursorLine}, Col ${state.cursorCol}`} color="text-gray-500" />
          <Chip text={`${lineCount} lines`} color="text-gray-400" />
          <Chip text={`${charCount} chars`} color="text-gray-400" />
          <Chip text="UTF-8" color="text-gray-400" />
          <Chip text="Spaces: 2" color="text-gray-400" />
          {langLabel && <Chip text={langLabel} color="text-orange-600 font-semibold" title="Language mode" />}
        </div>
      )}
    </div>
  );
});
StatusBar.displayName = 'StatusBar';

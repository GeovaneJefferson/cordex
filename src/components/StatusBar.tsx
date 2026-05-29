import React, { useEffect, useState, memo } from 'react';
import { useAppState } from '../store/AppContext';
import { HardwareBadge } from './HardwareBadge';
import { themes } from '../themes';
import { useTheme } from '../hooks/useTheme';

const Cordex = (window as any).Cordex;

const Chip: React.FC<{
  icon?: string; text: string; color?: string; title?: string;
  onClick?: () => void; pulse?: boolean; dotColor?: string;
}> = ({ icon, text, color = 'text-gray-400', title, onClick, pulse, dotColor }) => (
  <button title={title} onClick={onClick}
  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors duration-100
    ${onClick ? 'hover:bg-white/40 cursor-pointer' : 'cursor-default pointer-events-none'} ${color}`}>
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
  gdscript: 'GDScript', gd: 'GDScript',   // both aliases resolve to GDScript
  lua: 'Lua', sql: 'SQL', graphql: 'GraphQL', vue: 'Vue', svelte: 'Svelte',
};

export const StatusBar: React.FC = memo(() => {
  const { state, dispatch } = useAppState();
  const { currentThemeId, setTheme } = useTheme();
  const activeTab = state.tabs.find(t => t.id === state.activeTabId);
  const currentTheme = themes.find(t => t.id === currentThemeId);
  const isDirty = activeTab?.isDirty ?? false;
  const lang = activeTab?.language ?? '';
  const langLabel = LANG_LABELS[lang] ?? lang;
  const lineCount = activeTab ? activeTab.content.split('\n').length : 0;
  const charCount = activeTab?.content.length ?? 0;
  const projectName = state.projectRoot ? state.projectRoot.split('/').pop() : null;

  const [gitBranch, setGitBranch] = useState<string | null>(null);

  // BUG FIX: previously fetched on [state.projectRoot, state.tabs] causing a
  // git status call on every keystroke (tabs update on content change).
  // Now only re-fetches when the project root actually changes.
  useEffect(() => {
    if (!state.projectRoot) { setGitBranch(null); return; }
    Cordex.git.status(state.projectRoot)
    .then((res: any) => {
      setGitBranch(res?.hasRepo && res.branch ? res.branch : null);
    })
    .catch(() => setGitBranch(null));
  }, [state.projectRoot]);

  const llamaRunning  = state.llamaStatus === 'running';
  const llamaStarting = state.llamaStatus === 'starting';
  const llamaError    = state.llamaStatus === 'error';

return (
  <div className="fixed bottom-0 left-0 right-0 h-[22px] bg-[#F0F0F0] border-t border-[#DCDCDC] flex items-center select-none z-50 text-[10px]">
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
    icon="call_split"
    text={gitBranch}
    color="text-purple-500"
    title={`Git branch: ${gitBranch}`}
    onClick={() => dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'git' })}
    />
  )}

  <Chip icon="error_outline" text="0" color="text-gray-400" title="Errors" />
  <Chip icon="warning_amber"  text="0" color="text-gray-400" title="Warnings" />  <Chip icon="palette" text={currentTheme?.name || 'Theme'} color="text-gray-400"
    title={`Current theme: ${currentTheme?.name || 'Theme'}. Click to cycle themes.`}
    onClick={() => {
      const currentIndex = themes.findIndex(t => t.id === currentThemeId);
      const nextTheme = themes[(currentIndex + 1) % themes.length];
      setTheme(nextTheme.id);
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
    <Chip dotColor="bg-amber-400" pulse text="Ollama loading…" color="text-amber-600"
    title="Ollama starting" />
  )}
  {llamaError && (
    <Chip dotColor="bg-red-400" text="Ollama error" color="text-red-500"
    title={state.llamaError ?? 'Ollama error'}
    onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })} />
  )}
  {!llamaRunning && !llamaStarting && !llamaError && (
    <Chip dotColor="bg-gray-300" text="Ollama" color="text-gray-400"
    title="Ollama offline — click to configure"
    onClick={() => dispatch({ type: 'TOGGLE_AI_SETTINGS' })} />
  )}

  {llamaRunning && state.aiSettings.autocomplete && (
    <Chip icon="auto_fix_high" text={state.aiSettings.autocomplete}
    color="text-blue-500" title={`Autocomplete model: ${state.aiSettings.autocomplete}`}
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
    {langLabel && (
      <Chip text={langLabel} color="text-orange-600 font-semibold" title="Language mode" />
    )}
    </div>
  )}
  </div>
);
});
StatusBar.displayName = 'StatusBar';

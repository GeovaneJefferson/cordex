import React, { useEffect, useRef } from 'react';
import { AppProvider, useAppState } from './store/AppContext';
import { LeftNav } from './components/Leftnav';
import { Sidebar } from './components/Sidebar';
import { EditorContainer } from './components/EditorContainer';
import { StatusBar } from './components/StatusBar';
import { FileContextMenu } from './components/FileContextMenu';
import { BugFixModal } from './components/BugFixModal';
import { AISettingsModal } from './components/AISettingsModal';

// ── GlobalShortcuts ─────────────────────────────────────────────────────────
// PERF FIX: previously depended on [state, dispatch] causing the listener to
// be re-registered on every single state change (including cursor moves).
// Now uses a ref mirror so the handler is registered once and always sees
// fresh state without re-subscribing.
const GlobalShortcuts: React.FC = () => {
  const { state, dispatch } = useAppState();

  // Mirror state into a ref so the stable handler can read current values
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; });

  useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent) => {
      const s = stateRef.current;
      const mod = e.ctrlKey || e.metaKey;

      // Escape – close panels
      if (e.key === 'Escape') {
        if (s.browserVisible) {
          dispatch({ type: 'TOGGLE_BROWSER' });
          e.preventDefault(); e.stopPropagation();
        }
        if (s.commandPaletteOpen) {
          dispatch({ type: 'TOGGLE_COMMAND_PALETTE' });
          e.preventDefault(); e.stopPropagation();
        }
        if (s.aiSettingsOpen) {
          dispatch({ type: 'TOGGLE_AI_SETTINGS' });
          e.preventDefault(); e.stopPropagation();
        }
        return;
      }

      if (!mod) return;

      // View toggles
      if (e.key === 'b') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'TOGGLE_SIDEBAR' });
        return;
      }
      if (e.key === 'j') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'TOGGLE_TERMINAL' });
        return;
      }
      if (e.shiftKey && e.key === 'B') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'TOGGLE_BROWSER' });
        return;
      }
      if (e.key === 'p') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' });
        return;
      }
      if (e.key === ',') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'TOGGLE_AI_SETTINGS' });
        return;
      }

      // Search (Ctrl+Shift+F)
      if (e.shiftKey && e.key === 'F') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'search' });
        return;
      }

      // Open File (Ctrl+O)
      if (!e.shiftKey && e.key === 'o') {
        e.preventDefault(); e.stopPropagation();
        const filePath = await (window as any).Cordex?.fs?.openFileDialog?.();
        if (filePath) {
          const result = await (window as any).Cordex?.fs?.readFile(filePath);
          if (result.ok) {
            const ext = filePath.split('.').pop();
            const langMap: Record<string, string> = {
              js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
              py: 'python', rs: 'rust', go: 'go', java: 'java', cpp: 'cpp', c: 'c',
              html: 'html', css: 'css', json: 'json', md: 'markdown',
            };
            dispatch({
              type: 'OPEN_FILE',
              payload: { path: filePath, content: result.content, language: (ext && langMap[ext]) || 'plaintext' },
            });
          }
        }
        return;
      }

      // Git panel (Ctrl+Shift+G)
      if (e.shiftKey && e.key === 'G') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'git' });
        return;
      }

      // Explorer panel (Ctrl+Shift+E)
      if (e.shiftKey && e.key === 'E') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'explorer' });
        return;
      }

      // Tab navigation
      if (e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: e.shiftKey ? 'PREVIOUS_TAB' : 'NEXT_TAB' });
        return;
      }
      if (e.key === 'w') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'CLOSE_TAB' });
        return;
      }

      // Split editor (Ctrl+\)
      if (e.key === '\\') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'TOGGLE_SPLIT' });
        return;
      }

      // New File (Ctrl+N)
      if (!e.shiftKey && e.key === 'n') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'NEW_FILE' });
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  // dispatch is stable (from useReducer); stateRef is always current via the sync effect above
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  return null;
};

const App: React.FC = () => (
  <AppProvider>
    <GlobalShortcuts />
    <div className="flex h-screen w-screen overflow-hidden pb-[22px]">
      <LeftNav />
      <Sidebar />
      <EditorContainer />
    </div>
    <StatusBar />
    <FileContextMenu />
    <BugFixModal />
    <AISettingsModal />
  </AppProvider>
);

export default App;
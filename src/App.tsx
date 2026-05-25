import React, { useEffect, useRef } from 'react';
import { AppProvider, useAppState } from './store/AppContext';
import { LeftNav } from './components/Leftnav';
import { Sidebar } from './components/Sidebar';
import { EditorContainer } from './components/EditorContainer';
import { StatusBar } from './components/StatusBar';
import { FileContextMenu } from './components/FileContextMenu';
import { BugFixModal } from './components/BugFixModal';
import { AISettingsModal } from './components/AISettingsModal';
import { fsService } from './services/fsService';

// ── GlobalShortcuts ─────────────────────────────────────────────────────────
// PERF FIX: previously depended on [state, dispatch] causing the listener to
// be re-registered on every single state change (including cursor moves).
// Now uses a ref mirror so the handler is registered once and always sees
// fresh state without re-subscribing.
const GlobalShortcuts: React.FC = () => {
  const { state, dispatch } = useAppState();

  // Mirror state into a ref so the stable handler can read current values
  const stateRef = useRef(state);
  const editor = (window as any).__activeEditor;

  useEffect(() => { stateRef.current = state; });

  useEffect(() => {
    const lastProject = localStorage.getItem('cordex_last_project');
    if (!lastProject || state.projectRoot) return; // nothing to restore or already open

    (async () => {
      const result = await fsService.readDir(lastProject);
      if (result?.ok && result.tree) {
        dispatch({ type: 'SET_PROJECT', root: lastProject, tree: result.tree });

        // 🔥 Fire-and-forget embedding index – runs only once after startup restore
        (window as any).Cordex?.ai?.embedProject?.({ projectRoot: lastProject })
          .catch((err: any) => console.warn('Startup embedding index failed:', err));
      } else {
        localStorage.removeItem('cordex_last_project'); // stale folder
      }
    })();
  }, []);

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
        if (editor) editor.focus();
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

      // Ctrl+G – Go to line
      if (!e.shiftKey && e.key === 'g') {
        e.preventDefault();
        e.stopPropagation();

        if (!editor) return;

        const lineStr = window.prompt('Go to line:');
        if (lineStr === null) return;

        const line = parseInt(lineStr, 10);
        if (isNaN(line) || line < 1) return;

        const model = editor.getModel();
        const maxLine = model?.getLineCount() || 1;
        const targetLine = Math.min(line, maxLine);

        editor.setPosition({ lineNumber: targetLine, column: 1 });
        editor.revealLineInCenter(targetLine);
        editor.focus();

        return;
      }
      // Ctrl+Shift+C – focus the active editor
      if (e.shiftKey && e.key === 'C') {
        e.preventDefault();
        e.stopPropagation();
        const currentEditor = (window as any).__activeEditor;
        if (currentEditor) {
          currentEditor.focus();
        }
        return;
      }
      // Ctrl+K – Open folder
      if (!e.shiftKey && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        const dir = await fsService.openProject();
        if (!dir) return;
        (window as any).__cordexRoot = dir;
        const result = await fsService.readDir(dir);
        if (result?.ok && result.tree) {
          dispatch({ type: 'SET_PROJECT', root: dir, tree: result.tree });
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

const ResizableSidebar: React.FC = () => {
  const { state } = useAppState();
  const [sidebarWidth, setSidebarWidth] = React.useState(260);
  const resizerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = resizerRef.current;
    if (!el) return;
    const onDown = (e: MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX, startW = sidebarWidth;
      const onMove = (mv: MouseEvent) => {
        const w = Math.min(480, Math.max(160, startW + mv.clientX - startX));
        setSidebarWidth(w);
      };
      const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    };
    el.addEventListener('mousedown', onDown);
    return () => el.removeEventListener('mousedown', onDown);
  }, [sidebarWidth]);

  return (
    <div style={{ display: 'flex', position: 'relative', flexShrink: 0 }}>
      <div style={{
        width: state.sidebarVisible ? sidebarWidth : 0,
        minWidth: state.sidebarVisible ? sidebarWidth : 0,
        overflow: 'hidden',
        transition: state.sidebarVisible ? 'none' : 'width 220ms cubic-bezier(0.4,0,0.2,1)',
      }}>
        <Sidebar />
      </div>
      {state.sidebarVisible && (
        <div
          ref={resizerRef}
          style={{
            width: 4, cursor: 'col-resize', flexShrink: 0,
            background: '#e2e8f0', transition: 'background 0.15s', zIndex: 20,
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f97316')}
          onMouseLeave={e => (e.currentTarget.style.background = '#e2e8f0')}
        />
      )}
    </div>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <GlobalShortcuts />
    <div className="flex h-screen w-screen overflow-hidden pb-[22px]">
      <LeftNav />
      <ResizableSidebar />
      <EditorContainer />
    </div>
    <StatusBar />
    <FileContextMenu />
    <BugFixModal />
    <AISettingsModal />
  </AppProvider>
);

export default App;
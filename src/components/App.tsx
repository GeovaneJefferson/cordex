import React, { useEffect, useRef } from 'react';
import { AppProvider, useAppState } from './store/AppContext';
import { LeftNav } from './components/Leftnav';
import { Sidebar } from './components/Sidebar';
import { EditorContainer } from './components/EditorContainer';
import { StatusBar } from './components/StatusBar';
import { FileContextMenu } from './components/FileContextMenu';
import { BugFixModal } from './components/BugFixModal';
import { AISettingsModal } from './components/AISettingsModal';
import { SetupProgress } from './components/SetupProgress';
import { fsService } from './services/fsService';
import { useTheme } from './hooks/useTheme';

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

  // ── Track mouse button state globally so ResizeObserver can skip layout ─
  // during text selection (prevents Monaco selection jumping on scroll)
  useEffect(() => {
    const down = (e: MouseEvent) => { (window as any).__mouseButtonsHeld = e.buttons; };
    const up   = (e: MouseEvent) => { (window as any).__mouseButtonsHeld = e.buttons; };
    // Use bubble phase only — never intercept events in capture phase
    window.addEventListener('mousedown', down);
    window.addEventListener('mouseup',   up);
    window.addEventListener('mousemove', (e: MouseEvent) => {
      (window as any).__mouseButtonsHeld = e.buttons;
    });
    return () => {
      window.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup',   up);
    };
  }, []);

  // ── Bootstrap: load all persisted settings on first mount ───────────────
  useEffect(() => {
    (async () => {
      try {
        const saved = await (window as any).Cordex?.settings?.get?.();
        if (saved && Object.keys(saved).length > 0) {
          dispatch({ type: 'SET_SETTINGS', settings: saved });
        }
      } catch {}

      // Apply editor prefs from localStorage immediately (before settings IPC returns)
      const getLS = (k: string, d: any) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } };
      const opts = {
        fontSize:            getLS('ce_fontSize', 13),
        minimap:            { enabled: getLS('ce_minimap', false) },
        lineNumbers:         getLS('ce_lineNumbers', 'on'),
        wordWrap:            getLS('ce_wordWrap', 'off'),
        tabSize:             getLS('ce_tabSize', 2),
        renderWhitespace:    getLS('ce_whitespace', 'none'),
        formatOnSave:        getLS('ce_formatOnSave', false),
        formatOnPaste:       getLS('ce_formatOnPaste', false),
        cursorBlinking:      getLS('ce_cursorBlinking', 'blink'),
        cursorStyle:         getLS('ce_cursorStyle', 'line'),
        fontLigatures:       getLS('ce_ligatures', false),
        renderLineHighlight: getLS('ce_lineHighlight', 'all'),
        smoothScrolling:     getLS('ce_smoothScroll', true),
        stickyScroll:       { enabled: getLS('ce_stickyScroll', false) },
        bracketPairColorization: { enabled: getLS('ce_bracketPairs', true) },
      };
      // Fire immediately for any already-mounted editors
      window.dispatchEvent(new CustomEvent('cordex:editor-options', { detail: opts }));
      // Also fire after a short delay in case editors mount after this effect
      setTimeout(() => window.dispatchEvent(new CustomEvent('cordex:editor-options', { detail: opts })), 300);
      setTimeout(() => window.dispatchEvent(new CustomEvent('cordex:editor-options', { detail: opts })), 800);

      // Restore UI zoom
      const zoom = getLS('ce_uiZoom', 100);
      (window as any).Cordex?.zoom?.set?.((zoom || 100) / 100);
    })();
  }, []); // eslint-disable-line

  // Re-apply editor settings whenever a new editor mounts
  useEffect(() => {
    const getLS = (k: string, d: any) => { try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : d; } catch { return d; } };
    const handler = () => {
      const opts = {
        fontSize:            getLS('ce_fontSize', 13),
        minimap:            { enabled: getLS('ce_minimap', false) },
        lineNumbers:         getLS('ce_lineNumbers', 'on'),
        wordWrap:            getLS('ce_wordWrap', 'off'),
        tabSize:             getLS('ce_tabSize', 2),
        renderWhitespace:    getLS('ce_whitespace', 'none'),
        cursorBlinking:      getLS('ce_cursorBlinking', 'smooth'),
        cursorStyle:         getLS('ce_cursorStyle', 'line'),
        fontLigatures:       getLS('ce_ligatures', false),
        renderLineHighlight: getLS('ce_lineHighlight', 'all'),
        smoothScrolling:     getLS('ce_smoothScroll', true),
        stickyScroll:       { enabled: getLS('ce_stickyScroll', false) },
        bracketPairColorization: { enabled: getLS('ce_bracketPairs', true) },
      };
      window.dispatchEvent(new CustomEvent('cordex:editor-options', { detail: opts }));
    };
    window.addEventListener('cordex:editor-mounted', handler);
    return () => window.removeEventListener('cordex:editor-mounted', handler);
  }, []);

  useEffect(() => {
    const lastProject = localStorage.getItem('cordex_last_project');
    if (!lastProject || state.projectRoot) return; // nothing to restore or already open

    (async () => {
      const result = await fsService.readDir(lastProject);
      if (result?.ok && result.tree) {
        dispatch({ type: 'SET_PROJECT', root: lastProject, tree: result.tree });
        (window as any).Cordex?.indexer?.setRoot?.(lastProject);

        // 🔥 Fire-and-forget embedding index – runs only once after startup restore
        (window as any).Cordex?.ai?.embedProject?.(lastProject)
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
      if (e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'SET_SIDEBAR_PANEL', panel: 'search' });
        // Emit event so SearchPanel can re-focus the input even if already mounted
        setTimeout(() => window.dispatchEvent(new CustomEvent('cordex:focus-search')), 50);
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
          (window as any).Cordex?.indexer?.setRoot?.(dir);
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
        // Focus editor — retry until Monaco mounts
        const tryFocus = (attempts = 0) => {
          const ed = (window as any).__activeEditor;
          if (ed) { ed.focus(); return; }
          if (attempts < 10) setTimeout(() => tryFocus(attempts + 1), 60);
        };
        setTimeout(tryFocus, 60);
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
  const sidebarWidthRef = React.useRef(sidebarWidth);
  const resizerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  React.useEffect(() => {
    const el = resizerRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = sidebarWidthRef.current;
      const onMove = (mv: PointerEvent) => {
        const w = Math.min(480, Math.max(160, startW + mv.clientX - startX));
        setSidebarWidth(w);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
      };
      el.setPointerCapture?.(e.pointerId);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [state.sidebarVisible]);

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

const AppInner: React.FC = () => {
  useTheme();

  return (
    <>
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
      <SetupProgress />
    </>
  );
};

const App: React.FC = () => (
  <AppProvider>
    <AppInner />
  </AppProvider>
);

export default App;
import React, { useEffect } from 'react';
import { AppProvider, useAppState } from './store/AppContext';
import { LeftNav } from './components/Leftnav';
import { Sidebar } from './components/Sidebar';
import { EditorContainer } from './components/EditorContainer';
import { StatusBar } from './components/StatusBar';
import { FileContextMenu } from './components/FileContextMenu';
import { BugFixModal } from './components/BugFixModal';
import { AISettingsModal } from './components/AISettingsModal';

const GlobalShortcuts: React.FC = () => {
  const { state, dispatch } = useAppState();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const { tagName, contentEditable } = document.activeElement as HTMLElement ?? {};

      // Ignore when user is typing in an input / contenteditable
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        contentEditable === 'true'
      ) {
        return;
      }

      // ── View toggles ──────────────────────────────────────────────
      if (e.key === 'Escape') {
        if (state.browserVisible) {
          dispatch({ type: 'TOGGLE_BROWSER' });
          e.preventDefault();
          e.stopPropagation();      // ⚡ stop Monaco from seeing it
        }
        if (state.commandPaletteOpen) {
          dispatch({ type: 'TOGGLE_COMMAND_PALETTE' });
          e.preventDefault();
          e.stopPropagation();
        }
        if (state.aiSettingsOpen) {
          dispatch({ type: 'TOGGLE_AI_SETTINGS' });
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (mod && e.key === 'b') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_SIDEBAR' });
        return;
      }

      if (mod && e.key === 'j') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_TERMINAL' });
        return;
      }

      if (mod && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_BROWSER' });
        return;
      }

      if (mod && e.key === 'p') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_COMMAND_PALETTE' });
        return;
      }

      if (mod && e.key === ',') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_AI_SETTINGS' });
        return;
      }

      // ── Tab navigation ───────────────────────────────────────────
      if (mod && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: e.shiftKey ? 'PREVIOUS_TAB' : 'NEXT_TAB' });
        return;
      }

      if (mod && e.key === 'w') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'CLOSE_TAB' });
        return;
      }

      // ── Split editor ─────────────────────────────────────────────
      if (mod && e.key === '\\') {
        e.preventDefault();
        e.stopPropagation();
        dispatch({ type: 'TOGGLE_SPLIT' });
        return;
      }

      // You can add more shortcuts (save, open, etc.) here
    };

    // ⚡ Capture phase – runs before Monaco gets the event
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [state, dispatch]);

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
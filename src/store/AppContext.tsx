import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { initialState, reducer } from './reducer';
import type { AppState, AppAction } from '../types';
import { detectLanguage } from '../utils/fileIcons';
import { settingsService } from '../services';

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}>({ state: initialState, dispatch: () => {} });

const Cordex = (window as any).Cordex;

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Hardware info
    Cordex?.hardware?.info?.()?.then((hw: any) => {
      if (hw) dispatch({ type: 'SET_HARDWARE', hw });
    });

    // Restore app settings and last session
    (async () => {
      try {
        const storedSettings = await settingsService.get?.();
        if (storedSettings && typeof storedSettings === 'object') {
          dispatch({ type: 'SET_SETTINGS', settings: storedSettings });
        }
      } catch {
        // ignore if settings are unavailable
      }
    })();

    Cordex?.session?.load?.()?.then((session: any) => {
      if (!session) return;
      if (session.aiSettings) dispatch({ type: 'SET_AI_SETTINGS', settings: session.aiSettings });
      if (session.projectRoot && session.fileTree) {
        dispatch({ type: 'SET_PROJECT', root: session.projectRoot, tree: session.fileTree });
        (window as any).__cordexRoot = session.projectRoot;
      }
      if (session.tabs?.length) {
        session.tabs.forEach((tab: any) => {
          // FIX: re-detect language for tabs saved before language support was added.
          // If stored as 'plaintext' but the filename has a known extension, upgrade it.
          if ((!tab.language || tab.language === 'plaintext') && tab.name) {
            const detected = detectLanguage(tab.name);
            if (detected && detected !== 'plaintext') tab.language = detected;
          }
          dispatch({ type: 'ADD_TAB', tab });
        });
        if (session.activeTabId) dispatch({ type: 'SET_ACTIVE_TAB', id: session.activeTabId });
      }
    });

    // Probe Ollama — uses Cordex.ollama.ping() (the real API).
    // Cordex.llama does NOT exist; the old call was silently returning undefined.
    probeLlama(dispatch);
    const interval = setInterval(() => probeLlama(dispatch), 15_000);

    return () => clearInterval(interval);
  }, []);

  // Debounced session save
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      Cordex?.session?.save?.({
        aiSettings:  state.aiSettings,
        projectRoot: state.projectRoot,
        fileTree:    state.fileTree,
        activeTabId: state.activeTabId,
        tabs: state.tabs.filter(t => t.tabType !== 'flow').map(t => ({
          ...t, isDirty: false,
        })),
      });
    }, 1000);
  }, [state.projectRoot, state.tabs, state.activeTabId, state.aiSettings]);
  
  useEffect(() => {
    if (state.projectRoot) {
      console.log('Renderer sending project-root:', state.projectRoot);
      Cordex.send('set-project-root', state.projectRoot);
    }
  }, [state.projectRoot]);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
    {children}
    </AppContext.Provider>
  );
};

async function probeLlama(dispatch: React.Dispatch<AppAction>) {
  try {
    const res = await Cordex?.ollama?.ping?.();
    if (res?.ok === true) {
      dispatch({ type: 'SET_LLAMA_STATUS', status: 'running', error: null });
    } else {
      dispatch({ type: 'SET_LLAMA_STATUS', status: 'stopped', error: null });
    }
  } catch {
    dispatch({ type: 'SET_LLAMA_STATUS', status: 'stopped', error: null });
  }
}

export const useAppState = () => useContext(AppContext);

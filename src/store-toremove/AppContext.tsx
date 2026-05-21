import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import { AppState, AppAction, initialState, reducer } from './reducer';

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

    // Restore last session
    Cordex?.session?.load?.()?.then((session: any) => {
      if (!session) return;
      if (session.aiSettings) dispatch({ type: 'SET_AI_SETTINGS', settings: session.aiSettings });
      if (session.projectRoot && session.fileTree) {
        dispatch({ type: 'SET_PROJECT', root: session.projectRoot, tree: session.fileTree });
        (window as any).__cordexRoot = session.projectRoot;
      }
      if (session.tabs?.length) {
        session.tabs.forEach((tab: any) => dispatch({ type: 'ADD_TAB', tab }));
        if (session.activeTabId) dispatch({ type: 'SET_ACTIVE_TAB', id: session.activeTabId });
      }
    });

    // Probe llama-server status
    probeLlama(dispatch);
    const interval = setInterval(() => probeLlama(dispatch), 15000);

    // Listen for llama-server status changes from main process
    Cordex?.llama?.onStatus?.((d: any) => {
      dispatch({ type: 'SET_LLAMA_STATUS', status: d.status, error: d.error });
    });

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

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

async function probeLlama(dispatch: React.Dispatch<AppAction>) {
  try {
    const s = await Cordex?.llama?.status?.();
    if (s) dispatch({ type: 'SET_LLAMA_STATUS', status: s.status, error: s.error ?? null });
  } catch {}
}

export const useAppState = () => useContext(AppContext);

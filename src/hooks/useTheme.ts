import { useEffect, useCallback } from 'react';
import * as monaco from 'monaco-editor';
import { useAppState } from '../store/AppContext';
import { getTheme } from '../themes';
import { settingsService } from '../services';  // from barrel

export function useTheme() {
  const { state, dispatch } = useAppState();
  const currentThemeId = state.settings?.theme || 'atom-one-light';

  useEffect(() => {
    const theme = getTheme(currentThemeId);
    if (!theme) return;

    monaco.editor.defineTheme(theme.id, theme.data);
    monaco.editor.setTheme(theme.id);
    document.documentElement.dataset.theme = theme.id;
  }, [currentThemeId]);

  const setTheme = useCallback(async (themeId: string) => {
    const newSettings = { ...state.settings, theme: themeId };
    dispatch({ type: 'SET_SETTINGS', settings: newSettings });
    try {
      await settingsService.set({ theme: themeId });
    } catch {
      // best-effort persistence
    }
  }, [state.settings, dispatch]);

  return { currentThemeId, setTheme };
}
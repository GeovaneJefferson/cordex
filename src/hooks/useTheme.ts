import { useEffect, useCallback } from 'react';
import type * as monaco from 'monaco-editor';
import { useAppState } from '../store/AppContext';
import { getTheme, applyThemeCssVars } from '../themes';
import { settingsService } from '../services';  // from barrel

export function useTheme() {
  const { state, dispatch } = useAppState();
  const currentThemeId = state.settings?.theme || 'atom-one-light';

  useEffect(() => {
    const theme = getTheme(currentThemeId);
    if (!theme) return;

    (async () => {
      try {
        const mon = await import('monaco-editor');
        mon.editor.defineTheme(theme.id, theme.data);
        mon.editor.setTheme(theme.id);
      } catch (err) {
        // Monaco not loaded yet — that's fine, CodeEditor will register themes when it loads
      }
      applyThemeCssVars(theme.cssVars);
      document.documentElement.dataset.theme = theme.id;
    })();
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
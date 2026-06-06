import { useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../store/AppContext';
import { getTheme, applyThemeCssVars } from '../themes';
import { settingsService } from '../services';

const LS_KEY = 'cordex_theme';

// Apply theme synchronously before React renders — called once at module load
function applyThemeNow(themeId: string) {
  const theme = getTheme(themeId);
  if (!theme) return;
  applyThemeCssVars(theme.cssVars);
  document.documentElement.dataset.theme = themeId;
  // Monaco is almost certainly not loaded yet at module-load time, skip it
}

// Immediately apply whatever theme was last saved — eliminates the white flash
const _initial = (() => { try { return localStorage.getItem(LS_KEY) || 'atom-one-light'; } catch { return 'atom-one-light'; } })();
applyThemeNow(_initial);

export function useTheme() {
  const { state, dispatch } = useAppState();
  const appliedRef = useRef<string>('');

  // Derive current theme id — settings.theme wins once it loads from IPC
  const lsTheme       = (() => { try { return localStorage.getItem(LS_KEY) || ''; } catch { return ''; } })();
  const currentThemeId = state.settings?.theme || lsTheme || 'atom-one-light';

  useEffect(() => {
    if (appliedRef.current === currentThemeId) return;
    appliedRef.current = currentThemeId;

    const theme = getTheme(currentThemeId);
    if (!theme) return;

    // Persist
    try { localStorage.setItem(LS_KEY, currentThemeId); } catch {}

    // Apply CSS vars immediately
    applyThemeCssVars(theme.cssVars);
    document.documentElement.dataset.theme = currentThemeId;

    // Apply Monaco theme (async import — editor may or may not be mounted yet)
    import('monaco-editor').then(mon => {
      try {
        mon.editor.defineTheme(theme.id, theme.data);
        mon.editor.setTheme(theme.id);
      } catch {}
    }).catch(() => {});
  }, [currentThemeId]);

  const setTheme = useCallback(async (themeId: string) => {
    dispatch({ type: 'SET_SETTINGS', settings: { ...state.settings, theme: themeId } });
    try { await settingsService.set({ theme: themeId }); } catch {}
  }, [state.settings, dispatch]);

  return { currentThemeId, setTheme };
}

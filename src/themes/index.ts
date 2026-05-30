import type * as monaco from 'monaco-editor';

export interface Theme {
  id: string;
  name: string;
  uiClass?: string;
  cssVars: {
    '--bg-app': string;
    '--bg-elevated': string;
    '--bg-subtle': string;
    '--bg-muted': string;
    '--bg-strong': string;
    '--text-primary': string;
    '--text-secondary': string;
    '--text-tertiary': string;
    '--text-muted': string;
    '--text-faint': string;
    '--border-subtle': string;
    '--border-default': string;
    '--border-strong': string;
    '--scrollbar-thumb': string;
    '--scrollbar-hover': string;
    '--statusbar-bg': string;
    '--statusbar-border': string;
    '--tabbar-bg': string;
  };
  data: monaco.editor.IStandaloneThemeData;
}

export function applyThemeCssVars(cssVars: Theme['cssVars']) {
  const root = document.documentElement;
  Object.entries(cssVars).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}

interface ThemeModule {
  default?: Theme;
}

const themeModules = import.meta.glob<{ default: Theme }>(
  './*.ts',
  { eager: true }
);

export const themes: Theme[] = Object.entries(themeModules)
  .filter(([filePath]) => !filePath.endsWith('/index.ts'))
  .map(([filePath, mod]) => {
    const theme = mod.default;

    if (!theme || !theme.data || !theme.cssVars || !theme.name || !theme.id) {
      throw new Error(`Theme file "${filePath}" must export a default Theme object.`);
    }

    return theme;
  });

export function getTheme(id: string): Theme | undefined {
  return themes.find(t => t.id === id);
}
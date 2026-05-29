// import atomOneLight from './atomOneLight';
// import atomOneDark from './atomOneDark';
// import solarizedDark from './solarizedDark';
// import darkProtocol from './darkProtocol';
// import type * as monaco from 'monaco-editor';
// 
// export interface Theme {
  // id: string;
  // name: string;
  // data: monaco.editor.IStandaloneThemeData;
  // uiClass?: string;
// }
// 
// export const themes: Theme[] = [
  // { id: 'atom-one-light', name: 'Atom One Light', data: atomOneLight },
  // { id: 'atom-one-dark',  name: 'Atom One Dark',  data: atomOneDark },
  // { id: 'dark-protocol', name: 'Dark Protocl', uiClass: 'theme-dark-protocol', data: darkProtocol },
  // { id: 'solarized-dark', name: 'Solarized Dark', uiClass: 'theme-solarized-dark', data: solarizedDark },
// ];
// 
// export function getTheme(id: string): Theme | undefined {
  // return themes.find(t => t.id === id);
// }
// 

/// <reference types="vite/client" />

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
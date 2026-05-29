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
import type * as monaco from 'monaco-editor';

export interface Theme {
  id: string;
  name: string;
  uiClass?: string;
  // Hold all UI colors right here
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
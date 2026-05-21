import atomOneLight from './atomOneLight';
import atomOneDark from './atomOneDark';
import type * as monaco from 'monaco-editor';

export interface Theme {
  id: string;
  name: string;
  data: monaco.editor.IStandaloneThemeData;
}

export const themes: Theme[] = [
  { id: 'atom-one-light', name: 'Atom One Light', data: atomOneLight },
  { id: 'atom-one-dark',  name: 'Atom One Dark',  data: atomOneDark },
];

export function getTheme(id: string): Theme | undefined {
  return themes.find(t => t.id === id);
}
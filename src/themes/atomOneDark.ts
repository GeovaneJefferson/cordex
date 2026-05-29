import type * as monaco from 'monaco-editor';

export const name = 'Atom One Dark';
export const cssVars = {
  '--bg-app': '#282C34',
  '--bg-elevated': '#2C313A',
  '--bg-subtle': '#2C313A',
  '--bg-muted': '#3E4451',
  '--bg-strong': '#4B5263',
  '--text-primary': '#D7DAE0',
  '--text-secondary': '#ABB2BF',
  '--text-tertiary': '#9DA5B4',
  '--text-muted': '#6B7280',
  '--text-faint': '#4B5263',
  '--border-subtle': '#2C313A',
  '--border-default': '#3E4451',
  '--border-strong': '#4B5263',
  '--scrollbar-thumb': '#3E4451',
  '--scrollbar-hover': '#4B5263',
  '--statusbar-bg': '#282C34',
  '--statusbar-border': '#2C313A',
  '--tabbar-bg': '#282C34',
};

export const data: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5C6370', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'C678DD' },
    { token: 'string', foreground: '98C379' },
    { token: 'number', foreground: 'D19A66' },
    { token: 'function', foreground: '61AFEF' },
    { token: 'type', foreground: 'E5C07B' },
    { token: 'variable', foreground: 'E06C75' },
    { token: 'constant', foreground: 'D19A66' },
    { token: 'operator', foreground: 'ABB2BF' },
    { token: '', foreground: 'ABB2BF' },
  ],
  colors: {
    'editor.background': '#282C34',
    'editor.foreground': '#ABB2BF',
    'editor.lineHighlightBackground': '#2C313A',
    'editorLineNumber.foreground': '#636D83',
    'editor.selectionBackground': '#3E4451',
    'editorCursor.foreground': '#528BFF',
    'editor.inactiveSelectionBackground': '#3E4451',
  },
};

const theme = {
  id: 'atom-one-dark',
  name,
  cssVars,
  data,
} as const;

export default theme;
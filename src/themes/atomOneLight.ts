import type * as monaco from 'monaco-editor';

export const name = 'Atom One Light';
export const cssVars = {
  '--bg-app': '#ffffff',
  '--bg-elevated': '#F7F7F7',
  '--bg-subtle': '#F0F0F0',
  '--bg-muted': '#e5e7eb',
  '--bg-strong': '#d1d5db',
  '--text-primary': '#111827',
  '--text-secondary': '#374151',
  '--text-tertiary': '#6b7280',
  '--text-muted': '#6b7280',
  '--text-faint': '#9ca3af',
  '--border-subtle': '#e5e7eb',
  '--border-default': '#d1d5db',
  '--border-strong': '#9ca3af',
  '--scrollbar-thumb': '#d1d5db',
  '--scrollbar-hover': '#9ca3af',
  '--statusbar-bg': '#f8fafc',
  '--statusbar-border': '#e5e7eb',
  '--tabbar-bg': '#f8fafc',
};

export const data: monaco.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: 'A0A1A7', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'A626A4' },
    { token: 'string', foreground: '50A14F' },
    { token: 'number', foreground: '986801' },
    { token: 'regexp', foreground: '50A14F' },
    { token: 'type', foreground: 'E45649' },
    { token: 'class', foreground: 'E45649' },
    { token: 'function', foreground: '4078F2' },
    { token: 'variable', foreground: '986801' },
    { token: 'constant', foreground: '986801' },
    { token: 'attr-name', foreground: '986801' },
    { token: 'tag', foreground: 'E45649' },
    { token: 'attribute', foreground: '986801' },
    { token: 'operator', foreground: '383A42' },
    { token: 'delimiter', foreground: '383A42' },
    { token: 'punctuation', foreground: '383A42' },
    { token: 'namespace', foreground: 'CA1243' },
  ],
  colors: {
    'editor.background': '#FAFAFA',
    'editor.foreground': '#383A42',
    'editor.lineHighlightBackground': '#F2F2F2',
    'editorLineNumber.foreground': '#9D9D9F',
    'editor.selectionBackground': '#E5E5E5',
    'editorCursor.foreground': '#526FFF',
    'editor.inactiveSelectionBackground': '#E5E5E5',
    'editorWidget.background': '#FAFAFA',
    'editorWidget.border': '#DBDBDB',
    'input.background': '#FAFAFA',
    'input.border': '#DBDBDB',
    'focusBorder': '#526FFF',
  },
};

const theme = {
  id: 'atom-one-light',
  name,
  cssVars,
  data,
} as const;

export default theme;
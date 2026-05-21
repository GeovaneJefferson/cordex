import type * as monaco from 'monaco-editor';

const theme: monaco.editor.IStandaloneThemeData = {
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

export default theme;
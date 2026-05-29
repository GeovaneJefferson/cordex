import type * as monaco from 'monaco-editor';

const theme: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '586e75', fontStyle: 'italic' },
    { token: 'keyword', foreground: '859900', fontStyle: 'bold' },
    { token: 'string', foreground: '2aa198' },
    { token: 'number', foreground: 'b58900' },
    { token: 'regexp', foreground: 'd33682' },
    { token: 'type', foreground: '268bd2' },
    { token: 'class', foreground: '268bd2' },
    { token: 'function', foreground: '859900' },
    { token: 'variable', foreground: '93a1a1' },
    { token: 'constant', foreground: 'b58900' },
    { token: 'identifier', foreground: '839496' },
    { token: 'operator', foreground: '93a1a1' },
    { token: 'delimiter', foreground: '93a1a1' },
    { token: 'tag', foreground: '859900' },
    { token: 'attribute', foreground: 'b58900' },
  ],
  colors: {
    'editor.background': '#002b36',
    'editor.foreground': '#839496',
    'editor.lineHighlightBackground': '#073642',
    'editorLineNumber.foreground': '#586e75',
    'editor.selectionBackground': '#073642',
    'editorCursor.foreground': '#93a1a1',
    'editor.inactiveSelectionBackground': '#073642',
    'editorWidget.background': '#002b36',
    'editorWidget.border': '#586e75',
    'input.background': '#002b36',
    'input.border': '#586e75',
    'focusBorder': '#268bd2',
  },
};

export default theme;

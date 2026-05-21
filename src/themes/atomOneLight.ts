import type * as monaco from 'monaco-editor';

const theme: monaco.editor.IStandaloneThemeData = {
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

export default theme;
import React, { useRef, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useAppState } from '../store/AppContext';
import { themes } from '../themes';
import { Tab } from '../types';
import { detectLanguage } from '../utils/fileIcons';

// ── Theme registration ──────────────────────────────────────────────────
let _themesReady = false;
function ensureThemes() {
  if (_themesReady) return;
  _themesReady = true;
  themes.forEach(t => monaco.editor.defineTheme(t.id, t.data));
}

// ── GDScript registration ───────────────────────────────────────────────
let _gdscriptReady = false;
function ensureGDScript() {
  if (_gdscriptReady) return;
  _gdscriptReady = true;

  monaco.languages.register({ id: 'gdscript' });

  monaco.languages.setMonarchTokensProvider('gdscript', {
    tokenizer: {
      root: [
        [/^\s*#.*/, 'comment'],
        [/\b(?:func|class|extends|return|if|elif|else|for|while|break|continue|pass|self|is|in|as|onready|on|export|signal|static|tool|extends|var|const|enum|match)\b/, 'keyword'],
        [/\b(?:true|false|null)\b/, 'keyword'],
        [/"(?:[^"\\]|\\.)*"/, 'string'],
        [/'(?:[^'\\]|\\.)*'/, 'string'],
        [/\d+\.?\d*(?:e[+-]?\d+)?/, 'number'],
        [/[{}()\[\]]/, 'delimiter'],
        [/[a-zA-Z_]\w*/, 'identifier'],
        [/[+\-*/<>=!&|^~%]+/, 'operator'],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration('gdscript', {
    comments: { lineComment: '#' },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
}
ensureGDScript();

// ── Local storage helpers ───────────────────────────────────────────────
const THEME_KEY    = 'cordex_editor_theme';
const FONTSIZE_KEY = 'cordex_editor_fontSize';

function storedTheme() {
  const v = localStorage.getItem(THEME_KEY);
  return v && themes.find(t => t.id === v) ? v : 'atom-one-light';
}
function storedFontSize() {
  const n = parseInt(localStorage.getItem(FONTSIZE_KEY) ?? '', 10);
  return n >= 8 && n <= 28 ? n : 13;
}

// ── Component ───────────────────────────────────────────────────────────
export const CodeEditor: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state, dispatch } = useAppState();
  const tab = state.tabs.find((t: Tab) => t.id === tabId);

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const ignoreRef    = useRef(false);
  const themeRef     = useRef(storedTheme());
  const fontRef      = useRef(storedFontSize());

  // For integer‑pixel layout fix
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

  // Observe the wrapper size
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) setWrapperSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Font size via keyboard ──────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        fontRef.current = Math.min(28, fontRef.current + 1);
        localStorage.setItem(FONTSIZE_KEY, String(fontRef.current));
        editorRef.current?.updateOptions({ fontSize: fontRef.current });
      }
      if (e.key === '-') {
        e.preventDefault();
        fontRef.current = Math.max(8, fontRef.current - 1);
        localStorage.setItem(FONTSIZE_KEY, String(fontRef.current));
        editorRef.current?.updateOptions({ fontSize: fontRef.current });
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // ── Create editor ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !tab) return;

    ensureThemes();

    editorRef.current?.dispose();
    editorRef.current = null;

    const editor = monaco.editor.create(containerRef.current, {
      value:    tab.content,
      language: mapLang(tab.language),
      theme:    themeRef.current,
      fontSize: fontRef.current,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontLigatures: false,            // helps with selection precision
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      matchBrackets: 'never',          // avoid micro‑reflows while selecting
      tabSize: 2,
      wordWrap: 'off',
      selectionHighlight: true,
      occurrencesHighlight: 'singleFile',
      renderWhitespace: 'selection',
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'off',  // BUG FIX: 'on' causes jumpy bottom-to-top selection
      smoothScrolling: false,             // BUG FIX: interferes with drag selection
      mouseWheelZoom: false,
      fixedOverflowWidgets: true,         // keeps widgets inside editor bounds
      scrollbar: {
        vertical: 'auto',
        horizontal: 'auto',
        useShadows: false,
        verticalScrollbarSize: 6,
        horizontalScrollbarSize: 6,
      },
      dragAndDrop: false,
      multiCursorModifier: 'ctrlCmd',
    });

    monaco.editor.setTheme(themeRef.current);
    editorRef.current = editor;
    (window as any).__activeEditor = editor;
    
    // User edits → store
    const s1 = editor.onDidChangeModelContent(() => {
      if (ignoreRef.current) return;
      dispatch({ type: 'UPDATE_TAB_CONTENT', id: tabId, content: editor.getValue() });
    });

    // Cursor → status bar
    const s2 = editor.onDidChangeCursorPosition(e => {
      dispatch({ type: 'SET_CURSOR', line: e.position.lineNumber, col: e.position.column });
    });

    // Ctrl+S – save with Save As support
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const t = state.tabs.find((x: Tab) => x.id === tabId);
      if (!t) return;
      const content = editor.getValue();

      // BUG FIX: preserve scroll position before any async dispatch
      const scrollTop  = editor.getScrollTop();
      const scrollLeft = editor.getScrollLeft();
      const restoreScroll = () => requestAnimationFrame(() => {
        editorRef.current?.setScrollTop(scrollTop);
        editorRef.current?.setScrollLeft(scrollLeft);
      });

      if (t.path.startsWith('untitled::') || !t.path) {
        const newPath = await (window as any).Cordex?.fs?.saveAs?.(t.name);
        if (!newPath) return;
        const fileName = newPath.split('/').pop() ?? 'Untitled';

        // BUG FIX: detect language from the chosen filename so Monaco
        // reinitialises to the correct mode (e.g. 'sql', 'gdscript') and the
        // session persists the right language string instead of 'plaintext'.
        const newLang = detectLanguage(fileName);

        dispatch({ type: 'UPDATE_TAB_PATH', id: t.id, path: newPath, name: fileName });
        dispatch({ type: 'UPDATE_TAB_LANGUAGE', id: t.id, language: newLang });

        await (window as any).Cordex?.fs?.writeFile?.(newPath, content);
        dispatch({ type: 'MARK_TAB_SAVED', id: t.id });
        (window as any).Cordex?.history?.save?.({ filePath: newPath, content });
        window.dispatchEvent(new Event('cordex:history-updated'));
        // (window as any).Cordex?.ai?.embedUpdateFile?.(newPath, content);
        const root = (window as any).__cordexRoot ?? state.projectRoot;
        if (root && newPath.startsWith(root)) {
          try {
            const result = await (window as any).Cordex?.fs?.readDir?.(root);
            if (result?.ok) dispatch({ type: 'SET_FILE_TREE', tree: result.tree });
          } catch (e) { console.error('Failed to refresh file tree:', e); }
        }
        restoreScroll();
        return;
      }

      (window as any).Cordex?.fs?.writeFile?.(t.path, content)?.then(() => {
        dispatch({ type: 'MARK_TAB_SAVED', id: tabId });
        (window as any).Cordex?.history?.save?.({ filePath: t.path, content });
        window.dispatchEvent(new Event('cordex:history-updated'));
        // (window as any).Cordex?.ai?.embedUpdateFile?.(t.path, content);
        restoreScroll();
      });
    });

    // Toggle line comment
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
      editor.getAction('editor.action.commentLine')?.run();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Digit7, () => {
      editor.getAction('editor.action.commentLine')?.run();
    });

    return () => {
      s1.dispose();
      s2.dispose();
      editor.dispose();
      editorRef.current = null;
      (window as any).__activeEditor = null;
    };
  }, [tabId, tab?.language]);

  // ── Sync external changes (AI / file reload) ─────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !tab) return;
    const current = editor.getValue();
    if (current === tab.content) return;

    const model = editor.getModel();
    if (!model) return;

    // BUG FIX: preserve scroll + cursor, and use applyEdits (not pushEditOperations)
    // for external syncs so Ctrl+Z undo history stays clean for the user's own edits.
    const scrollTop  = editor.getScrollTop();
    const scrollLeft = editor.getScrollLeft();
    const pos = editor.getPosition();
    const sel = editor.getSelection();

    ignoreRef.current = true;

    // applyEdits does NOT create an undo stop — external changes (AI, file restore,
    // watcher) won't appear in the user's Ctrl+Z history.
    model.applyEdits([{ range: model.getFullModelRange(), text: tab.content }]);

    if (pos) editor.setPosition(pos);
    if (sel) editor.setSelection(sel);
    editor.setScrollTop(scrollTop);
    editor.setScrollLeft(scrollLeft);
    ignoreRef.current = false;
  }, [tab?.content]);

  // ── Integer pixel dimensions ─────────────────────────────────────────
  const width  = wrapperSize.width  > 0 ? `${Math.floor(wrapperSize.width)}px`  : '100%';
  const height = wrapperSize.height > 0 ? `${Math.floor(wrapperSize.height)}px` : '100%';

  return (
    <div className="flex-1 relative min-h-0" ref={wrapperRef}>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ width, height }}
      />
    </div>
  );
};

// ── Language mapping ────────────────────────────────────────────────────
function mapLang(lang: string): string {
  const map: Record<string, string> = {
    typescript:'typescript', tsx:'typescript', javascript:'javascript', jsx:'javascript',
    cjs:'javascript',     // BUG FIX: .cjs was falling through to plaintext
    python:'python', rust:'rust', cpp:'cpp', c:'c', go:'go', java:'java',
    css:'css', scss:'scss', json:'json', html:'html', markdown:'markdown',
    shell:'shell', yaml:'yaml', toml:'toml', rb:'ruby', php:'php',
    sql:'sql',            // BUG FIX: .sql was falling through to plaintext
    gdscript:'gdscript',
    gd:'gdscript',        // BUG FIX: .gd files → GDScript highlighting
  };
  return map[lang] ?? 'plaintext';
}

// ── Ghost autocomplete (FIM inline completions) ─────────────────────────
// Uses qwen2.5-coder:1.5b-base via the aiRouter IPC.
// Registered once; safe to call multiple times (idempotent).
let _ghostProvider: monaco.IDisposable | null = null;
let _ghostTimer: ReturnType<typeof setTimeout> | null = null;

export function registerGhostAutocomplete(): void {
  if (_ghostProvider) return;

  _ghostProvider = monaco.languages.registerInlineCompletionsProvider('*', {
    async provideInlineCompletions(model, position, _ctx, token) {
      // Skip trivially short lines
      const lineSoFar = model.getLineContent(position.lineNumber)
        .slice(0, position.column - 1).trimEnd();
      if (lineSoFar.length < 3) return { items: [] };

      // 300 ms debounce — wait for user to stop typing
      await new Promise<void>(res => {
        if (_ghostTimer) clearTimeout(_ghostTimer);
        _ghostTimer = setTimeout(res, 300);
      });
      if (token.isCancellationRequested) return { items: [] };

      // Context: up to 40 lines before + 5 after cursor
      const lnBefore = Math.max(1, position.lineNumber - 40);
      const lnAfter  = Math.min(model.getLineCount(), position.lineNumber + 5);

      const before = model.getValueInRange({
        startLineNumber: lnBefore, startColumn: 1,
        endLineNumber:   position.lineNumber, endColumn: position.column,
      });
      const after = model.getValueInRange({
        startLineNumber: position.lineNumber, startColumn: position.column,
        endLineNumber:   lnAfter, endColumn: model.getLineMaxColumn(lnAfter),
      });

      try {
        const result = await (window as any).Cordex?.ai?.autocomplete?.({
          before, after, language: model.getLanguageId(),
        });
        if (!result?.ok || !result.text?.trim()) return { items: [] };

        return {
          items: [{
            insertText: result.text,
            range: new monaco.Range(
              position.lineNumber, position.column,
              position.lineNumber, position.column
            ),
          }],
        };
      } catch {
        return { items: [] };
      }
    },
    // freeInlineCompletions() {},
    disposeInlineCompletions() {},
  });
}

// Auto-register on module load
registerGhostAutocomplete();
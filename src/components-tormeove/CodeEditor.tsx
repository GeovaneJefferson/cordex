import React, { useRef, useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import { useAppState } from '../store/AppContext';
import { themes } from '../themes';

// Register all themes once at module level — never inside a component
let _themesReady = false;
function ensureThemes() {
  if (_themesReady) return;
  _themesReady = true;
  themes.forEach(t => monaco.editor.defineTheme(t.id, t.data));
}

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

export const CodeEditor: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state, dispatch } = useAppState();
  const tab = state.tabs.find(t => t.id === tabId);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef    = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const ignoreRef    = useRef(false);
  const themeRef     = useRef(storedTheme());
  const fontRef      = useRef(storedFontSize());

  // ── Font size via keyboard — never causes editor recreate ────────────────
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

  // ── Create editor — ONLY when tabId or language changes ──────────────────
  // CRITICAL: Do NOT include tab.content in deps — causes flicker + selection loss
  useEffect(() => {
    if (!containerRef.current || !tab) return;

    ensureThemes();

    // Dispose previous
    editorRef.current?.dispose();
    editorRef.current = null;

    const editor = monaco.editor.create(containerRef.current, {
      value:    tab.content,
      language: mapLang(tab.language),
      theme:    themeRef.current,
      fontSize: fontRef.current,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontLigatures: true,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'off',
      // Selection quality
      selectionHighlight: true,
      occurrencesHighlight: 'singleFile',
      renderWhitespace: 'selection',
      // Smooth feel
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      // No focus stealing on hover / mouse events
      mouseWheelZoom: false,
      // Scrollbars
      scrollbar: {
        vertical: 'auto', horizontal: 'auto',
        useShadows: false,
        verticalScrollbarSize: 6, horizontalScrollbarSize: 6,
      },
      // Important: keep these false to avoid drag fighting with SplitEditor
      dragAndDrop: false,
      // Fix: don't let Monaco intercept middle-click pan
      multiCursorModifier: 'ctrlCmd',
    });

    // Ensure theme is applied after creation
    monaco.editor.setTheme(themeRef.current);
    editorRef.current = editor;

    // Content → store (debounced via internal Monaco batching)
    const s1 = editor.onDidChangeModelContent(() => {
      if (ignoreRef.current) return;
      dispatch({ type: 'UPDATE_TAB_CONTENT', id: tabId, content: editor.getValue() });
    });

    // Cursor → status bar
    const s2 = editor.onDidChangeCursorPosition(e => {
      dispatch({ type: 'SET_CURSOR', line: e.position.lineNumber, col: e.position.column });
    });

    // Ctrl+S → save to disk
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const t = state.tabs.find(x => x.id === tabId);
      if (!t) return;
      (window as any).Cordex?.fs?.writeFile?.(t.path, editor.getValue())?.then(() => {
        dispatch({ type: 'MARK_TAB_SAVED', id: tabId });
      });
    });

    // Ctrl+/ or Ctrl+Shift+7 → comment/uncomment
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash, () => {
      editor.getAction('editor.action.commentLine')?.run();
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Digit7, () => {
      editor.getAction('editor.action.commentLine')?.run();
    });

    // Do NOT call editor.focus() here — it causes the "Canceled" dispose loop
    // Focus is handled by the user clicking the pane

    return () => {
      s1.dispose();
      s2.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, tab?.language]); // ← ONLY tabId + language, never content

  // ── Sync AI/external content changes without recreating editor ───────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !tab) return;
    const current = editor.getValue();
    if (current === tab.content) return;
    // Preserve cursor + selection when applying external change
    ignoreRef.current = true;
    const pos   = editor.getPosition();
    const sel   = editor.getSelection();
    const model = editor.getModel();
    if (model) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: tab.content }],
        () => null
      );
    }
    if (pos)  editor.setPosition(pos);
    if (sel)  editor.setSelection(sel);
    ignoreRef.current = false;
  }, [tab?.content]);

  return (
    <div className="flex-1 relative min-h-0">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
};

function mapLang(lang: string): string {
  const map: Record<string, string> = {
    typescript:'typescript', tsx:'typescript', javascript:'javascript', jsx:'javascript',
    python:'python', rust:'rust', cpp:'cpp', c:'c', go:'go', java:'java',
    css:'css', scss:'scss', json:'json', html:'html', markdown:'markdown',
    shell:'shell', yaml:'yaml', toml:'toml', rb:'ruby', php:'php',
  };
  return map[lang] ?? 'plaintext';
}

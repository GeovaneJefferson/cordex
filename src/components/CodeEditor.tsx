import React, { useRef, useEffect, useState } from 'react';
import type * as monaco from 'monaco-editor';
import electronDts from '../electron.d.ts?raw';
import typesDts from '../types/index.ts?raw';
import { useAppState } from '../store/AppContext';
import { themes } from '../themes';
import { Tab } from '../types';
import { detectLanguage } from '../utils/fileIcons';
import { usePythonLSP } from '../hooks/usePythonLSP';   // ✅ import the hook

let _themesReady        = false;
let _gdscriptReady      = false;
let _markerListenerReady = false;
let _tsDefaultsReady    = false;
let _ghostProvider: any = null;

// ── Per-tab model cache: tabId → ITextModel ──────────────────────────────────
const _modelCache = new Map<string, monaco.editor.ITextModel>();

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
  const tab = state.tabs.find((t: Tab) => t.id === tabId);

  const containerRef   = useRef<HTMLDivElement>(null);
  const wrapperRef     = useRef<HTMLDivElement>(null);
  const editorRef      = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const ignoreRef      = useRef(false);
  const themeRef       = useRef(state.settings?.theme || storedTheme());
  const fontRef        = useRef(storedFontSize());
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

  usePythonLSP(tab?.language ?? '', state.projectRoot);

  // ── Observe wrapper size ──────────────────────────────────────────────────
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

  // ── Font size via keyboard ────────────────────────────────────────────────
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

  // ── Create / reuse editor ────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !tab) return;

    let cancelled = false;
    let localSubscriptions: monaco.IDisposable[] = [];

    (async () => {
      const mon = await import('monaco-editor');
      if (cancelled) return;

      // ── One-time setup ──────────────────────────────────────────────────
      if (!_themesReady) {
        _themesReady = true;
        themes.forEach(t => mon.editor.defineTheme(t.id, t.data));
      }

      if (!_gdscriptReady) {
        _gdscriptReady = true;
        mon.languages.register({ id: 'gdscript' });
        mon.languages.setMonarchTokensProvider('gdscript', {
          tokenizer: {
            root: [
              [/^\s*#.*/, 'comment'],
              [/\b(?:func|class|extends|return|if|elif|else|for|while|break|continue|pass|self|is|in|as|onready|on|export|signal|static|tool|var|const|enum|match)\b/, 'keyword'],
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
        mon.languages.setLanguageConfiguration('gdscript', {
          comments: { lineComment: '#' },
          brackets: [['{', '}'], ['[', ']'], ['(', ')']],
          autoClosingPairs: [
            { open: '{', close: '}' }, { open: '[', close: ']' },
            { open: '(', close: ')' }, { open: '"', close: '"' },
            { open: "'", close: "'" },
          ],
          surroundingPairs: [
            { open: '{', close: '}' }, { open: '[', close: ']' },
            { open: '(', close: ')' }, { open: '"', close: '"' },
            { open: "'", close: "'" },
          ],
        });
      }

      if (!_tsDefaultsReady) {
        _tsDefaultsReady = true;
        try {
          const tsDefaults = (mon.languages as any).typescript.typescriptDefaults;
          tsDefaults.addExtraLib(electronDts, 'ts:electron.d.ts');
          tsDefaults.addExtraLib(typesDts, 'ts:types/index.d.ts');
          tsDefaults.setCompilerOptions({
            target: (mon.languages.typescript as any).ScriptTarget.ES2020,
            moduleResolution: (mon.languages.typescript as any).ModuleResolutionKind.NodeJs,
            jsx: (mon.languages.typescript as any).JsxEmit.ReactJSX,
            strict: true,
            lib: ['es2022', 'dom'],
          });
        } catch (err) {
          console.warn('Monaco TS defaults unavailable:', err);
        }
      }

      if (!_markerListenerReady) {
        _markerListenerReady = true;
        mon.editor.onDidChangeMarkers(() => {
          const markers = mon.editor.getModelMarkers({});
          (window as any).__cordexMarkers = markers;
          window.dispatchEvent(new CustomEvent('cordex:markers-changed', { detail: markers }));
        });
      }

      // ── Get or create the model for this tab ────────────────────────────
      const lang  = mapLang(tab.language);
      const tabUri = tab.path.startsWith('untitled::')
        ? mon.Uri.parse(`file:///untitled/${tabId}.${tab.language || 'txt'}`)
        : mon.Uri.parse(`file://${tab.path}`);
        
      let model = _modelCache.get(tabId) ?? mon.editor.getModel(tabUri);
      if (!model || model.isDisposed()) {
        model = mon.editor.createModel(tab.content ?? '', lang, tabUri);
        _modelCache.set(tabId, model);
      } else {
        if (model.getValue() !== (tab.content ?? '')) {
          ignoreRef.current = true;
          model.applyEdits([{ range: model.getFullModelRange(), text: tab.content ?? '' }]);
          ignoreRef.current = false;
        }
        if (model.getLanguageId() !== lang) {
          mon.editor.setModelLanguage(model, lang);
        }
      }

      if (cancelled) return;

      // ── Dispose existing editor widget, keep model alive ───────────────
      if (editorRef.current) {
        try { editorRef.current.setModel(null); } catch {}
        try { editorRef.current.dispose(); } catch {}
        editorRef.current = null;
      }

      const editor = mon.editor.create(containerRef.current!, {
        model,
        theme:    themeRef.current,
        fontSize: fontRef.current,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: false,
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        matchBrackets: 'never',
        tabSize: 2,
        wordWrap: 'off',
        selectionHighlight: true,
        occurrencesHighlight: 'singleFile',
        renderWhitespace: 'selection',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'off',
        smoothScrolling: false,
        mouseWheelZoom: false,
        fixedOverflowWidgets: true,
        scrollbar: {
          vertical: 'auto',
          horizontal: 'auto',
          useShadows: false,
          verticalScrollbarSize: 12,
          horizontalScrollbarSize: 10,
        },
        dragAndDrop: false,
        multiCursorModifier: 'alt',
      });

      mon.editor.setTheme(themeRef.current);
      editorRef.current = editor;
      (window as any).__activeEditor = editor;

      // ── Ghost inline completions ────────────────────────────────────────
      if (!_ghostProvider) {
        _ghostProvider = mon.languages.registerInlineCompletionsProvider('*', {
          async provideInlineCompletions(model, position, _ctx, token) {
            const lineSoFar = model.getLineContent(position.lineNumber)
              .slice(0, position.column - 1).trimEnd();
            if (lineSoFar.length < 3) return { items: [] };
            await new Promise<void>(res => setTimeout(res, 300));
            if (token.isCancellationRequested) return { items: [] };
            const lnBefore = Math.max(1, position.lineNumber - 40);
            const lnAfter  = Math.min(model.getLineCount(), position.lineNumber + 5);
            const before = model.getValueInRange({ startLineNumber: lnBefore, startColumn: 1, endLineNumber: position.lineNumber, endColumn: position.column });
            const after  = model.getValueInRange({ startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: lnAfter, endColumn: model.getLineMaxColumn(lnAfter) });
            try {
              const result = await (window as any).Cordex?.ai?.autocomplete?.({ before, after, language: model.getLanguageId() });
              if (!result?.ok || !result.text?.trim()) return { items: [] };
              return { items: [{ insertText: result.text, range: new mon.Range(position.lineNumber, position.column, position.lineNumber, position.column) }] };
            } catch {
              return { items: [] };
            }
          },
          disposeInlineCompletions() {},
        });
      }

      // ── Subscriptions ───────────────────────────────────────────────────
      const s1 = editor.onDidChangeModelContent(() => {
        if (ignoreRef.current) return;
        dispatch({ type: 'UPDATE_TAB_CONTENT', id: tabId, content: editor.getValue() });
      });

      const s2 = editor.onDidChangeCursorPosition(e => {
        dispatch({ type: 'SET_CURSOR', line: e.position.lineNumber, col: e.position.column });
      });

      localSubscriptions = [s1, s2];

      // ── Ctrl+S ──────────────────────────────────────────────────────────
      editor.addCommand((mon as any).KeyMod.CtrlCmd | (mon as any).KeyCode.KeyS, async () => {
        const t = state.tabs.find((x: Tab) => x.id === tabId);
        if (!t) return;
        const content = editor.getValue();
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
          const newLang  = detectLanguage(fileName);
          dispatch({ type: 'UPDATE_TAB_PATH',     id: t.id, path: newPath, name: fileName });
          dispatch({ type: 'UPDATE_TAB_LANGUAGE', id: t.id, language: newLang });
          await (window as any).Cordex?.fs?.writeFile?.(newPath, content);
          dispatch({ type: 'MARK_TAB_SAVED', id: t.id });
          (window as any).Cordex?.history?.save?.({ filePath: newPath, content });
          window.dispatchEvent(new Event('cordex:history-updated'));
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
          restoreScroll();
        });
      });

      // ── Toggle line comment ─────────────────────────────────────────────
      editor.addCommand((mon as any).KeyMod.CtrlCmd | (mon as any).KeyCode.Slash, () => {
        editor.getAction('editor.action.commentLine')?.run();
      });
      editor.addCommand((mon as any).KeyMod.CtrlCmd | (mon as any).KeyMod.Shift | (mon as any).KeyCode.Digit7, () => {
        editor.getAction('editor.action.commentLine')?.run();
      });

      // ── Selection helpers ───────────────────────────────────────────────
      (window as any).__cordexGetSelection = () => {
        const sel = editor.getSelection();
        if (!sel || (sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn)) return null;
        const m = editor.getModel();
        return m ? m.getValueInRange(sel) : null;
      };

      (window as any).__cordexGetSelectionInfo = () => {
        const sel = editor.getSelection();
        const hasSelection = sel && !(sel.startLineNumber === sel.endLineNumber && sel.startColumn === sel.endColumn);
        if (!hasSelection) return { hasSelection: false, preview: '', lineCount: 0, range: null };
        const m = editor.getModel();
        if (!m) return { hasSelection: false, preview: '', lineCount: 0, range: null };
        const selectedText = m.getValueInRange(sel!);
        const lineCount    = sel!.endLineNumber - sel!.startLineNumber + 1;
        const preview      = selectedText.split('\n')[0].slice(0, 60);
        return {
          hasSelection: true, preview, lineCount,
          range: { startLineNumber: sel!.startLineNumber, startColumn: sel!.startColumn, endLineNumber: sel!.endLineNumber, endColumn: sel!.endColumn },
        };
      };
    })();

    return () => {
      cancelled = true;
      localSubscriptions.forEach(s => { try { s.dispose(); } catch {} });
      if (editorRef.current) {
        try { editorRef.current.setModel(null); } catch {}
        try { editorRef.current.dispose(); } catch {}
        editorRef.current = null;
      }
      (window as any).__activeEditor         = null;
      (window as any).__cordexGetSelection   = null;
      (window as any).__cordexGetSelectionInfo = null;
    };
  }, [tabId, tab?.language]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync external changes (AI / file reload) ─────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !tab) return;
    const model = editor.getModel();
    if (!model || model.isDisposed()) return;
    if (model.getValue() === tab.content) return;

    const scrollTop  = editor.getScrollTop();
    const scrollLeft = editor.getScrollLeft();
    const pos = editor.getPosition();
    const sel = editor.getSelection();

    ignoreRef.current = true;
    model.applyEdits([{ range: model.getFullModelRange(), text: tab.content ?? '' }]);
    if (pos) editor.setPosition(pos);
    if (sel) editor.setSelection(sel);
    editor.setScrollTop(scrollTop);
    editor.setScrollLeft(scrollLeft);
    ignoreRef.current = false;
  }, [tab?.content]);

  // ── Jump to line ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.gotoLine || !editorRef.current) return;
    const editor = editorRef.current;
    const line   = state.gotoLine;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    dispatch({ type: 'GOTO_LINE', line: 0 });
  }, [state.gotoLine]);

  // ── Tab closed → dispose cached model ───────────────────────────────────
  useEffect(() => {
    return () => {
      const cached = _modelCache.get(tabId);
      if (cached) {
        setTimeout(() => {
          if (!cached.isDisposed()) cached.dispose();
          _modelCache.delete(tabId);
        }, 500);
      }
    };
  }, [tabId]);

  const width  = wrapperSize.width  > 0 ? `${Math.floor(wrapperSize.width)}px`  : '100%';
  const height = wrapperSize.height > 0 ? `${Math.floor(wrapperSize.height)}px` : '100%';

  return (
    <div className="flex-1 relative min-h-0" ref={wrapperRef}>
      <div ref={containerRef} className="absolute inset-0" style={{ width, height }} />
    </div>
  );
};

// ── Language mapping ──────────────────────────────────────────────────────────
function mapLang(lang: string): string {
  const map: Record<string, string> = {
    typescript: 'typescript', tsx: 'typescript',
    javascript: 'javascript', jsx: 'javascript', cjs: 'javascript',
    python: 'python', rust: 'rust', cpp: 'cpp', c: 'c', go: 'go', java: 'java',
    css: 'css', scss: 'scss', json: 'json', html: 'html', markdown: 'markdown',
    shell: 'shell', yaml: 'yaml', toml: 'toml', rb: 'ruby', php: 'php',
    sql: 'sql', gdscript: 'gdscript', gd: 'gdscript',
  };
  return map[lang] ?? 'plaintext';
}
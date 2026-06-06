import React, { useRef, useEffect, useState } from 'react';
import type * as monaco from 'monaco-editor';
import electronDts from '../electron.d.ts?raw';
import typesDts from '../types/index.ts?raw';
import { useAppState } from '../store/AppContext';
import { themes } from '../themes';
import { Tab } from '../types';
import { detectLanguage } from '../utils/fileIcons';
import { usePythonLSP } from '../hooks/usePythonLSP';
import { notifyFileSaved } from '../hooks/useAgent';
import { useWordJump }    from '../hooks/useWordJump';

let _themesReady        = false;
let _gdscriptReady      = false;
let _markerListenerReady = false;
let _tsDefaultsReady    = false;
let _ghostProvider: any = null;

// ── Unified localStorage keys (must match AISettingsModal) ──────────────────
const THEME_KEY    = 'cordex_theme';          // matches useTheme.ts
const FONTSIZE_KEY = 'ce_fontSize';           // matches AISettingsModal

function getLS(k: string, def: any) {
  try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; } catch { return def; }
}
function storedTheme() {
  const v = localStorage.getItem(THEME_KEY);
  return v && themes.find(t => t.id === v) ? v : 'atom-one-light';
}
function storedFontSize(): number {
  const n = getLS(FONTSIZE_KEY, 13);
  return n >= 8 && n <= 28 ? n : 13;
}
function storedEditorOptions() {
  return {
    fontSize:                getLS('ce_fontSize', 13),
    minimap:                { enabled: getLS('ce_minimap', false) },
    lineNumbers:             getLS('ce_lineNumbers', 'on') as any,
    wordWrap:                getLS('ce_wordWrap', 'off') as any,
    tabSize:                 getLS('ce_tabSize', 2),
    renderWhitespace:        getLS('ce_whitespace', 'none') as any,
    formatOnSave:            getLS('ce_formatOnSave', false),
    formatOnPaste:           getLS('ce_formatOnPaste', false),
    cursorBlinking:          getLS('ce_cursorBlinking', 'smooth') as any,
    cursorStyle:             getLS('ce_cursorStyle', 'line') as any,
    fontLigatures:           getLS('ce_ligatures', false),
    renderLineHighlight:     getLS('ce_lineHighlight', 'all') as any,
    smoothScrolling:         getLS('ce_smoothScroll', true),
    stickyScroll:           { enabled: getLS('ce_stickyScroll', false) },
    bracketPairColorization:{ enabled: getLS('ce_bracketPairs', true) },
    guides:                 { bracketPairs: getLS('ce_bracketGuides', true) },
  };
}

export const CodeEditor: React.FC<{ tabId: string }> = ({ tabId }) => {
  const { state, dispatch } = useAppState();
  const tab = state.tabs.find((t: Tab) => t.id === tabId);

  const containerRef   = useRef<HTMLDivElement>(null);
  const wrapperRef     = useRef<HTMLDivElement>(null);
  const editorRef      = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef       = useRef<monaco.editor.ITextModel | null>(null);
  const ignoreRef      = useRef(false);
  const themeRef       = useRef(state.settings?.theme || storedTheme());
  const fontRef        = useRef(storedFontSize());
  const [wrapperSize, setWrapperSize] = useState({ width: 0, height: 0 });

  usePythonLSP(tab?.language ?? '', state.projectRoot);

  // ── EasyMotion word jump — Ctrl+Shift+J ─────────────────────────────────
  const monacoObjRef = useRef<any>(null);
  const wjDecorRef   = useRef<string[]>([]);
  useWordJump(editorRef, monacoObjRef, wjDecorRef);

  // ── Observe wrapper size & drive layout manually ────────────────────
  // We use automaticLayout:false + manual ResizeObserver so we can SKIP
  // layout() calls while the user is selecting text (mouse button held).
  // automaticLayout:true fires layout() inside ResizeObserver which resets
  // internal coordinates mid-selection, causing the "jumping" bug.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    let rafId = 0;

    const observer = new ResizeObserver(() => {
      // Don't call layout while any mouse button is pressed (text selection)
      if ((window as any).__mouseButtonsHeld > 0) return;

      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        // Double-check after the frame — user may have started selecting
        if ((window as any).__mouseButtonsHeld > 0) return;
        editorRef.current?.layout();
      });
    });
    observer.observe(el);
    return () => { observer.disconnect(); cancelAnimationFrame(rafId); };
  }, []);

  // ── Font size via keyboard ───────────────────────────────────────────
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        fontRef.current = Math.min(28, fontRef.current + 1);
        localStorage.setItem(FONTSIZE_KEY, String(fontRef.current)); localStorage.setItem('ce_fontSize', JSON.stringify(fontRef.current));
        editorRef.current?.updateOptions({ fontSize: fontRef.current });
      }
      if (e.key === '-') {
        e.preventDefault();
        fontRef.current = Math.max(8, fontRef.current - 1);
        localStorage.setItem(FONTSIZE_KEY, String(fontRef.current)); localStorage.setItem('ce_fontSize', JSON.stringify(fontRef.current));
        editorRef.current?.updateOptions({ fontSize: fontRef.current });
      }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // ── Create editor ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !tab) return;

    let cancelled = false;
    let localSubscriptions: monaco.IDisposable[] = [];
    let editorCreated = false;

    (async () => {
      const mon = await import('monaco-editor');
      if (cancelled) return;

      // ── One-time setup ─────────────────────────────────────────────
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
          const ts   = (mon.languages as any).typescript;
          const tsD  = ts.typescriptDefaults;
          const jsD  = ts.javascriptDefaults;

          // ── Permissive compiler options ───────────────────────────────────────
          // Monaco's built-in TS worker can't read the project's tsconfig.json,
          // so it reports false "Cannot find module" / "Cannot find type" errors
          // for path aliases, React Native globals, etc.
          // Strategy: keep SYNTAX checking, disable SEMANTIC type checking.
          // Real type errors come from typescript-language-server (LSP) when installed.
          const compilerOpts = {
            target:                     ts.ScriptTarget.ES2020,
            module:                     ts.ModuleKind.ESNext,
            moduleResolution:           ts.ModuleResolutionKind.Bundler ?? ts.ModuleResolutionKind.NodeJs,
            jsx:                        ts.JsxEmit.ReactJSX,
            lib:                        ['es2022', 'dom', 'dom.iterable', 'esnext'],
            strict:                     false,   // don't enforce strict in built-in worker
            allowJs:                    true,
            checkJs:                    false,
            allowImportingTsExtensions: true,
            allowSyntheticDefaultImports: true,
            esModuleInterop:            true,
            resolveJsonModule:          true,
            skipLibCheck:               true,    // skip all .d.ts errors
            noEmit:                     true,
            // Path aliases — covers @/, ~/, src/ patterns used by most projects
            baseUrl:                    '.',
            paths: {
              '@/*':    ['./*', './src/*'],
              '~/*':    ['./*', './src/*'],
              'src/*':  ['./src/*'],
              '#/*':    ['./*'],
            },
          };

          tsD.setCompilerOptions(compilerOpts);
          jsD.setCompilerOptions(compilerOpts);

          // ── Disable SEMANTIC validation in the built-in worker ─────────────
          // noSemanticValidation=true suppresses module-not-found, type errors, etc.
          // noSyntaxValidation=false keeps real syntax error highlighting.
          // The real LSP (typescript-language-server) handles type checking when installed.
          tsD.setDiagnosticsOptions({
            noSemanticValidation:  true,   // kills false "Cannot find module" etc.
            noSyntaxValidation:    false,  // keep real syntax errors
            noSuggestionDiagnostics: true,
          });
          jsD.setDiagnosticsOptions({
            noSemanticValidation:  true,
            noSyntaxValidation:    false,
            noSuggestionDiagnostics: true,
          });

          // ── Extra type libs for common environments ───────────────────────────
          const globalDts = `
/// <reference lib="es2022" />
declare const Promise: PromiseConstructor;
declare const setTimeout: (callback: (...args: any[]) => void, ms?: number) => number;
declare const clearTimeout: (id: number) => void;
declare const setInterval: (callback: (...args: any[]) => void, ms?: number) => number;
declare const clearInterval: (id: number) => void;
declare const console: Console;
declare const process: { env: Record<string, string | undefined>; platform: string; version: string };
declare const __DEV__: boolean;
declare const global: typeof globalThis;
declare module '*.png' { const v: number; export default v; }
declare module '*.jpg' { const v: number; export default v; }
declare module '*.svg' { const v: any; export default v; }
declare module '*.json' { const v: any; export default v; }
declare module '*.md'  { const v: string; export default v; }
`;
          tsD.addExtraLib(globalDts, 'ts:globals.d.ts');
          jsD.addExtraLib(globalDts, 'ts:globals.d.ts');
          tsD.addExtraLib(electronDts, 'ts:electron.d.ts');
          tsD.addExtraLib(typesDts,    'ts:types/index.d.ts');

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

      // ── Create a fresh model ───────────────────────────────────────
      const lang  = mapLang(tab.language);
      const tabUri = tab.path.startsWith('untitled::')
        ? mon.Uri.parse(`file:///untitled/${tabId}.${tab.language || 'txt'}`)
        : mon.Uri.parse(`file://${tab.path}`);

      const model = mon.editor.createModel(tab.content ?? '', lang, tabUri);
      modelRef.current = model;

      if (cancelled) return;

      // ── Dispose existing editor widget ─────────────────────────────
      if (editorRef.current) {
        try { editorRef.current.setModel(null); } catch {}
        try { editorRef.current.dispose(); } catch {}
        editorRef.current = null;
      }

      const editor = mon.editor.create(containerRef.current!, {
        model,
        theme:    themeRef.current,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        scrollBeyondLastLine: false,
        automaticLayout: false,  // managed manually via debounced ResizeObserver below
        matchBrackets: 'never',
        selectionHighlight: true,
        occurrencesHighlight: 'singleFile',
        cursorSmoothCaretAnimation: 'off',
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
        // Apply all user-saved preferences on create
        ...storedEditorOptions(),
      });

      mon.editor.setTheme(themeRef.current);
      editorRef.current = editor;
      monacoObjRef.current = mon;  // give useWordJump its monaco reference
      editorCreated = true;
      (window as any).__activeEditor = editor;

      // ── SQL: set up formatter hints ─────────────────────────────────────
      if (tab?.language === 'sql') {
        mon.languages.setLanguageConfiguration('sql', {
          comments: { lineComment: '--', blockComment: ['/*', '*/'] },
          brackets: [['(', ')'], ['[', ']']],
          autoClosingPairs: [
            { open: '(', close: ')' },
            { open: '[', close: ']' },
            { open: "'", close: "'", notIn: ['string'] },
            { open: '"', close: '"', notIn: ['string'] },
          ],
          surroundingPairs: [
            { open: '(', close: ')' },
            { open: "'", close: "'" },
            { open: '"', close: '"' },
          ],
          wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
        });
      }
      // Notify bootstrap that an editor just mounted — re-apply stored settings
      // (handles the case where bootstrap fires before any editor exists)
      window.dispatchEvent(new CustomEvent('cordex:editor-mounted', { detail: { editor } }));

      // ── Ghost inline completions ───────────────────────────────────
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

      // ── Subscriptions ──────────────────────────────────────────────
      const s1 = editor.onDidChangeModelContent(() => {
        if (ignoreRef.current) return;
        dispatch({ type: 'UPDATE_TAB_CONTENT', id: tabId, content: editor.getValue() });
      });

      const s2 = editor.onDidChangeCursorPosition(e => {
        dispatch({ type: 'SET_CURSOR', line: e.position.lineNumber, col: e.position.column });
      });

      localSubscriptions = [s1, s2];

      // ── Ctrl+S ─────────────────────────────────────────────────────
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
          (window as any).__clearFileDiagnostics?.(newPath);
          (window as any).Cordex.send?.('agent:analyze-file', newPath);
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
          (window as any).__clearFileDiagnostics?.(t.path);
          (window as any).Cordex.send?.('agent:analyze-file', t.path);
          // Notify background agents that a file was saved
          notifyFileSaved(t.path, state.projectRoot);
          restoreScroll();
        });
      });

      // ── Toggle line comment ────────────────────────────────────────
      editor.addCommand((mon as any).KeyMod.CtrlCmd | (mon as any).KeyCode.Slash, () => {
        editor.getAction('editor.action.commentLine')?.run();
      });
      editor.addCommand((mon as any).KeyMod.CtrlCmd | (mon as any).KeyMod.Shift | (mon as any).KeyCode.Digit7, () => {
        editor.getAction('editor.action.commentLine')?.run();
      });

      // ── Selection helpers ──────────────────────────────────────────
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
      if (editorCreated && modelRef.current && !modelRef.current.isDisposed()) {
        try { modelRef.current.dispose(); } catch {}
        modelRef.current = null;
      }
      (window as any).__activeEditor         = null;
      (window as any).__cordexGetSelection   = null;
      (window as any).__cordexGetSelectionInfo = null;
    };
  }, [tabId, tab?.language]);

  // ── Sync external changes (AI / file reload) ────────────────────────
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

  // ── Jump to line ────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.gotoLine || !editorRef.current) return;
    const editor = editorRef.current;
    const line   = state.gotoLine;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    dispatch({ type: 'GOTO_LINE', line: 0 });
  }, [state.gotoLine]);

  // ── Listen for file changes from agents / AI chat ───────────────────
  useEffect(() => {
    const Cordex = (window as any).Cordex;

    // Reload file content from disk when agent/AI writes it
    const reloadFile = (filePath: string) => {
      const currentTab = state.tabs.find((t: any) => t.id === tabId);
      if (!currentTab || currentTab.path !== filePath) return;
      Cordex?.fs?.readFile?.(filePath)
        .then((result: any) => {
          if (result?.ok && result.content != null) {
            dispatch({ type: 'UPDATE_TAB_CONTENT', id: tabId, content: result.content });
            dispatch({ type: 'MARK_TAB_SAVED',     id: tabId });
          }
        })
        .catch(console.warn);
    };

    // 1. Direct IPC from agent handler (main process writes file)
    //    Cordex.on returns a cleanup fn
    const onIPC = Cordex?.on?.('agent:file-changed', (fp: string) => reloadFile(fp)) ?? null;

    // 2. Custom DOM event (fired from useAgent onFileChanged callback)
    const onDOMEvent = (e: Event) => reloadFile((e as CustomEvent).detail);
    window.addEventListener('cordex:file-changed-on-disk', onDOMEvent);

    // 3. AI chat may also trigger a reload via this event
    window.addEventListener('cordex:reload-file', onDOMEvent);

    return () => {
      onIPC?.();
      window.removeEventListener('cordex:file-changed-on-disk', onDOMEvent);
      window.removeEventListener('cordex:reload-file', onDOMEvent);
    };
  }, [tabId, state.tabs, dispatch]);

// ── Apply editor options (font size, minimap, etc.) from Settings ─────────
  // This fires from App.tsx bootstrap on startup and from AISettingsModal on change.
  useEffect(() => {
    const handler = (e: Event) => {
      const opts = (e as CustomEvent).detail;
      if (editorRef.current && opts) {
        editorRef.current.updateOptions(opts);
      }
    };
    window.addEventListener('cordex:editor-options', handler);
    return () => window.removeEventListener('cordex:editor-options', handler);
  }, []); // empty deps — listener is stable, editorRef always current


  const width  = wrapperSize.width  > 0 ? `${Math.floor(wrapperSize.width)}px`  : '100%';
  const height = wrapperSize.height > 0 ? `${Math.floor(wrapperSize.height)}px` : '100%';

  return (
    <div className="flex-1 relative min-h-0" ref={wrapperRef}>
      <div ref={containerRef} className="absolute inset-0" style={{ width, height }} />
    </div>
  );
};

// ── Language mapping ──────────────────────────────────────────────────
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
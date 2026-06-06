// src/hooks/useWordJump.ts
// EasyMotion-style word jump for Monaco Editor.
//
// Trigger: Ctrl+Shift+J  (or via command palette "Jump to word")
// Usage:
//   1. Press trigger → an input prompt appears in the top-center
//   2. Type 1–3 chars → all visible words starting with those chars are highlighted
//      and labelled with a single key: q w e r t y u i o p a s d f g h j k l z x c v b n m
//      - Input text is always shown in lowercase.
//      - Prefix matching is case‑insensitive UNLESS you hold Shift or CapsLock while typing.
//      - Jump is triggered only by UPPERCASE label keys (i.e. hold Shift or CapsLock).
//        Lowercase letters simply extend the prefix filter.
//   3. Press Shift+label (or CapsLock on) → cursor jumps there instantly
//   4. Esc cancels

import { useEffect, useRef, useCallback } from 'react';

const LABEL_KEYS = 'qwertyuiopasdfghjklzxcvbnm'.split('');

interface JumpTarget {
  word:       string;
  lineNumber: number;
  column:     number;
  label:      string;
  decorId:    string[];
}

// Module-level state shared across editor instances
let _active         = false;
let _targets:       JumpTarget[] = [];
let _query          = '';
let _caseSensitive  = false;   // Shift/CapsLock → case‑sensitive prefix matching
let _listeners      = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function cancel() {
  _active        = false;
  _targets       = [];
  _query         = '';
  _caseSensitive = false;
  notify();
}

export function useWordJump(
  editorRef: React.MutableRefObject<any>,
  monacoRef: React.MutableRefObject<any>,
  decorRef:  React.MutableRefObject<string[]>
) {
  const overlayRef  = useRef<HTMLDivElement | null>(null);
  const inputRef    = useRef<HTMLInputElement | null>(null);
  const activeRef   = useRef(false);
  const decorations = useRef<string[]>([]);

  // ── Build decoration CSS once ───────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById('word-jump-styles')) return;
    const style = document.createElement('style');
    style.id    = 'word-jump-styles';
    style.textContent = `
      .wj-highlight-line {
        background: rgba(255,200,0,0.12) !important;
      }
      .wj-match-glyph::after {
        content: attr(data-label);
        position: absolute;
        left: -2px; top: -1px;
        min-width: 16px; height: 16px;
        background: #f97316;
        color: #fff;
        font-size: 10px;
        font-weight: 800;
        font-family: monospace;
        border-radius: 3px;
        padding: 0 3px;
        line-height: 16px;
        z-index: 100;
        pointer-events: none;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      }
      .wj-input {
        text-transform: lowercase;   /* always display lowercase */
      }
    `;
    document.head.appendChild(style);
  }, []);

  // ── Clear all decorations ────────────────────────────────────────────────
  const clearDecorations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    decorations.current = editor.deltaDecorations(decorations.current, []);
  }, [editorRef]);

  // ── Find & decorate matching words ──────────────────────────────────────
  const applyJumpDecorations = useCallback((query: string) => {
    const editor = editorRef.current;
    const mon    = monacoRef.current;
    if (!editor || !mon || !query) { clearDecorations(); return; }

    const model = editor.getModel();
    if (!model) return;

    const visRange = editor.getVisibleRanges()?.[0];
    if (!visRange) return;

    const startLine = visRange.startLineNumber;
    const endLine   = Math.min(visRange.endLineNumber, startLine + 120);

    // Use case‑sensitive flag from Shift/CapsLock
    const q = _caseSensitive ? query : query.toLowerCase();

    const matches: { line: number; col: number; word: string }[] = [];

    for (let ln = startLine; ln <= endLine; ln++) {
      const lineText = model.getLineContent(ln);
      const wordRe = /\b[a-zA-Z_$][a-zA-Z0-9_$]*/g;
      let m: RegExpExecArray | null;
      while ((m = wordRe.exec(lineText)) !== null) {
        const word = m[0];
        const match = _caseSensitive
          ? word.startsWith(q)
          : word.toLowerCase().startsWith(q);

        if (match) {
          matches.push({ line: ln, col: m.index + 1, word });
        }
      }
    }

    // Assign label keys
    const newTargets: JumpTarget[] = matches.slice(0, LABEL_KEYS.length).map((mt, i) => ({
      word:       mt.word,
      lineNumber: mt.line,
      column:     mt.col,
      label:      LABEL_KEYS[i],
      decorId:    [],
    }));

    // Build Monaco decorations (line highlight + glyph marker for the label)
    const decorObjs = newTargets.flatMap(t => [
      {
        range: new mon.Range(t.lineNumber, t.column, t.lineNumber, t.column + t.word.length),
        options: {
          inlineClassName: 'wj-match-inline',
          className:       'wj-highlight-line',
          glyphMarginClassName: 'wj-match-glyph',
          glyphMarginHoverMessage: { value: `Press **${t.label.toUpperCase()}** to jump` },
          before: {
            content:         t.label.toUpperCase(),
            inlineClassName: 'wj-label-before',
          },
        },
      },
    ]);

    decorations.current = editor.deltaDecorations(decorations.current, decorObjs);

    _targets = newTargets;
    notify();
  }, [editorRef, monacoRef, clearDecorations]);

  // ── Jump to target by label key ──────────────────────────────────────────
  const jumpTo = useCallback((key: string) => {
    const target = _targets.find(t => t.label === key.toLowerCase());
    if (!target) return;
    const editor = editorRef.current;
    if (!editor) return;

    editor.revealLineInCenter(target.lineNumber);
    editor.setPosition({ lineNumber: target.lineNumber, column: target.column });
    editor.focus();
    cleanup();
  }, [editorRef]);

  // ── Build the floating input overlay ───────────────────────────────────
  const showOverlay = useCallback(() => {
    if (overlayRef.current) return;

    const container = editorRef.current?.getDomNode?.()?.closest('.monaco-editor-background')
      ?? editorRef.current?.getDomNode?.()?.parentElement
      ?? document.body;

    const wrap = document.createElement('div');
    wrap.id = 'wj-overlay';
    Object.assign(wrap.style, {
      position: 'fixed', top: '44px', left: '50%', transform: 'translateX(-50%)',
      zIndex: '9999', display: 'flex', alignItems: 'center', gap: '8px',
      background: 'var(--bg-elevated, #fff)',
      border: '1.5px solid var(--accent, #f97316)',
      borderRadius: '8px', padding: '6px 10px',
      boxShadow: '0 8px 28px rgba(0,0,0,0.28)',
      animation: 'wjIn 120ms ease',
    });

    const label = document.createElement('span');
    label.textContent = '⚡ Jump to:';
    Object.assign(label.style, { fontSize: '11px', fontWeight: '700', color: 'var(--accent,#f97316)', whiteSpace: 'nowrap' });

    const input = document.createElement('input');
    input.placeholder = 'type prefix…';
    input.maxLength   = 4;
    input.className   = 'wj-input';    // forces lowercase display
    Object.assign(input.style, {
      fontSize: '13px', fontFamily: 'monospace',
      border: 'none', outline: 'none', width: '120px',
      background: 'transparent', color: 'var(--text-primary, #111)',
    });

    const hint = document.createElement('span');
    Object.assign(hint.style, { fontSize: '10px', color: 'var(--text-muted, #888)', marginLeft: '4px' });

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(hint);

    // Inject animation
    if (!document.getElementById('wj-anim')) {
      const st = document.createElement('style');
      st.id = 'wj-anim';
      st.textContent = '@keyframes wjIn { from{opacity:0;transform:translateX(-50%) translateY(-6px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }';
      document.head.appendChild(st);
    }

    document.body.appendChild(wrap);
    overlayRef.current = wrap;
    inputRef.current   = input;
    input.focus();

    // ── Key handling ──────────────────────────────────────────────────────
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      // Track Shift/CapsLock for case‑sensitive prefix matching
      _caseSensitive = e.shiftKey || e.getModifierState('CapsLock');

      if (e.key === 'Escape') { cleanup(); return; }

      if (e.key === 'Enter') {
        if (_targets.length === 1) { jumpTo(_targets[0].label); return; }
        return;
      }

      // Only uppercase letters (Shift/CapsLock) trigger a jump.
      // Lowercase letters continue to be typed into the prefix.
      if (_targets.length > 0 && e.key.length === 1 && /^[A-Z]$/.test(e.key)) {
        const match = _targets.find(t => t.label === e.key.toLowerCase());
        if (match) {
          e.preventDefault();
          e.stopPropagation();
          jumpTo(e.key.toLowerCase());
        }
      }
    });

    input.addEventListener('input', () => {
      const q = input.value;
      _query = q;
      hint.textContent = '';
      if (q.length >= 1) {
        applyJumpDecorations(q);
        hint.textContent =
          `${_targets.length} match${_targets.length !== 1 ? 'es' : ''}` +
          (_caseSensitive ? ' [A‑a]' : '') +
          ' · Shift+key to jump';
      } else {
        clearDecorations();
      }
    });

    // Click outside cancels
    setTimeout(() => {
      document.addEventListener('mousedown', outsideClick, { once: true });
    }, 100);

    activeRef.current = true;
    _active = true;
    notify();
  }, [editorRef, applyJumpDecorations, clearDecorations, jumpTo]);

  function outsideClick(e: MouseEvent) {
    if (overlayRef.current && !overlayRef.current.contains(e.target as Node)) cleanup();
  }

  function cleanup() {
    clearDecorations();
    overlayRef.current?.remove();
    overlayRef.current = null;
    inputRef.current   = null;
    activeRef.current  = false;
    cancel();
    editorRef.current?.focus();
  }

  // ── Register Monaco keyboard shortcut ────────────────────────────────────
  useEffect(() => {
    const editor = editorRef.current;
    const mon    = monacoRef.current;
    if (!editor || !mon) return;

    const disposable = editor.addAction({
      id:    'word-jump-trigger',
      label: 'Jump to Word (EasyMotion)',
      keybindings: [
        mon.KeyMod.CtrlCmd | mon.KeyMod.Shift | mon.KeyCode.KeyJ,
      ],
      run: () => { showOverlay(); },
    });

    return () => disposable.dispose();
  }, [editorRef.current, monacoRef.current, showOverlay]);

  // ── Also expose via global event so CommandPalette can trigger it ────────
  useEffect(() => {
    const handler = () => showOverlay();
    window.addEventListener('cordex:word-jump', handler);
    return () => window.removeEventListener('cordex:word-jump', handler);
  }, [showOverlay]);

  return { isActive: activeRef.current };
}

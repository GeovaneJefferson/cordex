import { useEffect, useRef, useCallback } from 'react';
import { terminalService } from '../services/terminalService';

interface UseTerminalOptions {
  id: string;
  cwd?: string;
  onData?: (data: string) => void;
}

/** Read xterm colours from current CSS variables so the terminal respects the app theme. */
function getXtermTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return {
    background:          v('--bg-app')        || '#1e1e1e',
    foreground:          v('--text-secondary') || '#abb2bf',
    cursor:              v('--text-muted')     || '#636d83',
    cursorAccent:        v('--bg-app')         || '#1e1e1e',
    selectionBackground: v('--bg-muted')       || '#3e4451',
    black:   '#21252b', red:     '#e06c75', green:   '#98c379', yellow:  '#e5c07b',
    blue:    '#61afef', magenta: '#c678dd', cyan:    '#56b6c2', white:   '#abb2bf',
    brightBlack:   '#5c6370', brightRed:   '#e06c75', brightGreen:  '#98c379',
    brightYellow:  '#e5c07b', brightBlue:  '#61afef', brightMagenta:'#c678dd',
    brightCyan:    '#56b6c2', brightWhite: '#ffffff',
  };
}

export function useTerminal({ id, cwd, onData }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef      = useRef<any>(null);
  const fitAddonRef  = useRef<any>(null);
  const disposedRef  = useRef(false);
  const cleanupFns   = useRef<Array<() => void>>([]);

  const destroy = useCallback(async () => {
    disposedRef.current = true;
    cleanupFns.current.forEach(fn => fn());
    cleanupFns.current = [];
    await terminalService.destroy(id);
  }, [id]);

  const fitTerminal = useCallback(() => {
    if (disposedRef.current) return;
    if (fitAddonRef.current && termRef.current) {
      try {
        fitAddonRef.current.fit();
        terminalService.resize(id, termRef.current.cols, termRef.current.rows);
      } catch {}
    }
  }, [id]);

  useEffect(() => {
    if (!containerRef.current) return;
    let active = true;
    disposedRef.current = false;

    async function init() {
      try {
        const { Terminal } = await import('xterm');
        const { FitAddon } = await import('xterm-addon-fit');
        if (!active || !containerRef.current) return;

        const term = new Terminal({
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: 12,
          lineHeight: 1.3,
          letterSpacing: 0,
          theme: getXtermTheme(),
          cursorBlink: true,
          convertEol: true,
          scrollback: 5000,
          allowTransparency: false,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);

        (window as any).__xterm    = term;
        (window as any).__terminalId = id;
        fitAddonRef.current = fitAddon;
        termRef.current     = term;
        fitAddon.fit();

        // ── Update xterm colours whenever the app theme changes ──────
        const observer = new MutationObserver(() => {
          if (!disposedRef.current) term.options.theme = getXtermTheme();
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

        const res = await terminalService.create(id, cwd ?? '', term.cols, term.rows);
        if (!res?.ok) {
          term.writeln('\x1b[31mFailed to start terminal. Is node-pty installed?\x1b[0m');
          return;
        }

        const offData  = terminalService.onData(id, data => { term.write(data); onData?.(data); });
        const inputDispose = term.onData(data => terminalService.write(id, data));
        const offExit  = terminalService.onExit(id, ({ exitCode }) => {
          term.writeln(`\r\n\x1b[90mProcess exited (${exitCode})\x1b[0m`);
        });

        const obs = new ResizeObserver(() => {
          if (disposedRef.current) return;
          if (containerRef.current && containerRef.current.clientWidth > 0) {
            try { fitAddon.fit(); terminalService.resize(id, term.cols, term.rows); } catch {}
          }
        });
        if (containerRef.current) obs.observe(containerRef.current);

        cleanupFns.current = [
          () => offData?.(),
          () => offExit?.(),
          () => inputDispose.dispose(),
          () => obs.disconnect(),
          () => observer.disconnect(),
          () => { disposedRef.current = true; term.dispose(); },
        ];
      } catch {
        if (containerRef.current) {
          containerRef.current.innerHTML = `
            <div style="padding:12px;color:#999;font-size:12px;font-family:monospace">
              Install xterm to enable terminal:<br/>
              <code>npm install xterm xterm-addon-fit</code>
            </div>`;
        }
      }
    }

    init();
    return () => { active = false; destroy(); };
  }, [id, cwd]);

  return { containerRef, termRef, fitTerminal, destroy };
}
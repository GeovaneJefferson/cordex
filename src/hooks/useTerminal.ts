import { useEffect, useRef, useCallback } from 'react';
import { terminalService } from '../services/terminalService';

interface UseTerminalOptions {
  id: string;
  cwd?: string;
  onData?: (data: string) => void;
}

export function useTerminal({ id, cwd, onData }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<any>(null);
  const fitAddonRef = useRef<any>(null);
  const disposedRef = useRef(false);                    // ← tracks dispose state
  const cleanupFns = useRef<Array<() => void>>([]);

  const destroy = useCallback(async () => {
    disposedRef.current = true;                         // ← mark as dead
    cleanupFns.current.forEach(fn => fn());
    cleanupFns.current = [];
    await terminalService.destroy(id);
  }, [id]);

  const fitTerminal = useCallback(() => {
    if (disposedRef.current) return;                    // ← safety check
    if (fitAddonRef.current && termRef.current) {
      try {
        fitAddonRef.current.fit();
        terminalService.resize(id, termRef.current.cols, termRef.current.rows);
      } catch (err) {
        // ignore resize errors after dispose
      }
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
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: 13,
          lineHeight: 1.4,
          theme: {
            background: '#ffffff',
            foreground: '#1e1e1e',
            cursor: '#555',
            selectionBackground: '#add6ff',
          },
          cursorBlink: true,
          convertEol: true,
          scrollback: 5000,
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(containerRef.current);

        (window as any).__xterm = term;
        (window as any).__terminalId = id;

        fitAddonRef.current = fitAddon;
        termRef.current = term;

        fitAddon.fit();

        const res = await terminalService.create(id, cwd ?? '', term.cols, term.rows);
        if (!res?.ok) {
          term.writeln('\x1b[31mFailed to start terminal. Is node-pty installed?\x1b[0m');
          return;
        }

        const offData = terminalService.onData(id, data => {
          term.write(data);
          onData?.(data);
        });

        const inputDispose = term.onData(data => terminalService.write(id, data));

        const offExit = terminalService.onExit(id, ({ exitCode }) => {
          term.writeln(`\r\n\x1b[90mProcess exited (${exitCode})\x1b[0m`);
        });

        // ── Resize observer with dispose guard ──────────────────────
        const obs = new ResizeObserver(() => {
          if (disposedRef.current) return;               // ← prevent crash
          if (containerRef.current && containerRef.current.clientWidth > 0) {
            try {
              fitAddon.fit();
              terminalService.resize(id, term.cols, term.rows);
            } catch {}
          }
        });
        if (containerRef.current) obs.observe(containerRef.current);

        cleanupFns.current = [
          () => offData?.(),
          () => offExit?.(),
          () => inputDispose.dispose(),
          () => obs.disconnect(),
          () => {
            disposedRef.current = true;
            term.dispose();
          },
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
    return () => {
      active = false;
      destroy();
    };
  }, [id, cwd]);

  return { containerRef, termRef, fitTerminal, destroy };
}
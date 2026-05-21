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
  const fitAddonRef = useRef<any>(null); // Save fit addon ref for manual external canvas resizing
  const cleanupFns = useRef<Array<() => void>>([]);

  const destroy = useCallback(async () => {
    cleanupFns.current.forEach(fn => fn());
    cleanupFns.current = [];
    await terminalService.destroy(id);
  }, [id]);

  // Expose sizing helper function up into React components
  const fitTerminal = useCallback(() => {
    if (fitAddonRef.current && termRef.current) {
      try {
        fitAddonRef.current.fit();
        terminalService.resize(id, termRef.current.cols, termRef.current.rows);
      } catch (err) {
        console.warn("Terminal fit deferred:", err);
      }
    }
  }, [id]);

  useEffect(() => {
    if (!containerRef.current) return;
    let active = true;

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
        
        fitAddonRef.current = fitAddon;
        termRef.current = term;

        // Run early check configuration sizing options mapping
        fitAddon.fit();

        const res = await terminalService.create(id, cwd ?? '', term.cols, term.rows);
        if (!res?.ok) {
          term.writeln('\x1b[31mFailed to start terminal. Is node-pty installed?\x1b[0m');
          return;
        }

        // PTY → xterm
        const offData = terminalService.onData(id, data => {
          term.write(data);
          onData?.(data);
        });

        // xterm → PTY
        const inputDispose = term.onData(data => terminalService.write(id, data));

        // PTY exit
        const offExit = terminalService.onExit(id, ({ exitCode }) => {
          term.writeln(`\r\n\x1b[90mProcess exited (${exitCode})\x1b[0m`);
        });

        // Auto-resize observing layer
        const obs = new ResizeObserver(() => {
          // Only trigger fits if container has explicit physical volume dimensions
          if (containerRef.current && containerRef.current.clientWidth > 0) {
            fitAddon.fit();
            terminalService.resize(id, term.cols, term.rows);
          }
        });
        if (containerRef.current) obs.observe(containerRef.current);

        cleanupFns.current = [
          () => offData?.(),
          () => offExit?.(),
          () => inputDispose.dispose(),
          () => obs.disconnect(),
          () => term.dispose(),
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
  }, [id, cwd]);  // eslint-disable-line

  return { containerRef, termRef, fitTerminal, destroy };
}
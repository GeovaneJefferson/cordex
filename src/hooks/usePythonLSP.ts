import { useEffect, useRef } from 'react';
import { useAppState } from '../store/AppContext';
import { getExtensions } from '../extensions/registry';
import type { Extension } from '../extensions/types';

const Cordex = (window as any).Cordex;

/**
 * usePythonLSP — starts the pylsp bridge (via lsp:start-python IPC) then
 * opens a WebSocket to it. Retries the WS connection with backoff while
 * the bridge is still warming up. Wires Monaco diagnostics markers.
 */
export function usePythonLSP(language: string, projectRoot: string | null) {
  const { state } = useAppState();
  const startedRef  = useRef(false);
  const wsRef       = useRef<WebSocket | null>(null);
  const retryTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef  = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      retryTimer.current && clearTimeout(retryTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!projectRoot || language !== 'python') return;

    // Only start if the Python bundle is installed & enabled
    let extensions: Extension[] = [];
    try { extensions = getExtensions(); } catch { return; }
    const isEnabled = extensions.find(e => e.id === 'bundle-python')?.enabled === true;
    if (!isEnabled) return;

    if (startedRef.current) return;
    startedRef.current = true;

    // Tell the main process to spawn pylsp and open the WS bridge
    Cordex?.lsp?.startPython?.(projectRoot);

    // Connect to the bridge with exponential backoff (bridge takes ~300–1500ms to start)
    let attempt = 0;
    const delays = [800, 1500, 2500, 4000, 6000];

    function tryConnect() {
      if (!mountedRef.current) return;
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      const ws = new WebSocket('ws://localhost:6007/');
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        console.log('[usePythonLSP] Connected to pylsp');
        attempt = 0;
        initializeLSP(ws);
      };

      ws.onerror = () => {
        if (!mountedRef.current) return;
        const delay = delays[Math.min(attempt, delays.length - 1)];
        console.warn(`[usePythonLSP] ws://localhost:6007 not ready (attempt ${attempt + 1}), retrying in ${delay}ms`);
        attempt++;
        if (attempt < 8) {
          retryTimer.current = setTimeout(tryConnect, delay);
        } else {
          console.warn('[usePythonLSP] Giving up. Install pylsp: pip install python-lsp-server --break-system-packages');
          startedRef.current = false;
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        wsRef.current = null;
      };
    }

    // First attempt after a brief delay to let the bridge start
    retryTimer.current = setTimeout(tryConnect, 800);

    return () => {
      retryTimer.current && clearTimeout(retryTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      startedRef.current = false;
      Cordex?.lsp?.stopPython?.();
    };
  }, [language, projectRoot]);

  // Wire diagnostics from pylsp → Monaco markers
  function initializeLSP(ws: WebSocket) {
    let msgId = 1;
    function send(method: string, params: any) {
      const body = JSON.stringify({ jsonrpc: '2.0', id: msgId++, method, params });
      const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`;
      ws.send(header + body);
    }

    send('initialize', {
      processId: null,
      rootUri:   state.projectRoot ? `file://${state.projectRoot}` : null,
      capabilities: {
        textDocument: {
          publishDiagnostics: { relatedInformation: true },
          synchronization:    { didSave: true, didChange: 2 },
        },
      },
    });

    let buffer = '';
    ws.onmessage = (e) => {
      buffer += e.data;
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        const header = buffer.slice(0, headerEnd);
        const lenMatch = header.match(/Content-Length:\s*(\d+)/i);
        if (!lenMatch) { buffer = buffer.slice(headerEnd + 4); continue; }
        const len = parseInt(lenMatch[1], 10);
        const bodyStart = headerEnd + 4;
        if (buffer.length < bodyStart + len) break;
        const body = buffer.slice(bodyStart, bodyStart + len);
        buffer = buffer.slice(bodyStart + len);
        try {
          const msg = JSON.parse(body);
          if (msg.method === 'textDocument/publishDiagnostics') {
            handleDiagnostics(msg.params);
          } else if (msg.id === 1) {
            // initialized response
            send('initialized', {});
            // Open all already-visible Python models
            (window as any).__cordexNotifyLspOpen?.();
          }
        } catch {}
      }
    };
  }

  function handleDiagnostics(params: any) {
    const mon = (window as any).monaco;
    if (!mon) return;
    const uri = params.uri?.replace('file://', '');
    const model = mon.editor.getModels().find(
      (m: any) => m.uri.path === uri || m.uri.toString() === params.uri
    );
    if (!model) return;
    mon.editor.setModelMarkers(model, 'pylsp', params.diagnostics.map((d: any) => ({
      startLineNumber: (d.range?.start?.line ?? 0) + 1,
      startColumn:     (d.range?.start?.character ?? 0) + 1,
      endLineNumber:   (d.range?.end?.line ?? 0) + 1,
      endColumn:       (d.range?.end?.character ?? 0) + 1,
      message:         d.message ?? '',
      severity:        d.severity === 1 ? 8 : d.severity === 2 ? 4 : 2,
      source:          d.source ?? 'pylsp',
    })));
    // Dispatch markers-changed so status bar updates
    const allMarkers = mon.editor.getModelMarkers({});
    window.dispatchEvent(new CustomEvent('cordex:markers-changed', { detail: allMarkers }));
  }
}

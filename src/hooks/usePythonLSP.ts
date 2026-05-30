import { useEffect, useRef } from 'react';
import { getExtensions } from '../extensions/registry';

interface Extension { id: string; enabled: boolean; }

let _msgId = 1;

export function usePythonLSP(language: string, projectRoot: string | null) {
  const startedRef = useRef(false);
  const wsRef      = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!projectRoot || language !== 'python') return;

    let extensions: Extension[] = [];
    try { extensions = getExtensions(); }
    catch (err) { console.warn('[usePythonLSP] extensions error:', err); return; }

    const isEnabled = extensions.find(e => e.id === 'pyright')?.enabled === true;

    if (!isEnabled) {
      if (startedRef.current) shutdown();
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        await (window as any).Cordex?.lsp?.startPython?.(projectRoot);
        await new Promise(r => setTimeout(r, 500));      // wait for WS server to bind

        const ws = new WebSocket('ws://localhost:6007');
        wsRef.current = ws;

        // ── JSON-RPC helpers ──────────────────────────────────────────────
        const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();

        function send(obj: object) {
          const body   = JSON.stringify(obj);
          const length = new TextEncoder().encode(body).length;
          ws.send(`Content-Length: ${length}\r\n\r\n${body}`);
        }

        function request(method: string, params: object): Promise<any> {
          const id = _msgId++;
          return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            send({ jsonrpc: '2.0', id, method, params });
          });
        }

        function notify(method: string, params: object) {
          send({ jsonrpc: '2.0', method, params });
        }

        // ── Incoming message framing ──────────────────────────────────────
        let buf = '';
        ws.onmessage = async ({ data }) => {
          buf += data;
          while (true) {
            const sep = buf.indexOf('\r\n\r\n');
            if (sep === -1) break;
            const lenMatch = buf.slice(0, sep).match(/Content-Length:\s*(\d+)/i);
            if (!lenMatch) { buf = buf.slice(sep + 4); break; }
            const len   = parseInt(lenMatch[1], 10);
            const start = sep + 4;
            if (buf.length < start + len) break;
            const body  = buf.slice(start, start + len);
            buf         = buf.slice(start + len);

            let msg: any;
            try { msg = JSON.parse(body); } catch { continue; }

            // Resolve pending requests
            if ('id' in msg && !msg.method) {
              const cb = pending.get(msg.id);
              if (cb) { pending.delete(msg.id); msg.error ? cb.reject(msg.error) : cb.resolve(msg.result); }
              continue;
            }

            // Diagnostics → Monaco markers
            if (msg.method === 'textDocument/publishDiagnostics') {
              const { uri, diagnostics } = msg.params;
              const mon = await import('monaco-editor');
              const model = mon.editor.getModel(mon.Uri.parse(uri));
              if (!model) continue;
              mon.editor.setModelMarkers(model, 'pyright', diagnostics.map((d: any) => ({
                severity:        d.severity === 1 ? mon.MarkerSeverity.Error
                               : d.severity === 2 ? mon.MarkerSeverity.Warning
                               : d.severity === 3 ? mon.MarkerSeverity.Info
                               :                    mon.MarkerSeverity.Hint,
                startLineNumber: d.range.start.line + 1,
                startColumn:     d.range.start.character + 1,
                endLineNumber:   d.range.end.line + 1,
                endColumn:       d.range.end.character + 1,
                message:         d.message,
                source:          d.source ?? 'pyright',
              })));
            }
          }
        };

        ws.onerror = (e) => { console.error('[usePythonLSP] WS error', e); startedRef.current = false; };

        ws.onopen = async () => {
          await request('initialize', {
            processId: null,
            rootUri:   `file://${projectRoot}`,
            capabilities: {
              textDocument: {
                publishDiagnostics: { relatedInformation: true },
                completion:         { completionItem: { snippetSupport: true } },
                hover:              {},
              },
            },
            workspaceFolders: [{ uri: `file://${projectRoot}`, name: projectRoot.split('/').pop() ?? 'project' }],
          });
          notify('initialized', {});
          console.log('[usePythonLSP] ready');

          // Notify pyright about already-open Python models
          const mon = await import('monaco-editor');
          for (const model of mon.editor.getModels()) {
            if (model.getLanguageId() !== 'python') continue;
            notify('textDocument/didOpen', {
              textDocument: { uri: model.uri.toString(), languageId: 'python', version: 1, text: model.getValue() },
            });
            // Keep diagnostics fresh on edit
            model.onDidChangeContent(() => {
              notify('textDocument/didChange', {
                textDocument:   { uri: model.uri.toString(), version: model.getVersionId() },
                contentChanges: [{ text: model.getValue() }],
              });
            });
          }
        };

      } catch (err) {
        console.error('[usePythonLSP] startup error:', err);
        startedRef.current = false;
      }
    })();

    function shutdown() {
      wsRef.current?.close();
      wsRef.current = null;
      (window as any).Cordex?.lsp?.stopPython?.();
      startedRef.current = false;
    }

    return shutdown;
  }, [language, projectRoot]);
}
import React, { useState, useEffect } from 'react';
import { useAppState } from '../store/AppContext';
import { detectLanguage } from '../utils/fileIcons';

interface BugIssue {
  file: string;
  line: number;
  snippet: string;
  severity: 'warning' | 'error';
}

const Cordex = (window as any).Cordex;

export const BugFloatingPanel: React.FC = () => {
  const { state, dispatch } = useAppState();
  const [issues, setIssues]       = useState<BugIssue[]>([]);
  const [selected, setSelected]   = useState<BugIssue | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Listen for new issues from the background agent
  useEffect(() => {
    const cleanup = Cordex.agents?.onIssue?.((issue: BugIssue) => {
      const key = `${issue.file}:${issue.line}`;
      setIssues(prev => {
        if (prev.some(i => `${i.file}:${i.line}` === key)) return prev;
        return [...prev, issue];
      });
    });
    return () => cleanup?.();
  }, []);

  // Clear issues for a file on save
  useEffect(() => {
    (window as any).__clearFloatingIssues = (absPath: string) => {
      if (!state.projectRoot) return;
      const relPath = absPath.replace(state.projectRoot + '/', '').replace(/\\/g, '/');
      setIssues(prev => prev.filter(i => i.file !== relPath));
      setDismissed(prev => {
        const next = new Set(prev);
        for (const key of prev) if (key.startsWith(relPath + ':')) next.delete(key);
        return next;
      });
    };
    return () => { delete (window as any).__clearFloatingIssues; };
  }, [state.projectRoot]);

  const dismiss = (issue: BugIssue) => {
    setDismissed(prev => new Set(prev).add(`${issue.file}:${issue.line}`));
    if (selected?.file === issue.file && selected?.line === issue.line) setSelected(null);
  };

  const handleOpenFile = async (issue: BugIssue) => {
    if (!state.projectRoot) return;
    const absPath = `${state.projectRoot}/${issue.file}`.replace(/\/+/g, '/');
    try {
      const result = await Cordex.fs.readFile(absPath);
      if (!result?.ok) throw new Error('Could not read file');
      const language = detectLanguage(issue.file);
      dispatch({ type: 'OPEN_FILE', payload: { path: absPath, content: result.content, language } });
      dispatch({ type: 'GOTO_LINE', line: issue.line });
      dispatch({ type: 'SET_CURSOR', line: issue.line, col: 1 });
    } catch (err) {
      console.error('Failed to open bug file:', err);
    }
    setSelected(null);
  };

  const handleFindSolution = (issue: BugIssue) => {
    const message = `@${issue.file} line ${issue.line}: ${issue.snippet}\nFix this. Give me the corrected code for this section.`;
    if (!state.chatVisible) dispatch({ type: 'TOGGLE_CHAT_PANEL' });
    (window as any).__cordexSendToChat?.(message);
    setSelected(null);
  };

  const visible = issues.filter(i => !dismissed.has(`${i.file}:${i.line}`));
  if (visible.length === 0 && !selected) return null;

  return (
    // Positioned absolute inside the editor area div (which has position:relative)
    <div
      style={{
        position: 'absolute',
        top: 8,
        right: 8,
        bottom: 8,
        zIndex: 50,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 4,
        maxWidth: 320,
      }}
    >
      {/* Issue badges */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end', pointerEvents: 'auto' }}>
        {visible.map((issue, idx) => {
          const isErr = issue.severity === 'error';
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <button
                onClick={() => setSelected(selected?.file === issue.file && selected?.line === issue.line ? null : issue)}
                style={{
                  background: isErr ? 'var(--agent-error-bg, #ef4444)' : 'var(--agent-warn-bg, #f59e0b)',
                  color: '#fff',
                  borderRadius: 6,
                  padding: '2px 7px',
                  fontSize: 10,
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 3,
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  whiteSpace: 'nowrap',
                  opacity: 0.92,
                  transition: 'opacity 0.15s',
                }}
                title={`${issue.file}:${issue.line} — ${issue.snippet}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
                  {isErr ? 'bug_report' : 'warning'}
                </span>
                {issue.file.split('/').pop()}:{issue.line}
              </button>
              <button
                onClick={() => dismiss(issue)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: 2, lineHeight: 1,
                }}
                title="Dismiss"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 11 }}>close</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Detail card — inline, no portal */}
      {selected && (
        <div
          style={{
            pointerEvents: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 10,
            padding: '10px 12px',
            width: 280,
            boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
            color: 'var(--text-primary)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
              {selected.file.split('/').pop()}:{selected.line}
            </span>
            <button
              onClick={() => setSelected(null)}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
            </button>
          </div>

          {/* Snippet */}
          <pre style={{
            background: 'var(--bg-muted)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 5,
            padding: '6px 8px',
            fontSize: 10,
            fontFamily: 'monospace',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--text-secondary)',
            margin: '0 0 8px',
            maxHeight: 80,
            overflowY: 'auto',
          }}>
            {selected.snippet}
          </pre>

          {/* Full path */}
          <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: '0 0 8px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {selected.file}
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleFindSolution(selected)}
              style={{
                flex: 1,
                background: 'var(--accent)',
                border: 'none', color: '#fff',
                padding: '5px 0', borderRadius: 5,
                fontSize: 11, cursor: 'pointer', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>forum</span>
              Ask AI
            </button>
            <button
              onClick={() => handleOpenFile(selected)}
              style={{
                flex: 1,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border-default)', color: 'var(--text-primary)',
                padding: '5px 0', borderRadius: 5,
                fontSize: 11, cursor: 'pointer', fontWeight: 600,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>open_in_new</span>
              Go to line
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
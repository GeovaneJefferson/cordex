import React, { useEffect, useState } from 'react';

interface ProgressState {
  phase: string;
  status: string;
  pct: number;
  model?: string;
}

export const SetupProgress: React.FC = () => {
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const Cordex = (window as any).Cordex;
    const unsub = Cordex?.onSetupProgress?.((data: ProgressState) => {
      setProgress(data);
      if (data.phase === 'done' || data.phase === 'ready' || data.phase === 'model-exists') {
        setTimeout(() => setDismissed(true), 3000);
      }
    });
    return () => unsub?.();
  }, []);

  if (!progress || dismissed) return null;

  const isError = progress.phase === 'error';
  const isDone  = progress.pct === 100 || progress.phase === 'done' || progress.phase === 'ready';

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      width: 320, background: 'var(--bg-elevated)',
      border: `1px solid ${isError ? '#ef4444' : 'var(--border-default)'}`,
      borderRadius: 12, padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
      animation: 'setupSlideIn 300ms cubic-bezier(0.4,0,0.2,1)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: isError ? '#ef444422' : isDone ? '#22c55e22' : 'var(--accent)22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize: 16,
            color: isError ? '#ef4444' : isDone ? '#22c55e' : 'var(--accent)',
            animation: !isDone && !isError ? 'setupSpin 1.4s linear infinite' : 'none',
          }}>
            {isError ? 'error' : isDone ? 'check_circle' : 'autorenew'}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            {isError ? 'Setup Error' : isDone ? 'Cordex Ready' : 'Setting up Cordex…'}
          </p>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
            {progress.status}
          </p>
        </div>
        {(isError || isDone) && (
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
          </button>
        )}
      </div>

      {/* Progress bar */}
      {!isError && (
        <div style={{ height: 4, borderRadius: 4, background: 'var(--bg-muted)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 4,
            background: isDone ? '#22c55e' : 'var(--accent)',
            width: `${progress.pct}%`,
            transition: 'width 400ms ease',
          }} />
        </div>
      )}

      {/* Phase label */}
      {!isDone && !isError && (
        <p style={{ margin: '6px 0 0', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {progress.phase.replace(/-/g, ' ')} {progress.pct > 0 ? `· ${progress.pct}%` : ''}
        </p>
      )}

      <style>{`
        @keyframes setupSlideIn { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
        @keyframes setupSpin    { to { transform:rotate(360deg) } }
      `}</style>
    </div>
  );
};

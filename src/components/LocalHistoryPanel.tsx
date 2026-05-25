import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../store/AppContext';
import { Tab } from '../types';

const Cordex = (window as any).Cordex;

interface Snapshot {
  id: number;
  timestamp: number;
  size: number;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  if (isToday) return `Today ${time}`;
  const diff = now.getTime() - ms;
  if (diff < 86400000 * 2) return `Yesterday ${time}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${time}`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Diff viewer (simple line-diff) ─────────────────────────────────────
function SimpleDiff({ original, restored }: { original: string; restored: string }) {
  const origLines = original.split('\n');
  const restLines = restored.split('\n');
  const maxLen = Math.max(origLines.length, restLines.length);

  const rows: { type: 'same' | 'removed' | 'added'; text: string; line: number }[] = [];
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i];
    const r = restLines[i];
    if (o === r) {
      rows.push({ type: 'same', text: r ?? '', line: i + 1 });
    } else {
      if (o !== undefined) rows.push({ type: 'removed', text: o, line: i + 1 });
      if (r !== undefined) rows.push({ type: 'added', text: r, line: i + 1 });
    }
  }

  const changed = rows.filter(r => r.type !== 'same');
  const previewRows = changed.length === 0 ? rows.slice(0, 8) : changed.slice(0, 30);

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 11, lineHeight: 1.5,
      background: '#1e1e1e', color: '#d4d4d4',
      borderRadius: 6, overflow: 'auto',
      maxHeight: 220, padding: '8px 0',
    }
    }>
      {
        changed.length === 0 && (
          <div style={{ padding: '4px 12px', color: '#6b7280', fontStyle: 'italic' }}>
            Identical to current content
          </div>
        )}
      {
        previewRows.map((row, i) => (
          <div key={i} style={{
            padding: '0 12px',
            background: row.type === 'removed' ? 'rgba(239,68,68,0.15)'
              : row.type === 'added' ? 'rgba(34,197,94,0.15)'
                : 'transparent',
            color: row.type === 'removed' ? '#fca5a5'
              : row.type === 'added' ? '#86efac'
                : '#d4d4d4',
            whiteSpace: 'pre',
            userSelect: 'text',
          }}>
            <span style={{ opacity: 0.4, marginRight: 8, minWidth: 24, display: 'inline-block' }}>
              {row.type === 'removed' ? '−' : row.type === 'added' ? '+' : ' '}
            </span>
            {row.text}
          </div>
        ))}
      {
        changed.length > 30 && (
          <div style={{ padding: '4px 12px', color: '#6b7280', fontStyle: 'italic' }}>
            … {changed.length - 30} more changed lines
          </div>
        )
      }
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export const LocalHistoryPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { state, dispatch } = useAppState();

  const activeTab = state.tabs.find((t: Tab) => t.id === state.activeTabId);

  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ id: number; content: string } | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load snapshot list whenever active file changes ──────────────────
  const loadSnapshots = useCallback(async () => {
    if (!activeTab?.path || activeTab.path.startsWith('untitled::')) {
      setSnapshots([]); setPreview(null); return;
    }
    setLoading(true); setError(null);
    try {
      const res = await Cordex?.history?.list?.(activeTab.path);
      setSnapshots(res?.snapshots ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab?.path]);

  useEffect(() => { loadSnapshots(); }, [loadSnapshots]);

  useEffect(() => {
    const handler = () => loadSnapshots();
    window.addEventListener('cordex:history-updated', handler);
    return () => window.removeEventListener('cordex:history-updated', handler);
  }, [loadSnapshots]);

  // ── Preview a snapshot ────────────────────────────────────────────────
  const handlePreview = useCallback(async (snap: Snapshot) => {
    if (preview?.id === snap.id) { setPreview(null); return; }
    try {
      const res = await Cordex?.history?.restore?.(snap.id, activeTab?.path);
      if (res?.ok) setPreview({ id: snap.id, content: res.content });
    } catch { }
  }, [preview]);

  // ── Restore a snapshot into the editor ───────────────────────────────
  const handleRestore = useCallback(async (snap: Snapshot) => {
    if (!activeTab) return;
    setRestoring(snap.id);
    try {
      const res = await Cordex?.history?.restore?.(snap.id, activeTab?.path);
      if (res?.ok) {
        dispatch({ type: 'UPDATE_TAB_CONTENT', id: activeTab.id, content: res.content });
        setPreview(null);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRestoring(null);
    }
  }, [activeTab, dispatch]);

  // ── Delete a single snapshot ──────────────────────────────────────────
  const handleDelete = useCallback(async (snap: Snapshot) => {
    if (!activeTab?.path) return;   // safety guard
    setDeleting(snap.id);
    try {
      await Cordex?.history?.delete?.({
        snapshotId: snap.id,
        filePath: activeTab.path,   // 👈 add this line
      });
      setSnapshots(prev => prev.filter(s => s.id !== snap.id));
      if (preview?.id === snap.id) setPreview(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setDeleting(null);
    }
  }, [activeTab?.path, preview]);

  // ── Clear all snapshots for file ──────────────────────────────────────
  const handleClearAll = useCallback(async () => {
    if (!activeTab?.path) return;
    if (!window.confirm(`Clear all history for ${activeTab.name}?`)) return;
    try {
      await Cordex?.history?.delete?.({ filePath: activeTab.path, all: true });
      setSnapshots([]); setPreview(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [activeTab]);

  const noFile = !activeTab || activeTab.path.startsWith('untitled::');

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'white', borderLeft: '1px solid #e2e8f0',
    }
    }>
      {/* ── Header ─────────────────────────────────────────────────── */}
      < div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 12px', borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#f97316' }}>
          history
        </span>
        < span style={{ fontWeight: 600, fontSize: 13, color: '#111827', flex: 1 }}>
          Local History
        </span>
        {
          snapshots.length > 0 && (
            <button
              onClick={handleClearAll}
              title="Clear all history for this file"
              style={{
                fontSize: 11, color: '#9ca3af', background: 'none', border: 'none',
                cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
                transition: 'color 0.15s',
              }
              }
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
              onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
            >
              Clear all
            </button>
          )}
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: '#9ca3af', lineHeight: 1, padding: 2, borderRadius: 4,
          display: 'flex', alignItems: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}> close </span>
        </button>
      </div>

      {/* ── File name ──────────────────────────────────────────────── */}
      {
        activeTab && !noFile && (
          <div style={
            {
              padding: '6px 12px', background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0', flexShrink: 0,
            }
          }>
            <span style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>
              {activeTab.name}
            </span>
          </div>
        )
      }

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {error && (
          <div style={{ padding: '8px 12px', color: '#ef4444', fontSize: 12 }}>
            ⚠ {error}
          </div>
        )}

        {
          noFile && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 8 }
              }>
                insert_drive_file
              </span>
              Open a file to see its history
            </div>
          )}

        {
          !noFile && loading && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, animation: 'spin 1s linear infinite' }
              }>
                autorenew
              </span>
            </div>
          )}

        {
          !noFile && !loading && snapshots.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.5 }
              }>
                history
              </span>
              No snapshots yet.
              < br />
              <span style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                Snapshots are created each time you save(Ctrl + S).
              </span>
            </div>
          )}

        {
          snapshots.map(snap => {
            const isPreviewing = preview?.id === snap.id;
            const isRestoring = restoring === snap.id;
            const isDeleting = deleting === snap.id;

            return (
              <div key={snap.id} >
                {/* ── Snapshot row ─────────────────────────────────── */}
                < div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 12px',
                  background: isPreviewing ? '#fff7ed' : 'transparent',
                  borderLeft: isPreviewing ? '2px solid #f97316' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }
                }
                  onMouseEnter={e => { if (!isPreviewing) e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={e => { if (!isPreviewing) e.currentTarget.style.background = 'transparent'; }}
                  onClick={() => handlePreview(snap)}
                >
                  <span className="material-symbols-outlined"
                    style={{ fontSize: 14, color: isPreviewing ? '#f97316' : '#94a3b8', flexShrink: 0 }}>
                    {isPreviewing ? 'unfold_less' : 'history'}
                  </span>
                  < div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#111827', fontWeight: 500 }}>
                      {fmtTime(snap.timestamp)}
                    </div>
                    < div style={{ fontSize: 10, color: '#94a3b8' }}> {fmtSize(snap.size)} </div>
                  </div>

                  {/* Action buttons — shown on hover via parent group */}
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()} >
                    <button
                      onClick={() => handleRestore(snap)}
                      disabled={isRestoring}
                      title="Restore this version"
                      style={{
                        fontSize: 10, padding: '2px 7px', borderRadius: 4,
                        border: '1px solid #e2e8f0', background: 'white',
                        color: '#374151', cursor: 'pointer',
                        opacity: isRestoring ? 0.5 : 1,
                      }}
                    >
                      {isRestoring ? '…' : 'Restore'}
                    </button>
                    < button
                      onClick={() => handleDelete(snap)}
                      disabled={isDeleting}
                      title="Delete this snapshot"
                      style={{
                        fontSize: 10, padding: '2px 5px', borderRadius: 4,
                        border: '1px solid transparent', background: 'none',
                        color: '#9ca3af', cursor: 'pointer',
                        opacity: isDeleting ? 0.5 : 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#9ca3af')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 13 }}> delete </span>
                    </button>
                  </div>
                </div>

                {/* ── Diff preview ─────────────────────────────────── */}
                {
                  isPreviewing && preview && (
                    <div style={{ padding: '0 12px 10px' }}>
                      <SimpleDiff
                        original={activeTab?.content ?? ''}
                        restored={preview.content}
                      />
                      <button
                        onClick={() => handleRestore(snap)}
                        disabled={isRestoring}
                        style={{
                          marginTop: 8, width: '100%', padding: '6px',
                          background: '#f97316', color: 'white',
                          border: 'none', borderRadius: 6,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          opacity: isRestoring ? 0.6 : 1,
                        }
                        }
                      >
                        {isRestoring ? 'Restoring…' : '↩ Restore this version'}
                      </button>
                    </div>
                  )}
              </div>
            );
          })}
      </div>

      {/* ── Footer stats ────────────────────────────────────────────── */}
      {
        snapshots.length > 0 && (
          <div style={
            {
              padding: '6px 12px', borderTop: '1px solid #e2e8f0',
              fontSize: 10, color: '#9ca3af', flexShrink: 0,
            }
          }>
            {snapshots.length} snapshot{snapshots.length !== 1 ? 's' : ''} stored
          </div>
        )
      }
    </div>
  );
};

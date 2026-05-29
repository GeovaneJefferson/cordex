import React, { useState, useEffect, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
const Cordex = (window as any).Cordex;

interface GitFile {
  path: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  statusLabel: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const Empty: React.FC<{ icon: string; text: string; sub?: string; spinning?: boolean; children?: React.ReactNode }> = ({
  icon, text, sub, spinning, children,
}) => (
  <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs p-6 select-none">
    <span className={`material-symbols-outlined text-3xl mb-2 text-gray-300 ${spinning ? 'animate-spin' : ''}`}>{icon}</span>
    <p className="font-medium text-gray-500">{text}</p>
    {sub && <p className="mt-1 text-gray-400 text-center">{sub}</p>}
    {children}
  </div>
);

function statusColor(label: string) {
  if (label === 'A' || label === 'U') return '#22c55e';
  if (label === 'D') return '#ef4444';
  return '#f59e0b';
}

function statusTitle(f: GitFile) {
  if (f.untracked) return 'Untracked';
  if (f.staged && !f.unstaged) return 'Staged';
  if (f.staged && f.unstaged) return 'Staged & Modified';
  return 'Modified';
}

const IconBtn: React.FC<{ icon: string; title: string; onClick: () => void; danger?: boolean }> = ({ icon, title, onClick, danger }) => (
  <button
    title={title}
    onClick={e => { e.stopPropagation(); onClick(); }}
    style={{ padding: '2px 4px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer',
      color: danger ? '#ef4444' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
    className={`opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-100`}
  >
    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
  </button>
);

interface SectionProps {
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onStageAll?: () => void;
  onUnstageAll?: () => void;
  children: React.ReactNode;
}
const Section: React.FC<SectionProps> = ({ title, count, open, onToggle, onStageAll, onUnstageAll, children }) => (
  <div>
    <div
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', padding: '3px 10px 3px 6px',
        cursor: 'pointer', userSelect: 'none', background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border-default)', borderBottom: open ? '1px solid var(--border-default)' : 'none' }}
      className="hover:bg-gray-100 group"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--text-muted)', marginRight: 4,
        transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>chevron_right</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{title}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0 6px',
        borderRadius: 10, marginRight: 4 }}>{count}</span>
      {onStageAll && (
        <button title="Stage All" onClick={e => { e.stopPropagation(); onStageAll(); }}
          style={{ padding: '1px 4px', borderRadius: 3, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>add</span>
        </button>
      )}
      {onUnstageAll && (
        <button title="Unstage All" onClick={e => { e.stopPropagation(); onUnstageAll(); }}
          style={{ padding: '1px 4px', borderRadius: 3, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
          className="opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>remove</span>
        </button>
      )}
    </div>
    {open && <div>{children}</div>}
  </div>
);

// ── File row ─────────────────────────────────────────────────────────────────
const FileRow: React.FC<{
  file: GitFile;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onUntrack?: () => void;
}> = ({ file, onStage, onUnstage, onDiscard, onUntrack }) => {
  const name = file.path.split('/').pop() ?? file.path;
  const dir  = file.path.includes('/') ? file.path.split('/').slice(0, -1).join('/') : '';
  return (
    <div className="group flex items-center gap-1 px-3 py-[4px] hover:bg-blue-50 cursor-default"
      style={{ borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ fontSize: 10, fontWeight: 700, width: 14, textAlign: 'center', flexShrink: 0,
        color: statusColor(file.statusLabel) }} title={statusTitle(file)}>
        {file.statusLabel}
      </span>
      <span style={{ fontSize: 12, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={file.path}>
        {name}
      </span>
      {dir && (
        <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: 80, flexShrink: 0 }} title={file.path}>{dir}</span>
      )}
      <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">
        {onStage   && <IconBtn icon="add"    title="Stage"   onClick={onStage} />}
        {onUnstage && <IconBtn icon="remove" title="Unstage" onClick={onUnstage} />}
        {onDiscard && <IconBtn icon="undo"   title="Discard changes" onClick={onDiscard} danger />}
        {onUntrack && <IconBtn icon="do_not_disturb_on" title="Untrack (keep file)" onClick={onUntrack} danger />}
      </div>
    </div>
  );
};

// ── Main component ────────────────────────────────────────────────────────────
export const GitPanel: React.FC = () => {
  const { state } = useAppState();
  const projectRoot = state.projectRoot;

  const [status,        setStatus]        = useState<any>(null);
  const [branches,      setBranches]      = useState<any[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [message,       setMessage]       = useState('');
  const [committing,    setCommitting]    = useState(false);
  const [syncing,       setSyncing]       = useState(false);
  const [initing,       setIniting]       = useState(false);
  const [stagedOpen,    setStagedOpen]    = useState(true);
  const [changesOpen,   setChangesOpen]   = useState(true);
  const [branchOpen,    setBranchOpen]    = useState(false);
  const [newBranch,     setNewBranch]     = useState('');
  const [mergeBranch,   setMergeBranch]   = useState('');
  const [checkingOut,   setCheckingOut]   = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [justCommitted, setJustCommitted] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectRoot) return;
    setLoading(true);
    setError('');
    try {
      const s = await Cordex.git.status(projectRoot);
      if (s?.hasRepo) {
        setStatus(s);
        const b = await Cordex.git.branchList(projectRoot);
        if (b.ok) setBranches(b.branches);
      } else {
        setStatus({ hasRepo: false, files: [], branch: '', ahead: 0 });
      }
    } catch (e: any) {
      setError(e.message);
      setStatus({ hasRepo: false, files: [], branch: '', ahead: 0 });
    } finally {
      setLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => { refresh(); }, [refresh]);

  const act = (fn: () => Promise<any>) => async () => { await fn(); refresh(); };

  const handleCommit = async () => {
    if (!message.trim() || !projectRoot) return;
    setCommitting(true);
    setError('');
    try {
      await Cordex.git.commit(projectRoot, message.trim());
      setMessage('');
      setJustCommitted(true);
      await refresh();
    } catch (e: any) { setError(e.message); }
    finally { setCommitting(false); }
  };

  // Sync = pull then push (like VS Code sync button)
  const handleSync = async () => {
    if (!projectRoot) return;
    setSyncing(true);
    setError('');
    try {
      await Cordex.git.pull(projectRoot);
      await Cordex.git.push(projectRoot);
      setJustCommitted(false);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleInit = async () => {
    if (!projectRoot) return;
    setIniting(true);
    try {
      const res = await Cordex.git.init(projectRoot);
      if (res.ok) { await refresh(); }
      else setError(res.error || 'Init failed');
    } catch (e: any) { setError(e.message); }
    finally { setIniting(false); }
  };

  const handleUntrack = async (filePath: string) => {
    if (!projectRoot) return;
    if (confirm(`Stop tracking "${filePath.split('/').pop()}"? The file stays on disk.`)) {
      await Cordex.git.untrack(projectRoot, filePath);
      refresh();
    }
  };

  // ── Switch branch with proper error handling ───────────────────────────────
  const handleCheckout = async (branchName: string) => {
    if (!projectRoot || branchName === branch) return;
    setCheckingOut(true);
    setCheckoutError('');
    try {
      const res = await Cordex.git.checkout(projectRoot, branchName);
      if (res && res.ok === false) {
        setCheckoutError(res.error || `Failed to switch to "${branchName}"`);
      } else {
        await refresh();
      }
    } catch (e: any) {
      setCheckoutError(e.message || `Failed to switch to "${branchName}"`);
    } finally {
      setCheckingOut(false);
    }
  };

  // ── Guard states ──────────────────────────────────────────────────────────
  if (!projectRoot) return <Empty icon="folder_open" text="No project open" sub="Open a folder to use source control" />;
  if (status === null && loading) return <Empty icon="autorenew" text="Loading…" spinning />;
  if (!status?.hasRepo) return (
    <Empty icon="source" text="Not a Git repository" sub="Initialize to start tracking changes">
      <button onClick={handleInit} disabled={initing}
        className="mt-3 px-4 py-1.5 bg-blue-600 text-white rounded text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">add_circle</span>
        {initing ? 'Initializing…' : 'Initialize Repository'}
      </button>
      {error && <p className="text-red-400 mt-2 text-center">{error}</p>}
    </Empty>
  );

  const files: GitFile[] = status.files ?? [];
  const staged    = files.filter(f => f.staged);
  const unstaged  = files.filter(f => f.unstaged && !f.staged);
  const untracked = files.filter(f => f.untracked && !f.staged);
  const changes   = [...unstaged, ...untracked];
  const branch    = status.branch ?? '';
  const ahead     = status.ahead  ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)', fontSize: 12 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)', display: 'flex',
        alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--text-muted)' }}>source</span>
        <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-primary)', flex: 1, textTransform: 'uppercase',
          letterSpacing: '0.5px' }}>Source Control</span>
        <button onClick={refresh} title="Refresh" disabled={loading}
          style={{ padding: '3px', borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
          className="hover:bg-gray-100">
          <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{ fontSize: 15 }}>refresh</span>
        </button>
        <button onClick={act(() => Cordex.git.pull(projectRoot))} title="Pull" style={{ padding: '3px', borderRadius: 4, border: 'none',
          background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }} className="hover:bg-gray-100">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>download</span>
        </button>
        <button onClick={act(() => Cordex.git.push(projectRoot))} title={ahead ? `Push (${ahead} ahead)` : 'Push'} style={{ padding: '3px',
          borderRadius: 4, border: 'none', background: 'transparent', cursor: 'pointer',
          color: ahead ? '#3b82f6' : 'var(--text-muted)', display: 'flex', position: 'relative' }} className="hover:bg-gray-100">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>upload</span>
          {ahead > 0 && (
            <span style={{ position: 'absolute', top: -3, right: -4, background: '#3b82f6', color: 'white',
              borderRadius: 10, fontSize: 8, padding: '0 3px', fontWeight: 700, lineHeight: '14px' }}>{ahead}</span>
          )}
        </button>
      </div>

      {/* ── Branch bar ─────────────────────────────────────────────────── */}
      <div style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-default)', display: 'flex',
        alignItems: 'center', gap: 5, flexShrink: 0, cursor: 'pointer' }}
        onClick={() => setBranchOpen(v => !v)} className="hover:bg-gray-50">
        <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-muted)' }}>fork_right</span>
        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, flex: 1 }}>{branch || 'No branch'}</span>
        {checkingOut && (
          <span className="material-symbols-outlined animate-spin" style={{ fontSize: 13, color: '#f97316' }}>autorenew</span>
        )}
        <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-muted)',
          transform: branchOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>expand_more</span>
      </div>

      {/* Branch drawer */}
      {branchOpen && (
        <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)', background: 'var(--bg-elevated)', flexShrink: 0 }}>
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Switch Branch
              {checkingOut && <span style={{ marginLeft: 6, color: '#f97316' }}>Switching…</span>}
            </div>
            <select
              value={branch}
              disabled={checkingOut}
              onChange={e => handleCheckout(e.target.value)}
              style={{ width: '100%', fontSize: 11, padding: '4px 6px', border: `1px solid ${checkoutError ? '#fca5a5' : 'var(--border-default)'}`,
                borderRadius: 5, background: checkingOut ? 'var(--bg-elevated)' : 'var(--bg-app)', color: 'var(--text-primary)',
                cursor: checkingOut ? 'not-allowed' : 'pointer' }}>
              {branches.map(b => <option key={b.name} value={b.name}>{b.current ? '✓ ' : '  '}{b.name}</option>)}
            </select>
            {checkoutError && (
              <div style={{ marginTop: 4, fontSize: 10, color: '#ef4444', background: '#fef2f2',
                padding: '3px 6px', borderRadius: 4, lineHeight: 1.4 }}>
                {checkoutError}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
            <input value={newBranch} onChange={e => setNewBranch(e.target.value)}
              placeholder="new-branch-name"
              style={{ flex: 1, fontSize: 11, padding: '4px 6px', border: '1px solid var(--border-default)',
                borderRadius: 5, background: 'var(--bg-app)', color: 'var(--text-primary)', outline: 'none' }} />
            <button onClick={act(() => { const b = newBranch.trim(); if (b) { setNewBranch(''); return Cordex.git.createBranch(projectRoot, b); } return Promise.resolve(); })}
              disabled={!newBranch.trim()}
              style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#2563eb', color: 'white',
                fontSize: 11, fontWeight: 600, cursor: 'pointer' }} className="hover:bg-blue-700 disabled:opacity-50">
              Create
            </button>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <select value={mergeBranch} onChange={e => setMergeBranch(e.target.value)}
              style={{ flex: 1, fontSize: 11, padding: '4px 6px', border: '1px solid var(--border-default)',
                borderRadius: 5, background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
              <option value="">Merge branch into {branch}…</option>
              {branches.filter(b => !b.current).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </select>
            <button onClick={act(() => mergeBranch ? Cordex.git.merge(projectRoot, mergeBranch) : Promise.resolve())}
              disabled={!mergeBranch}
              style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#7c3aed', color: 'white',
                fontSize: 11, fontWeight: 600, cursor: 'pointer' }} className="hover:bg-purple-700 disabled:opacity-50">
              Merge
            </button>
          </div>
        </div>
      )}

      {/* ── Commit area ─────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleCommit(); }}
          placeholder="Message (Ctrl+Enter to commit)"
          rows={3}
          style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-default)',
            borderRadius: 5, resize: 'none', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-elevated)',
            fontFamily: 'inherit', boxSizing: 'border-box' }}
        />

        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          {/* Commit button */}
          <button
            onClick={handleCommit}
            disabled={!message.trim() || committing || staged.length === 0}
            style={{ flex: 1, padding: '6px', borderRadius: 5, border: 'none',
              background: '#2563eb', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            className="hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
            {committing ? 'Committing…' : `Commit${staged.length ? ` (${staged.length})` : ''}`}
          </button>

          {/* Sync button — visible when there are commits to push (ahead > 0) or just after a commit */}
          {(ahead > 0 || justCommitted) && (
            <button
              onClick={handleSync}
              disabled={syncing}
              title="Sync Changes — pull then push (like VS Code sync)"
              style={{ padding: '6px 10px', borderRadius: 5, border: 'none',
                background: syncing ? 'var(--border-default)' : '#0f172a', color: syncing ? 'var(--text-muted)' : 'white',
                fontSize: 12, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
              className="hover:bg-gray-800 transition-colors">
              <span className={`material-symbols-outlined ${syncing ? 'animate-spin' : ''}`} style={{ fontSize: 15 }}>
                {syncing ? 'autorenew' : 'sync'}
              </span>
              {syncing ? 'Syncing…' : 'Sync'}
              {ahead > 0 && !syncing && (
                <span style={{ background: '#3b82f6', color: 'white', borderRadius: 10,
                  fontSize: 9, padding: '0 4px', fontWeight: 700, lineHeight: '14px' }}>
                  {ahead}
                </span>
              )}
            </button>
          )}
        </div>

        {error && (
          <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444', background: '#fef2f2',
            padding: '4px 8px', borderRadius: 4 }}>{error}</div>
        )}
      </div>

      {/* ── File sections ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {staged.length === 0 && changes.length === 0 && (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, userSelect: 'none' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, display: 'block', marginBottom: 6 }}>check_circle</span>
            No changes
          </div>
        )}

        {/* Staged Changes */}
        {staged.length > 0 && (
          <Section title="Staged Changes" count={staged.length} open={stagedOpen}
            onToggle={() => setStagedOpen(v => !v)}
            onUnstageAll={act(() => Cordex.git.unstageAll?.(projectRoot) ?? Promise.resolve())}>
            {staged.map((f, i) => (
              <FileRow key={i} file={f}
                onUnstage={act(() => Cordex.git.unstage(projectRoot, f.path))}
                onUntrack={f.staged && !f.untracked ? () => handleUntrack(f.path) : undefined}
              />
            ))}
          </Section>
        )}

        {/* Changes (unstaged + untracked) */}
        {changes.length > 0 && (
          <Section title="Changes" count={changes.length} open={changesOpen}
            onToggle={() => setChangesOpen(v => !v)}
            onStageAll={act(() => Cordex.git.stageAll(projectRoot))}>
            {changes.map((f, i) => (
              <FileRow key={i} file={f}
                onStage={act(() => Cordex.git.stage(projectRoot, f.path))}
                onDiscard={!f.untracked ? act(() => Cordex.git.discard(projectRoot, f.path)) : undefined}
              />
            ))}
          </Section>
        )}
      </div>
    </div>
  );
};

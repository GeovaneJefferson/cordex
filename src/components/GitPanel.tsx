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

const Empty: React.FC<{ icon: string; text: string; sub?: string; spinning?: boolean; children?: React.ReactNode }> = ({
  icon, text, sub, spinning, children,
}) => (
  <div className="flex flex-col items-center justify-center h-full text-gray-400 text-xs p-4">
    <span className={`material-symbols-outlined text-2xl mb-1 ${spinning ? 'animate-spin' : ''}`}>{icon}</span>
    <p className="font-medium">{text}</p>
    {sub && <p className="mt-0.5">{sub}</p>}
    {children}
  </div>
);

const btnColorMap: Record<string, string> = {
  blue:  'hover:bg-blue-50 text-blue-600',
  amber: 'hover:bg-amber-50 text-amber-600',
  red:   'hover:bg-red-50 text-red-600',
  green: 'hover:bg-green-50 text-green-600',
};
const Btn: React.FC<{ onClick: () => void; label: string; color: string }> = ({ onClick, label, color }) => (
  <button onClick={onClick} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${btnColorMap[color] || 'hover:bg-gray-50 text-gray-600'}`}>
    {label}
  </button>
);

export const GitPanel: React.FC = () => {
  const { state } = useAppState();
  const projectRoot = state.projectRoot;

  const [status,      setStatus]      = useState<any>(null);
  const [branches,    setBranches]    = useState<any[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [newBranch,   setNewBranch]   = useState('');
  const [mergeBranch, setMergeBranch] = useState('');
  const [message,     setMessage]     = useState('');
  const [initing,     setIniting]     = useState(false);

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

  const withRefresh = (action: () => Promise<any>) => async () => {
    await action();
    await refresh();
  };

  const handleInit = async () => {
    if (!projectRoot) return;
    setIniting(true);
    setError('');
    try {
      const res = await Cordex.git.init(projectRoot);
      if (res.ok) {
        setStatus({ hasRepo: true, files: [], branch: 'main', ahead: 0 });
        setBranches([{ name: 'main', current: true }]);
        setTimeout(() => refresh(), 500);
      } else {
        setError(res.error || 'Failed to initialize repository');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIniting(false);
    }
  };

  const handleUntrack = async (file: string) => {
    if (!projectRoot) return;
    if (confirm(`Stop tracking "${file}"? It will be removed from Git but kept on disk.`)) {
      await Cordex.git.untrack(projectRoot, file);
      await refresh();
    }
  };

  if (!projectRoot) return <Empty icon="folder_open" text="No project open" sub="Open a folder to use Git" />;
  if (status === null && loading) return <Empty icon="autorenew" text="Loading..." spinning />;
  if (!status?.hasRepo) {
    return (
      <Empty icon="source" text="Not a Git repository">
        <button onClick={handleInit} disabled={initing}
          className="mt-2 px-4 py-1.5 bg-purple-600 text-white rounded-full text-xs font-medium hover:bg-purple-700 disabled:opacity-50">
          {initing ? 'Initializing...' : 'Initialize Repository'}
        </button>
        {error && <p className="text-red-400 mt-1">{error}</p>}
      </Empty>
    );
  }

  const files: GitFile[] = status.files || [];
  return (
    <div className="flex flex-col h-full bg-white text-xs select-none">
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <span className="font-semibold text-gray-700">Source Control</span>
        <button onClick={refresh} disabled={loading} className="p-1 rounded hover:bg-gray-100 text-gray-500">
          <span className="material-symbols-outlined text-sm">{loading ? 'autorenew' : 'refresh'}</span>
        </button>
      </div>

      <div className="px-3 py-2 space-y-2 border-b border-gray-50">
        <div className="flex gap-1">
          <input value={message} onChange={e => setMessage(e.target.value)} placeholder="Commit message"
            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-purple-400" />
          <button onClick={withRefresh(() => Cordex.git.commit(projectRoot, message.trim()))} disabled={!message.trim()}
            className="px-3 py-1 bg-purple-600 text-white rounded font-medium hover:bg-purple-700 disabled:opacity-50">Commit</button>
        </div>
        <div className="flex gap-2">
          <button onClick={withRefresh(() => Cordex.git.stageAll(projectRoot))}
            className="flex-1 py-1.5 rounded bg-blue-50 text-blue-700 font-medium hover:bg-blue-100">Stage All</button>
          <button onClick={withRefresh(() => Cordex.git.pull(projectRoot))}
            className="flex-1 py-1.5 rounded bg-green-50 text-green-700 font-medium hover:bg-green-100">Pull</button>
          <button onClick={withRefresh(() => Cordex.git.push(projectRoot))}
            className="flex-1 py-1.5 rounded bg-orange-50 text-orange-700 font-medium hover:bg-orange-100">Push</button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-50 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-500">Branch</span>
          <select value={status.branch} onChange={e => withRefresh(() => Cordex.git.checkout(projectRoot, e.target.value))()}
            className="flex-1 border border-gray-200 rounded px-1.5 py-0.5">
            {branches.map(b => <option key={b.name} value={b.name}>{b.current ? '✓ ' : '  '}{b.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <input value={newBranch} onChange={e => setNewBranch(e.target.value)} placeholder="New branch"
            className="flex-1 border border-gray-200 rounded px-2 py-0.5" />
          <button onClick={withRefresh(() => Cordex.git.createBranch(projectRoot, newBranch.trim()))}
            className="px-2 py-0.5 bg-blue-500 text-white rounded hover:bg-blue-600">Create</button>
        </div>
        <div className="flex gap-2">
          <select value={mergeBranch} onChange={e => setMergeBranch(e.target.value)}
            className="flex-1 border border-gray-200 rounded px-1.5 py-0.5">
            <option value="">Merge branch...</option>
            {branches.filter(b => !b.current).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
          </select>
          <button onClick={withRefresh(() => Cordex.git.merge(projectRoot, mergeBranch))} disabled={!mergeBranch}
            className="px-2 py-0.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">Merge</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {error && <div className="text-red-500 mb-1">{error}</div>}
        {files.length === 0 ? (
          <div className="text-gray-400 text-center py-4">Working tree clean</div>
        ) : (
          files.map((f, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded group">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className={`font-mono text-[10px] w-5 text-center ${
                  f.statusLabel === 'U' ? 'text-green-600' :
                  f.statusLabel === 'A' ? 'text-blue-600' :
                  f.statusLabel === 'D' ? 'text-red-600' : 'text-amber-600'
                }`}>{f.statusLabel}</span>
                <span className="truncate">{f.path}</span>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {f.unstaged  && <Btn onClick={withRefresh(() => Cordex.git.stage(projectRoot, f.path))}   label="Stage"   color="blue" />}
                {f.staged    && <Btn onClick={withRefresh(() => Cordex.git.unstage(projectRoot, f.path))} label="Unstage" color="amber" />}
                {!f.staged && !f.untracked && <Btn onClick={withRefresh(() => Cordex.git.discard(projectRoot, f.path))} label="Discard" color="red" />}
                {f.untracked && <Btn onClick={withRefresh(() => Cordex.git.stage(projectRoot, f.path))}   label="Track"   color="green" />}
                {!f.untracked && <Btn onClick={() => handleUntrack(f.path)} label="Untrack" color="red" />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
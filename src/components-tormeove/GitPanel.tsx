import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../store/AppContext';

const Cordex = (window as any).Cordex;

interface GitFile {
  path: string; xy: string; x: string; y: string;
  staged: boolean; unstaged: boolean; untracked: boolean; statusLabel: string;
}
interface GitStatus {
  hasRepo: boolean; branch: string; ahead: number; files: GitFile[];
}
interface Commit { graph: string; hash: string; message: string; }

const STATUS_COLOR: Record<string, string> = {
  U: 'text-teal-600', A: 'text-emerald-600',
  M: 'text-amber-600', D: 'text-red-500', R: 'text-blue-500',
};

function fileName(p: string) { return p.split('/').pop() ?? p; }
function dirName(p: string)  { const parts = p.split('/'); return parts.length > 1 ? parts.slice(0,-1).join('/') : ''; }

const FileRow: React.FC<{
  file: GitFile; onStage: () => void; onUnstage: () => void; onDiscard: () => void;
  onDiff: () => void; active?: boolean;
}> = ({ file, onStage, onUnstage, onDiscard, onDiff, active }) => {
  const name = fileName(file.path);
  const dir  = dirName(file.path);
  return (
    <div onClick={onDiff}
      className={`flex items-center gap-1.5 px-2 py-[4px] cursor-pointer group hover:bg-gray-50 transition-colors select-none ${active ? 'bg-orange-50' : ''}`}>
      <span className={`text-[10px] font-bold w-3 flex-shrink-0 ${STATUS_COLOR[file.statusLabel] ?? 'text-gray-500'}`}>
        {file.statusLabel}
      </span>
      <span className="text-[12px] text-gray-700 flex-1 truncate" title={file.path}>
        {name}
        {dir && <span className="text-[10px] text-gray-400 ml-1">{dir}</span>}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {file.staged
          ? <IconBtn icon="remove" title="Unstage" onClick={e => { e.stopPropagation(); onUnstage(); }} />
          : <IconBtn icon="add" title="Stage" onClick={e => { e.stopPropagation(); onStage(); }} />
        }
        {!file.untracked && (
          <IconBtn icon="undo" title="Discard changes" danger onClick={e => { e.stopPropagation(); onDiscard(); }} />
        )}
      </div>
    </div>
  );
};

const IconBtn: React.FC<{ icon: string; title: string; onClick: React.MouseEventHandler; danger?: boolean }> = ({ icon, title, onClick, danger }) => (
  <button title={title} onClick={onClick}
    className={`p-0.5 rounded transition-colors ${danger ? 'text-red-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'}`}>
    <span className="material-symbols-outlined text-[13px]">{icon}</span>
  </button>
);

// ── Diff viewer ────────────────────────────────────────────────────────────────
const DiffViewer: React.FC<{ diff: string; onClose: () => void; fileName: string }> = ({ diff, onClose, fileName }) => {
  if (!diff.trim()) return (
    <div className="flex-1 flex items-center justify-center text-gray-300 text-xs select-none">No changes</div>
  );

  const lines = diff.split('\n');
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <span className="text-[11px] font-medium text-gray-600 truncate">{fileName}</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-0.5 rounded transition-colors">
          <span className="material-symbols-outlined text-[13px]">close</span>
        </button>
      </div>
      <div className="flex-1 overflow-auto font-mono text-[11px]">
        {lines.map((line, i) => {
          const isAdd = line.startsWith('+') && !line.startsWith('+++');
          const isDel = line.startsWith('-') && !line.startsWith('---');
          const isHunk = line.startsWith('@@');
          return (
            <div key={i} className={`px-3 py-[1px] whitespace-pre leading-relaxed
              ${isAdd ? 'bg-emerald-50 text-emerald-800' : isDel ? 'bg-red-50 text-red-800' : isHunk ? 'bg-blue-50 text-blue-700' : 'text-gray-600'}`}>
              {line || ' '}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Commit log ─────────────────────────────────────────────────────────────────
const CommitLog: React.FC<{ cwd: string }> = ({ cwd }) => {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Cordex?.git?.log?.({ cwd, limit: 30 }).then((r: any) => {
      setCommits(r?.commits ?? []);
      setLoading(false);
    });
  }, [cwd]);

  if (loading) return <div className="flex items-center justify-center h-20 text-gray-300 text-xs">Loading…</div>;
  if (!commits.length) return <div className="flex items-center justify-center h-20 text-gray-300 text-xs">No commits yet</div>;

  return (
    <div className="flex-1 overflow-auto">
      {commits.map((c, i) => (
        <div key={i} className="flex items-start gap-2 px-3 py-[5px] hover:bg-gray-50 transition-colors border-b border-gray-50">
          <span className="font-mono text-[9px] text-blue-400 flex-shrink-0 mt-[1px]">{c.hash.slice(0, 7)}</span>
          <span className="text-[11px] text-gray-600 truncate">{c.message}</span>
        </div>
      ))}
    </div>
  );
};

// ── Main GitPanel ──────────────────────────────────────────────────────────────
export const GitPanel: React.FC = () => {
  const { state } = useAppState();
  const cwd = state.projectRoot ?? '';

  const [status,    setStatus]    = useState<GitStatus | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [message,   setMessage]   = useState('');
  const [committing,setCommitting] = useState(false);
  const [pushing,   setPushing]   = useState(false);
  const [diffFile,  setDiffFile]  = useState<{ path: string; diff: string } | null>(null);
  const [tab,       setTab]       = useState<'changes' | 'history'>('changes');
  const [opError,   setOpError]   = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const refresh = useCallback(async () => {
    if (!cwd) return;
    const r = await Cordex?.git?.status?.({ cwd });
    if (r?.ok) setStatus(r);
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 4000);
    return () => clearInterval(pollRef.current);
  }, [refresh]);

  const stage   = async (f: GitFile) => { await Cordex?.git?.stage?.({ cwd, filePath: f.path }); refresh(); };
  const unstage = async (f: GitFile) => { await Cordex?.git?.unstage?.({ cwd, filePath: f.path }); refresh(); };
  const discard = async (f: GitFile) => {
    if (!window.confirm(`Discard changes in "${f.path}"?`)) return;
    await Cordex?.git?.discard?.({ cwd, filePath: f.path }); refresh();
  };
  const stageAll = async () => { await Cordex?.git?.stageAll?.({ cwd }); refresh(); };

  const openDiff = async (f: GitFile) => {
    const r = await Cordex?.git?.diff?.({ cwd, filePath: f.path, staged: f.staged });
    setDiffFile({ path: f.path, diff: r?.diff ?? '' });
  };

  const commit = async () => {
    if (!message.trim()) return;
    setCommitting(true); setOpError(null);
    const r = await Cordex?.git?.commit?.({ cwd, message: message.trim() });
    setCommitting(false);
    if (r?.ok) { setMessage(''); refresh(); }
    else setOpError(r?.error ?? 'Commit failed');
  };

  const push = async () => {
    setPushing(true); setOpError(null);
    const r = await Cordex?.git?.push?.({ cwd });
    setPushing(false);
    if (!r?.ok) setOpError(r?.error ?? 'Push failed');
    else refresh();
  };

  const initRepo = async () => {
    await Cordex?.git?.init?.({ cwd }); refresh();
  };

  if (!cwd) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-300 text-xs select-none gap-2">
      <span className="material-symbols-outlined text-[32px]">source_branch</span>
      <span>Open a folder first</span>
    </div>
  );

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-300 text-xs">Loading…</div>
  );

  if (!status?.hasRepo) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-300 text-xs select-none gap-3 px-4">
      <span className="material-symbols-outlined text-[32px]">source_branch</span>
      <span className="text-center">Not a Git repository</span>
      <button onClick={initRepo}
        className="px-3 py-1.5 bg-orange-500 text-white text-[11px] rounded-lg hover:bg-orange-600 transition-colors">
        Initialize Repository
      </button>
    </div>
  );

  const stagedFiles   = status?.files.filter(f => f.staged) ?? [];
  const unstagedFiles = status?.files.filter(f => !f.staged) ?? [];
  const hasStaged     = stagedFiles.length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden text-[12px]">

      {/* ── Branch bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px] text-orange-500">source_branch</span>
          <span className="font-semibold text-gray-700">{status?.branch}</span>
          {(status?.ahead ?? 0) > 0 && (
            <span className="text-[10px] text-blue-500 font-medium">↑{status?.ahead}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refresh} title="Refresh" className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors">
            <span className="material-symbols-outlined text-[13px]">refresh</span>
          </button>
          <button onClick={push} disabled={pushing || (status?.ahead ?? 0) === 0} title="Push"
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-40">
            <span className={`material-symbols-outlined text-[13px] ${pushing ? 'animate-bounce' : ''}`}>upload</span>
          </button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-100 flex-shrink-0">
        {(['changes', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors
              ${tab === t ? 'text-gray-800 border-b-2 border-orange-500' : 'text-gray-400 hover:text-gray-600'}`}>
            {t === 'changes' ? `Changes${status?.files.length ? ` (${status.files.length})` : ''}` : 'History'}
          </button>
        ))}
      </div>

      {tab === 'history' ? (
        <CommitLog cwd={cwd} />
      ) : (
        <div className="flex flex-col flex-1 min-h-0">

          {/* Diff pane */}
          {diffFile && (
            <DiffViewer diff={diffFile.diff} fileName={fileName(diffFile.path)} onClose={() => setDiffFile(null)} />
          )}

          {/* Changes list — activeDiffPath extracted here so TS doesn't narrow to never inside !diffFile block */}
          {(() => { const activeDiffPath = diffFile?.path; return !diffFile && (
            <div className="flex-1 overflow-auto min-h-0">

              {/* Staged */}
              {stagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Staged ({stagedFiles.length})</span>
                    <button onClick={() => stagedFiles.forEach(f => unstage(f))} title="Unstage all"
                      className="text-[10px] text-gray-400 hover:text-red-500 transition-colors">Unstage All</button>
                  </div>
                  {stagedFiles.map(f => (
                    <FileRow key={f.path} file={f}
                      onStage={() => stage(f)} onUnstage={() => unstage(f)}
                      onDiscard={() => discard(f)} onDiff={() => openDiff(f)}
                      active={activeDiffPath === f.path}
                    />
                  ))}
                </div>
              )}

              {/* Unstaged / untracked */}
              {unstagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Changes ({unstagedFiles.length})</span>
                    <button onClick={stageAll} title="Stage all"
                      className="text-[10px] text-gray-400 hover:text-orange-500 transition-colors">Stage All</button>
                  </div>
                  {unstagedFiles.map(f => (
                    <FileRow key={f.path} file={f}
                      onStage={() => stage(f)} onUnstage={() => unstage(f)}
                      onDiscard={() => discard(f)} onDiff={() => openDiff(f)}
                      active={activeDiffPath === f.path}
                    />
                  ))}
                </div>
              )}

              {status?.files.length === 0 && (
                <div className="flex flex-col items-center justify-center h-24 text-gray-300 text-xs select-none gap-1">
                  <span className="material-symbols-outlined text-[24px]">check_circle</span>
                  <span>Working tree clean</span>
                </div>
              )}
            </div>
          ); })()}

          {/* Commit box */}
          <div className="border-t border-gray-100 flex-shrink-0 p-2 space-y-1.5">
            {opError && (
              <div className="text-[10px] text-red-500 bg-red-50 rounded px-2 py-1 truncate" title={opError}>{opError}</div>
            )}
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commit(); }}
              placeholder="Commit message (Ctrl+Enter to commit)"
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-[11.5px] resize-none
                focus:outline-none focus:border-orange-400 transition-colors bg-white placeholder-gray-300"
            />
            <div className="flex gap-1.5">
              <button onClick={commit} disabled={!message.trim() || committing || !hasStaged}
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11.5px] font-semibold
                  bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                <span className={`material-symbols-outlined text-[13px] ${committing ? 'animate-spin' : ''}`}>
                  {committing ? 'autorenew' : 'check'}
                </span>
                Commit{hasStaged ? ` (${stagedFiles.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
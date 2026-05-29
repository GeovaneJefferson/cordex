import React, { useState, useCallback, useEffect } from 'react';

const Cordex = (window as any).Cordex;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CustomAction {
  id: string;
  label: string;
  command: string;
  description?: string;
  color: string;
  confirm: boolean;
  icon: string;
  cwd?: string;
}

const COLOR_OPTIONS = [
  { key: 'orange', bg: '#fff7ed', text: '#c2410c', border: '#fed7aa', active: '#f97316' },
  { key: 'blue',   bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe', active: '#3b82f6' },
  { key: 'green',  bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0', active: '#22c55e' },
  { key: 'purple', bg: '#faf5ff', text: '#7e22ce', border: '#e9d5ff', active: '#a855f7' },
  { key: 'red',    bg: '#fff1f2', text: '#be123c', border: '#fecdd3', active: '#f43f5e' },
  { key: 'teal',   bg: '#f0fdfa', text: '#0f766e', border: '#99f6e4', active: '#14b8a6' },
];

const ICON_OPTIONS = [
  'rocket_launch','play_arrow','terminal','cloud_upload','build',
  'deployed_code','refresh','send','sync','publish',
  'package_2','bug_report','science','update','bolt',
];

// ── Project-local storage ─────────────────────────────────────────────────────
function getStorageKey(projectRoot: string | null): string {
  if (!projectRoot) return 'cordex:custom_actions:__global__';
  // Encode project path to a safe localStorage key
  const encoded = projectRoot.replace(/[^a-zA-Z0-9]/g, '_');
  return `cordex:custom_actions:${encoded}`;
}

function loadActions(projectRoot: string | null): CustomAction[] {
  try {
    return JSON.parse(localStorage.getItem(getStorageKey(projectRoot)) ?? '[]');
  } catch { return []; }
}

function saveActions(actions: CustomAction[], projectRoot: string | null) {
  try {
    localStorage.setItem(getStorageKey(projectRoot), JSON.stringify(actions));
  } catch {}
}

// ── ConfirmDialog ─────────────────────────────────────────────────────────────
const ConfirmDialog: React.FC<{
  action: CustomAction;
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ action, onConfirm, onCancel }) => {
  const color = COLOR_OPTIONS.find(c => c.key === action.color) ?? COLOR_OPTIONS[0];
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{ background: 'var(--bg-app)', borderRadius: 10, padding: 24, maxWidth: 420, width: '90%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)', border: '1px solid var(--border-default)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: color.active }}>
            {action.icon}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{action.label}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
          Run this command in a new terminal tab?
        </p>
        <div style={{ background: 'var(--bg-elevated)', borderRadius: 6, padding: '8px 12px', fontFamily: 'monospace',
          fontSize: 11, color: 'var(--text-primary)', wordBreak: 'break-all', lineHeight: 1.6, marginBottom: 20,
          border: '1px solid var(--border-default)' }}>
          {action.command}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel}
            style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid var(--border-default)',
              background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
            Cancel
          </button>
          <button onClick={onConfirm}
            style={{ padding: '7px 20px', borderRadius: 6, border: 'none',
              background: color.active, color: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
            Run
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ActionEditor ──────────────────────────────────────────────────────────────
const ActionEditor: React.FC<{
  action: Partial<CustomAction>;
  onChange: (a: Partial<CustomAction>) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
}> = ({ action, onChange, onSave, onCancel, isNew }) => {
  const selectedColor = COLOR_OPTIONS.find(c => c.key === action.color) ?? COLOR_OPTIONS[0];
  const canSave = !!(action.label?.trim()) && !!(action.command?.trim());
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12,
        textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {isNew ? 'New Action' : 'Edit Action'}
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Label</label>
        <input value={action.label ?? ''} onChange={e => onChange({ ...action, label: e.target.value })}
          placeholder="Deploy Production DK"
          style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderRadius: 5, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>Command</label>
        <textarea value={action.command ?? ''} onChange={e => onChange({ ...action, command: e.target.value })}
          placeholder={'EXPO_PUBLIC_LANG=da npx eas update --branch production-da --message "Updates"'}
          rows={3}
          style={{ width: '100%', fontSize: 11, padding: '6px 8px', border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderRadius: 5, outline: 'none', resize: 'vertical', fontFamily: 'monospace',
            boxSizing: 'border-box', lineHeight: 1.5 }} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>
          Description <span style={{ fontWeight: 400 }}>(optional)</span>
        </label>
        <input value={action.description ?? ''} onChange={e => onChange({ ...action, description: e.target.value })}
          placeholder="Short note about what this does"
          style={{ width: '100%', fontSize: 12, padding: '6px 8px', border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderRadius: 5, outline: 'none', boxSizing: 'border-box' }} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 3 }}>
          Working Dir <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(empty = project root)</span>
        </label>
        <input value={action.cwd ?? ''} onChange={e => onChange({ ...action, cwd: e.target.value })}
          placeholder="/absolute/path or relative"
          style={{ width: '100%', fontSize: 11, padding: '6px 8px', border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', borderRadius: 5, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Icon</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {ICON_OPTIONS.map(ic => (
            <button key={ic} onClick={() => onChange({ ...action, icon: ic })} title={ic}
              style={{ padding: '4px 5px', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center',
                border: action.icon === ic ? '2px solid #f97316' : '1px solid var(--border-default)',
                background: action.icon === ic ? '#fff7ed' : 'var(--bg-elevated)' }}>
              <span className="material-symbols-outlined"
                style={{ fontSize: 15, color: action.icon === ic ? '#f97316' : 'var(--text-muted)' }}>{ic}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Color</label>
        <div style={{ display: 'flex', gap: 7 }}>
          {COLOR_OPTIONS.map(c => (
            <button key={c.key} onClick={() => onChange({ ...action, color: c.key })}
              style={{ width: 22, height: 22, borderRadius: '50%', background: c.active, cursor: 'pointer',
                border: 'none', outline: 'none',
                boxShadow: action.color === c.key ? `0 0 0 2px white, 0 0 0 4px ${c.active}` : 'none',
                transition: 'box-shadow 0.15s' }} />
          ))}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
        marginBottom: 16, userSelect: 'none', fontSize: 12, color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={action.confirm ?? true}
          onChange={e => onChange({ ...action, confirm: e.target.checked })}
          style={{ width: 14, height: 14, accentColor: selectedColor.active }} />
        Ask for confirmation before running
      </label>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel}
          style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12 }}>
          Cancel
        </button>
        <button onClick={onSave} disabled={!canSave}
          style={{ padding: '6px 18px', borderRadius: 6, border: 'none',
            background: canSave ? selectedColor.active : 'var(--border-default)',
            color: canSave ? 'white' : 'var(--text-muted)',
            cursor: canSave ? 'pointer' : 'not-allowed', fontSize: 12, fontWeight: 700 }}>
          Save
        </button>
      </div>
    </div>
  );
};

// ── EditModal ─────────────────────────────────────────────────────────────────
const EditModal: React.FC<{
  action: CustomAction;
  onSave: (updated: CustomAction) => void;
  onClose: () => void;
}> = ({ action, onSave, onClose }) => {
  const [draft, setDraft] = useState<Partial<CustomAction>>(action);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--bg-app)', borderRadius: 10, padding: 20, width: 440,
        maxHeight: '85vh', overflowY: 'auto',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', border: '1px solid var(--border-default)' }}>
        <ActionEditor
          action={draft}
          onChange={setDraft}
          onSave={() => {
            if (!draft.label?.trim() || !draft.command?.trim()) return;
            onSave({ ...action, ...draft } as CustomAction);
          }}
          onCancel={onClose}
          isNew={false}
        />
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
interface CustomActionsPanelProps {
  projectRoot: string | null;
  onClose?: () => void;
}

export const CustomActionsPanel: React.FC<CustomActionsPanelProps> = ({ projectRoot, onClose }) => {
  // Load actions based on current projectRoot (project-local)
  const [actions,       setActions]       = useState<CustomAction[]>(() => loadActions(projectRoot));
  const [newDraft,      setNewDraft]      = useState<Partial<CustomAction> | null>(null);
  const [editingAction, setEditingAction] = useState<CustomAction | null>(null);
  const [confirmAction, setConfirmAction] = useState<CustomAction | null>(null);
  const [runningId,     setRunningId]     = useState<string | null>(null);
  const [resultMap,     setResultMap]     = useState<Record<string, 'ok' | 'error'>>({});

  // Reload actions when projectRoot changes (switching projects)
  useEffect(() => {
    setActions(loadActions(projectRoot));
    setNewDraft(null);
    setEditingAction(null);
  }, [projectRoot]);

  const persist = (next: CustomAction[]) => {
    setActions(next);
    saveActions(next, projectRoot);
  };

  const blankDraft = (): Partial<CustomAction> => ({
    id: `action_${Date.now()}`,
    label: '', command: '', description: '', color: 'orange',
    confirm: true, icon: 'rocket_launch', cwd: '',
  });

  // ── Run a command in a dedicated named terminal tab ───────────────────
  const runAction = useCallback(async (action: CustomAction) => {
    setRunningId(action.id);
    try {
      window.dispatchEvent(new CustomEvent('cordex:run-in-terminal', {
        detail: {
          label: action.label,
          command: action.command,
        },
      }));
      setResultMap(r => ({ ...r, [action.id]: 'ok' }));
    } catch {
      setResultMap(r => ({ ...r, [action.id]: 'error' }));
    }
    setRunningId(null);
    setTimeout(() => setResultMap(r => { const n = { ...r }; delete n[action.id]; return n; }), 3000);
  }, [projectRoot]);

  const handleClick = (action: CustomAction) => {
    if (action.confirm) setConfirmAction(action);
    else runAction(action);
  };

  // ── CRUD ──────────────────────────────────────────────────────────────
  const saveNew = () => {
    if (!newDraft?.label?.trim() || !newDraft?.command?.trim()) return;
    const full: CustomAction = {
      id: newDraft.id ?? `action_${Date.now()}`,
      label: newDraft.label!, command: newDraft.command!,
      description: newDraft.description ?? '',
      color: newDraft.color ?? 'orange', confirm: newDraft.confirm ?? true,
      icon: newDraft.icon ?? 'rocket_launch', cwd: newDraft.cwd ?? '',
    };
    persist([...actions, full]);
    setNewDraft(null);
  };

  const saveEdit = (updated: CustomAction) => {
    persist(actions.map(a => a.id === updated.id ? updated : a));
    setEditingAction(null);
  };

  const deleteAction = (id: string) => {
    if (confirm('Delete this action?')) persist(actions.filter(a => a.id !== id));
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-app)', fontSize: 12, position: 'relative' }}>
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          onConfirm={() => { runAction(confirmAction); setConfirmAction(null); }}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {editingAction && (
        <EditModal
          action={editingAction}
          onSave={saveEdit}
          onClose={() => setEditingAction(null)}
        />
      )}

      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-default)', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: '#f97316' }}>bolt</span>
        <span style={{ fontWeight: 700, fontSize: 11, color: 'var(--text-primary)', flex: 1,
          textTransform: 'uppercase', letterSpacing: '0.5px' }}>Custom Actions</span>
        {projectRoot && (
          <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 400, maxWidth: 100,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={projectRoot}>
            {projectRoot.split('/').pop() ?? projectRoot.split('\\').pop()}
          </span>
        )}
        <button onClick={() => { setNewDraft(blankDraft()); }} disabled={!!newDraft}
          title="New action"
          style={{ padding: 3, borderRadius: 4, border: 'none', background: 'transparent',
            cursor: newDraft ? 'not-allowed' : 'pointer',
            color: newDraft ? 'var(--text-muted)' : '#f97316', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_circle</span>
        </button>
        {/* Always show close button */}
        <button
          onClick={onClose}
          title="Close"
          style={{ padding: 3, borderRadius: 4, border: 'none', background: 'transparent',
            cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }} className="sidebar-scroll">

        {newDraft && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 8,
            padding: 14, marginBottom: 10 }}>
            <ActionEditor
              action={newDraft}
              onChange={setNewDraft}
              onSave={saveNew}
              onCancel={() => setNewDraft(null)}
              isNew
            />
          </div>
        )}

        {actions.length === 0 && !newDraft && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', userSelect: 'none' }}>
            <span className="material-symbols-outlined"
              style={{ fontSize: 36, display: 'block', marginBottom: 8, color: 'var(--border-default)' }}>bolt</span>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>No actions yet</div>
            <div style={{ fontSize: 11 }}>Press + to create one</div>
            {!projectRoot && (
              <div style={{ fontSize: 10, color: '#f97316', marginTop: 6 }}>Open a project to save actions per-project</div>
            )}
          </div>
        )}

        {actions.map(action => {
          const color   = COLOR_OPTIONS.find(c => c.key === action.color) ?? COLOR_OPTIONS[0];
          const running = runningId === action.id;
          const result  = resultMap[action.id];
          return (
            <div key={action.id} style={{ marginBottom: 6, border: `1px solid ${color.border}`,
              borderRadius: 7, background: color.bg, overflow: 'hidden' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px',
                cursor: 'pointer' }} onClick={() => handleClick(action)}>

                <div style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                  background: `${color.active}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className={`material-symbols-outlined ${running ? 'animate-spin' : ''}`}
                    style={{ fontSize: 15, color: color.active }}>
                    {running ? 'autorenew' : action.icon}
                  </span>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: color.text }}>
                    {action.label}
                    {action.confirm && (
                      <span style={{ fontSize: 9, marginLeft: 5, color: 'var(--text-muted)', fontWeight: 400 }}>⚠ confirm</span>
                    )}
                  </div>
                  {action.description && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {action.description}
                    </div>
                  )}
                </div>

                {result && (
                  <span className="material-symbols-outlined"
                    style={{ fontSize: 15, color: result === 'ok' ? '#22c55e' : '#ef4444', flexShrink: 0 }}>
                    {result === 'ok' ? 'check_circle' : 'error'}
                  </span>
                )}

                <div style={{ width: 26, height: 26, borderRadius: 5, background: color.active,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'white' }}>
                    play_arrow
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                padding: '0 10px 8px', borderTop: `1px dashed ${color.border}` }}>
                <code style={{ flex: 1, fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {action.command}
                </code>
                <button onClick={e => { e.stopPropagation(); setEditingAction(action); }}
                  title="Edit"
                  style={{ padding: '2px 4px', borderRadius: 3, border: 'none', background: 'transparent',
                    cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>edit</span>
                </button>
                <button onClick={e => { e.stopPropagation(); deleteAction(action.id); }}
                  title="Delete"
                  style={{ padding: '2px 4px', borderRadius: 3, border: 'none', background: 'transparent',
                    cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>delete</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

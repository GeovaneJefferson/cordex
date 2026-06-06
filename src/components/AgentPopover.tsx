import React, { useState, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useAgent, AGENT_CONFIGS, AgentType, AgentTodo } from '../hooks/useAgent';

const TODO_ICON: Record<string, string> = {
  pending: 'radio_button_unchecked',
  running: 'autorenew',
  done:    'check_circle',
  error:   'cancel',
};
const TODO_COLOR: Record<string, string> = {
  pending: 'var(--text-muted)',
  running: 'var(--accent)',
  done:    '#22c55e',
  error:   '#ef4444',
};

export const AgentPopover: React.FC = () => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef  = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos,  setPos]  = useState({ top: 0, left: 0 });

  const { toggleAgent, runAgentOnce, stopAll, todos, phase, error, report, agentType, enabledAgents } = useAgent();

  const isActive  = phase !== 'idle' || enabledAgents.size > 0;
  const isRunning = phase === 'planning' || phase === 'running';

  const openPanel = () => {
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 6, left: r.left + window.scrollX });
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = (type: AgentType) => {
    toggleAgent(type);
  };

  const panelWidth = 300;

  const panelContent = (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: pos.top,
        left: Math.max(8, pos.left - panelWidth + (buttonRef.current?.offsetWidth ?? 80)),
        width: panelWidth,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        borderRadius: 12,
        boxShadow: '0 10px 36px rgba(0,0,0,0.45)',
        zIndex: 9999,
        color: 'var(--text-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '10px 12px 8px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--accent)' }}>smart_toy</span>
        <span style={{ fontSize: 12, fontWeight: 700 }}>Background Agents</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)' }}>model set in AI Settings → Agents</span>
      </div>

      {/* Agent list */}
      <div style={{ padding: '6px 6px 0' }}>
        {(Object.entries(AGENT_CONFIGS) as [AgentType, typeof AGENT_CONFIGS[AgentType]][]).map(([type, cfg]) => {
          const isThisActive = enabledAgents.has(type) || (agentType === type && isActive);
          return (
            <button
              key={type}
              onClick={() => handleToggle(type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9,
                width: '100%', padding: '7px 8px', borderRadius: 7,
                background: isThisActive ? 'var(--bg-muted)' : 'transparent',
                border: `1px solid ${isThisActive ? 'var(--accent)' : 'transparent'}`,
                cursor: 'pointer',
                color: 'var(--text-primary)',
                textAlign: 'left',
                marginBottom: 2,
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { if (!isThisActive) e.currentTarget.style.background = 'var(--bg-muted)'; }}
              onMouseLeave={e => { if (!isThisActive) e.currentTarget.style.background = 'transparent'; }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 17, color: isThisActive ? 'var(--accent)' : 'var(--text-muted)', flexShrink: 0 }}>
                {cfg.icon}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, margin: 0 }}>{cfg.label}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cfg.description}
                </p>
              </div>
              {isThisActive && (
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#22c55e' }}>radio_button_checked</span>
              )}
              {!isThisActive && (
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-muted)' }}>radio_button_unchecked</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress / result panel */}
      {isActive && (
        <div style={{
          margin: '6px 6px 6px',
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '5px 10px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            color: 'var(--text-muted)', letterSpacing: '0.05em',
          }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 12, color: 'var(--accent)', animation: isRunning ? 'agentSpin 1.2s linear infinite' : 'none' }}
            >
              {phase === 'done' ? 'check_circle' : phase === 'error' ? 'error' : 'autorenew'}
            </span>
            {phase === 'planning' ? 'Planning…' : phase === 'running' ? 'Running' : phase === 'done' ? 'Done' : 'Error'}
          </div>

          {todos.length > 0 && (
            <div style={{ maxHeight: 160, overflowY: 'auto', padding: '4px 0' }}>
              {todos.map((todo: AgentTodo) => (
                <div key={todo.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, padding: '4px 10px' }}>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 13, flexShrink: 0, marginTop: 1,
                      color: TODO_COLOR[todo.status],
                      animation: todo.status === 'running' ? 'agentSpin 1.2s linear infinite' : 'none',
                    }}
                  >
                    {TODO_ICON[todo.status]}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 500, margin: 0, color: 'var(--text-primary)' }}>{todo.label}</p>
                    <p style={{ fontSize: 10, margin: 0, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {todo.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div style={{ padding: '6px 10px', color: '#ef4444', fontSize: 11, borderTop: '1px solid var(--border-subtle)' }}>
              {error.slice(0, 200)}
            </div>
          )}

          {report && (
            <div style={{
              borderTop: '1px solid var(--border-subtle)',
              padding: '6px 10px',
              maxHeight: 140, overflowY: 'auto',
              fontSize: 11, color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5,
            }}>
              {report}
            </div>
          )}
        </div>
      )}

      <div style={{ height: 6 }} />
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={openPanel}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 9999,
          fontSize: 11.5, fontWeight: 600,
          border: `1px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
          backgroundColor: isActive ? 'var(--bg-muted)' : 'transparent',
          color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
          cursor: 'pointer', userSelect: 'none', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.backgroundColor = 'var(--bg-subtle)'; e.currentTarget.style.borderColor = 'var(--border-default)'; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; } }}
        title="Background agents"
      >
        <span className={`material-symbols-outlined text-[14px]${isRunning ? ' animate-spin' : ''}`}>
          {isRunning ? 'autorenew' : 'smart_toy'}
        </span>
        Agent
      </button>

      {open && ReactDOM.createPortal(panelContent, document.body)}

      <style>{`@keyframes agentSpin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
};

import React, { useState, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useAgent, AgentTodo, AgentPhase } from '../hooks/useAgent';

const STATUS_ICON: Record<string, string> = {
  pending: 'radio_button_unchecked',
  running: 'autorenew',
  done:    'check_circle',
  error:   'error',
};
const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--text-secondary)',
  running: 'var(--text-primary)',
  done:    '#22c55e',   // keep green
  error:   '#ef4444',
};

export const AgentPopover: React.FC = () => {
  const [isOpen, setIsOpen]   = useState(false);
  const [goal,   setGoal]     = useState('');
  const [pos,    setPos]      = useState({ top: 0, left: 0 });
  const buttonRef             = useRef<HTMLButtonElement>(null);
  const { runAgent, stopAgent, todos, phase, error } = useAgent();

  const isRunning = phase === 'planning' || phase === 'running';

  const handleOpen = () => {
    if (buttonRef.current) {
      const r = buttonRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
    }
    setIsOpen(true);
  };

  const handleRun = () => {
    runAgent(goal);
    setGoal('');
  };

  const popover = isOpen ? ReactDOM.createPortal(
    <div style={{ position: 'absolute', top: pos.top, left: pos.left, width: 300,
      background: 'var(--bg-primary, white)',
      border: '1px solid var(--text-secondary)',
      borderRadius: 12,
      boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
      zIndex: 9999, padding: 12 }}>

      {/* Input */}
      <textarea
        value={goal}
        onChange={e => setGoal(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleRun())}
        placeholder="What should the agent do?"
        rows={2}
        disabled={isRunning}
        style={{
          color: 'var(--text-primary)',
          borderColor: 'var(--text-secondary)',
          background: 'var(--bg-primary)'
        }}
        className="w-full border rounded-lg p-2 text-sm resize-none focus:outline-none focus:border-orange-400 disabled:opacity-40"
      />

      {/* Todos */}
      {(phase !== 'idle' || todos.length > 0) && (
        <div className="mt-2 flex flex-col gap-1 max-h-56 overflow-y-auto">
          {phase === 'planning' && (
            <div style={{ color: 'var(--text-secondary)' }} className="flex items-center gap-1.5 text-[11px] px-1 py-0.5">
              <span className="material-symbols-outlined text-[13px] animate-spin">autorenew</span>
              Planning…
            </div>
          )}
          {todos.map((todo: AgentTodo) => (
            <div key={todo.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg border text-[11px] transition-colors ${
              todo.status === 'running' ? 'bg-blue-50 border-blue-200' :
              todo.status === 'done'    ? 'bg-green-50 border-green-200' :
              todo.status === 'error'   ? 'bg-red-50 border-red-200' :
              'bg-gray-50 border-gray-100'
            }`}>
              <span className={`material-symbols-outlined text-[13px] mt-0.5 shrink-0`}
                style={{ color: STATUS_COLOR[todo.status] }}>
                {STATUS_ICON[todo.status]}
              </span>
              <div className="min-w-0">
                <p style={{ color: 'var(--text-primary)' }} className="font-medium truncate">{todo.label}</p>
                {todo.description && <p style={{ color: 'var(--text-secondary)' }} className="truncate">{todo.description}</p>}
              </div>
            </div>
          ))}
          {phase === 'done' && (
            <div style={{ color: 'var(--text-primary)' }} className="flex items-center gap-1.5 text-[11px] font-medium px-1 py-0.5">
              <span className="material-symbols-outlined text-[13px]" style={{ color: '#22c55e' }}>check_circle</span>
              Done
            </div>
          )}
          {phase === 'error' && (
            <p className="text-[11px] bg-red-50 rounded px-2 py-1" style={{ color: '#ef4444' }}>{error}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 mt-3">
        <button onClick={() => setIsOpen(false)}
          style={{ color: 'var(--text-secondary)' }}
          className="px-3 py-1 text-xs rounded hover:bg-gray-100">
          Close
        </button>
        {isRunning
          ? <button onClick={stopAgent}
              className="px-3 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">
              Stop
            </button>
          : <button onClick={handleRun} disabled={!goal.trim()}
              className="px-3 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
              Run
            </button>
        }
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button ref={buttonRef} onClick={handleOpen}
        className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11.5px] font-medium transition-all select-none active:scale-95 border ${
          isRunning
            ? 'bg-orange-100 text-orange-700 border-orange-300'
            : 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100'
        }`}>
        <span className={`material-symbols-outlined text-[14px] ${isRunning ? 'animate-spin' : ''}`}>
          {isRunning ? 'autorenew' : 'smart_toy'}
        </span>
        Agent
      </button>
      {popover}
    </>
  );
};
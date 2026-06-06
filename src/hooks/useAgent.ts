import { useCallback, useRef, useState, useEffect } from 'react';
import { useAppState } from '../store/AppContext';

const Cordex = (window as any).Cordex;

export type AgentPhase = 'idle' | 'planning' | 'running' | 'done' | 'error';
export type AgentType  = 'fix-code' | 'document';

export interface AgentTodo {
  id: string; label: string; description: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export const AGENT_CONFIGS: Record<AgentType, { label: string; description: string; icon: string }> = {
  'document': {
    label: 'Document',
    description: 'Runs in background — adds docstrings & inline comments on every save',
    icon: 'description',
  },
  'fix-code': {
    label: 'Fix Code',
    description: 'Runs in background — reads PROBLEMS, tests fix, then applies on every save',
    icon: 'build',
  },
};

type AgentState = {
  todos:     AgentTodo[];
  phase:     AgentPhase;
  error:     string;
  report:    string;
  agentType: AgentType | null;
  // which agents are toggled ON for background mode
  enabled:   Set<AgentType>;
};

let _state: AgentState = {
  todos: [], phase: 'idle', error: '', report: '',
  agentType: null, enabled: new Set(),
};
let _cleanupFn: (() => void) | null = null;
const _listeners = new Set<() => void>();

function notify() { _listeners.forEach(fn => fn()); }
function setState(patch: Partial<Omit<AgentState, 'enabled'>>) {
  _state = { ..._state, ...patch };
  notify();
}

// ── Called from CodeEditor on every file save ─────────────────────────────────
export function notifyFileSaved(filePath: string, projectRoot: string | null) {
  if (_state.enabled.size === 0) return;
  Cordex?.ai?.agentFileSaved?.({ filePath, projectRoot });
}

export function useAgent() {
  const { state } = useAppState();
  const [, tick] = useState(0);

  useEffect(() => {
    const fn = () => tick(n => n + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);

  const tabRef      = useRef(state.tabs.find(t => t.id === state.activeTabId));
  const rootRef     = useRef(state.projectRoot);
  const settingsRef = useRef(state.aiSettings);

  useEffect(() => {
    tabRef.current      = state.tabs.find(t => t.id === state.activeTabId);
    rootRef.current     = state.projectRoot;
    settingsRef.current = state.aiSettings;
  }, [state.activeTabId, state.tabs, state.projectRoot, state.aiSettings]);

  // ── Toggle background mode ─────────────────────────────────────────────────
  const toggleAgent = useCallback((type: AgentType) => {
    const isOn = _state.enabled.has(type);
    const next = new Set(_state.enabled);

    if (isOn) {
      next.delete(type);
      // tell main process to stop background loop
      Cordex?.ai?.agentToggle?.({
        type, enabled: false,
        projectRoot: rootRef.current,
        filePath: tabRef.current?.path ?? null,
      });
      // if this agent was the active display, reset
      if (_state.agentType === type) setState({ phase: 'idle', todos: [], error: '', report: '', agentType: null });
    } else {
      next.add(type);
      const agentModels = settingsRef.current?.agentModels ?? { document: '', fixCode: '' };
      const model = type === 'document'
        ? (agentModels.document || settingsRef.current?.analyze || '')
        : (agentModels.fixCode  || settingsRef.current?.analyze || '');

      setState({ phase: 'planning', agentType: type, todos: [], error: '', report: '' });

      // tell main process to start background loop (runs immediately + on timer)
      Cordex?.ai?.agentToggle?.({
        type, enabled: true,
        projectRoot: rootRef.current,
        filePath: tabRef.current?.path ?? null,
        model,
        diagnostics: type === 'fix-code' ? ((window as any).__cordexGetMarkers?.() ?? []) : undefined,
      });

      // Also subscribe to step events so we can show progress
      _cleanupFn?.();
      const cleanup = Cordex?.ai?.agentRun?.(
        // We pass a dummy payload — main process ignores it since the loop is already running.
        // The event subscription is what matters here.
        {
          agentType: type,
          code: tabRef.current?.content ?? '',
          filePath: tabRef.current?.path ?? null,
          projectRoot: rootRef.current,
          model,
          diagnostics: type === 'fix-code' ? ((window as any).__cordexGetMarkers?.() ?? []) : undefined,
          _subscribe_only: true,
        },
        {
          onPlan:      (t: AgentTodo[]) => setState({ todos: t, phase: 'running' }),
          onStepStart: (id: string)     => setState({ todos: _state.todos.map(t => t.id === id ? { ...t, status: 'running' } : t) }),
          onStepDone:  (id: string)     => setState({ todos: _state.todos.map(t => t.id === id ? { ...t, status: 'done'    } : t) }),
          onStepError: (id: string)     => setState({ todos: _state.todos.map(t => t.id === id ? { ...t, status: 'error'   } : t) }),
          onReport:    (r: string)      => setState({ report: r }),
          onDone:      ()               => { setState({ phase: 'done' }); },
          onError:     (e: string)      => { setState({ error: e, phase: 'error' }); },
          onFileChanged: (fp: string)   => {
            window.dispatchEvent(new CustomEvent('cordex:file-changed-on-disk', { detail: fp }));
          },
        }
      );
      _cleanupFn = cleanup ?? null;
    }

    _state = { ..._state, enabled: next };
    notify();
  }, []);

  // ── One-shot manual run (used from popover run button) ────────────────────
  const runAgentOnce = useCallback((type: AgentType) => {
    const agentModels = settingsRef.current?.agentModels ?? { document: '', fixCode: '' };
    const model = type === 'document'
      ? (agentModels.document || settingsRef.current?.analyze || '')
      : (agentModels.fixCode  || settingsRef.current?.analyze || '');

    setState({ todos: [], error: '', report: '', phase: 'planning', agentType: type });
    _cleanupFn?.();

    const cleanup = Cordex?.ai?.agentRun?.(
      {
        agentType: type,
        code: tabRef.current?.content ?? '',
        filePath: tabRef.current?.path ?? null,
        projectRoot: rootRef.current,
        model,
        diagnostics: type === 'fix-code' ? ((window as any).__cordexGetMarkers?.() ?? []) : undefined,
      },
      {
        onPlan:      (t: AgentTodo[]) => setState({ todos: t, phase: 'running' }),
        onStepStart: (id: string)     => setState({ todos: _state.todos.map(t => t.id === id ? { ...t, status: 'running' } : t) }),
        onStepDone:  (id: string)     => setState({ todos: _state.todos.map(t => t.id === id ? { ...t, status: 'done'    } : t) }),
        onStepError: (id: string)     => setState({ todos: _state.todos.map(t => t.id === id ? { ...t, status: 'error'   } : t) }),
        onReport:    (r: string)      => setState({ report: r }),
        onDone:      ()               => { setState({ phase: 'done' }); _cleanupFn = null; },
        onError:     (e: string)      => { setState({ error: e, phase: 'error' }); _cleanupFn = null; },
        onFileChanged: (fp: string)   => {
          window.dispatchEvent(new CustomEvent('cordex:file-changed-on-disk', { detail: fp }));
        },
      }
    );
    _cleanupFn = cleanup ?? null;
  }, []);

  const stopAll = useCallback(() => {
    _cleanupFn?.();
    _cleanupFn = null;
    // Disable all background agents
    for (const type of _state.enabled) {
      Cordex?.ai?.agentToggle?.({ type, enabled: false });
    }
    _state = { ..._state, todos: [], phase: 'idle', error: '', report: '', agentType: null, enabled: new Set() };
    notify();
  }, []);

  // Listen for commands from CommandPalette
  useEffect(() => {
    const onRun    = (e: Event) => runAgentOnce((e as CustomEvent).detail as AgentType);
    const onToggle = (e: Event) => toggleAgent((e as CustomEvent).detail as AgentType);
    window.addEventListener('cordex:agent-run',    onRun);
    window.addEventListener('cordex:agent-toggle', onToggle);
    return () => {
      window.removeEventListener('cordex:agent-run',    onRun);
      window.removeEventListener('cordex:agent-toggle', onToggle);
    };
  }, [runAgentOnce, toggleAgent]);

  return {
    toggleAgent,
    runAgentOnce,
    stopAll,
    todos:          _state.todos,
    phase:          _state.phase,
    error:          _state.error,
    report:         _state.report,
    agentType:      _state.agentType,
    enabledAgents:  _state.enabled,
  };
}
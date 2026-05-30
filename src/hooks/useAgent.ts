// import { useCallback, useRef } from 'react';
// import { useAppState } from '../store/AppContext';

// const Cordex = (window as any).Cordex;

// export function useAgent() {
//   const { state, dispatch } = useAppState();
//   const cleanupRef = useRef<(() => void) | null>(null);

//   const stopAgent = useCallback(() => {
//     cleanupRef.current?.();
//     cleanupRef.current = null;
//     dispatch({ type: 'SET_BUG_FIX_LOADING', loading: false });
//   }, [dispatch]);

//   const runAgent = useCallback(async (goal: string) => {
//     if (!goal.trim()) return;

//     const activeTab = state.tabs.find(t => t.id === state.activeTabId);

//     // Open BugFixModal in planning phase
//     dispatch({ type: 'OPEN_BUG_FIX_MODAL' });

//     const cleanup = Cordex?.ai?.agentRun(
//       {
//         goal,
//         code:        activeTab?.content   ?? '',
//         filePath:    activeTab?.path      ?? null,
//         projectRoot: state.projectRoot    ?? null,
//       },
//       {
//         onPlan: (todos: any[]) => {
//           dispatch({ type: 'SET_BUG_FIX_TODOS', todos });
//         },
//         onStepStart: (id: string) => {
//           dispatch({ type: 'SET_TODO_STATUS', id, status: 'running' });
//         },
//         onStepDone: (_id: string, _result: any) => {
//           dispatch({ type: 'SET_TODO_STATUS', id: _id, status: 'done' });
//         },
//         onStepError: (id: string) => {
//           dispatch({ type: 'SET_TODO_STATUS', id, status: 'error' });
//         },
//         onDone: () => {
//           // dispatch({ type: 'SET_BUG_FIX_PHASE', phase: 'done' });
//           // cleanupRef.current = null;
//         },
//         onError: (err: string) => {
//           dispatch({ type: 'SET_BUG_FIX_ERROR', error: err });
//           cleanupRef.current = null;
//         },
//       }
//     );

//     cleanupRef.current = cleanup ?? null;
//   }, [state, dispatch]);

//   return { runAgent, stopAgent };
// }

import { useCallback, useRef, useState } from 'react';
import { useAppState } from '../store/AppContext';

const Cordex = (window as any).Cordex;

export type AgentPhase = 'idle' | 'planning' | 'running' | 'done' | 'error';

export interface AgentTodo {
  id: string; label: string; description: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export function useAgent() {
  const { state } = useAppState();
  const cleanupRef = useRef<(() => void) | null>(null);
  const [todos,  setTodos]  = useState<AgentTodo[]>([]);
  const [phase,  setPhase]  = useState<AgentPhase>('idle');
  const [error,  setError]  = useState('');

  const stopAgent = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setPhase('idle');
  }, []);

  const runAgent = useCallback((goal: string) => {
    if (!goal.trim()) return;
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);

    setTodos([]);
    setError('');
    setPhase('planning');

    const cleanup = Cordex?.ai?.agentRun(
      { goal, code: activeTab?.content ?? '', filePath: activeTab?.path ?? null, projectRoot: state.projectRoot ?? null },
      {
        onPlan:      (t: AgentTodo[]) => { setTodos(t); setPhase('running'); },
        onStepStart: (id: string)     => setTodos(p => p.map(t => t.id === id ? { ...t, status: 'running' } : t)),
        onStepDone:  (id: string)     => setTodos(p => p.map(t => t.id === id ? { ...t, status: 'done'    } : t)),
        onStepError: (id: string)     => setTodos(p => p.map(t => t.id === id ? { ...t, status: 'error'   } : t)),
        onDone:  () => { setPhase('done');          cleanupRef.current = null; },
        onError: (e: string) => { setError(e); setPhase('error'); cleanupRef.current = null; },
      }
    );
    cleanupRef.current = cleanup ?? null;
  }, [state]);

  return { runAgent, stopAgent, todos, phase, error };
}
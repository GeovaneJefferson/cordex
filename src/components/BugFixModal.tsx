import React, { useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAppState } from '../store/AppContext';
import { aiService } from '../services/aiService';
import { TodoItem } from '../types';

export const BugFixModal: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { open, phase, todos, explanation, fixedCode, loading, isSelection, error } = state.bugFixModal;

  // ✅ All hooks must be before any conditional return
  const handleExecute = useCallback(async () => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;

    dispatch({ type: 'SET_BUG_FIX_PHASE', phase: 'executing' });

    // Animate todos one by one as "running" while the single model call runs
    const animateTodos = async () => {
      for (const todo of todos) {
        dispatch({ type: 'SET_TODO_STATUS', id: todo.id, status: 'running' });
        await new Promise(r => setTimeout(r, 600));
      }
    };

    const { selectionText, selectionRange } = state.bugFixModal as any;
    const codeToFix = isSelection && selectionText ? selectionText : activeTab.content;
    const modeStr = (state.bugFixModal as any).mode ?? 'bugfix';

    const [, result] = await Promise.all([
      animateTodos(),
      isSelection
        ? aiService.bugFixCode({ code: codeToFix, filePath: activeTab.path, isSelection: true })
        : modeStr === 'improve'
          ? aiService.improveCode({ code: codeToFix, filePath: activeTab.path })
          : aiService.bugFixCode({ code: codeToFix, filePath: activeTab.path }),
    ]);

    if (result?.ok) {
      // Mark all todos done
      for (const todo of todos) {
        dispatch({ type: 'SET_TODO_STATUS', id: todo.id, status: 'done' });
      }
      dispatch({ type: 'SET_BUG_FIX_RESULT', explanation: result.explanation ?? '', fixedCode: result.fixedCode ?? '' });
    } else {
      for (const todo of todos) {
        dispatch({ type: 'SET_TODO_STATUS', id: todo.id, status: 'error' });
      }
      dispatch({ type: 'SET_BUG_FIX_ERROR', error: result?.error ?? 'Execution failed.' });
    }
  }, [state, todos, isSelection, dispatch]);

  // Early return after all hooks
  if (!open) return null;

  const handleClose = () => dispatch({ type: 'CLOSE_BUG_FIX_MODAL' });

  const replaceRange = (content: string, range: any, replacement: string) => {
    const lines = content.split('\n');
    const before = lines.slice(0, range.startLineNumber - 1);
    const after = lines.slice(range.endLineNumber);
    const startLine = lines[range.startLineNumber - 1] ?? '';
    const endLine = lines[range.endLineNumber - 1] ?? '';
    const prefix = startLine.slice(0, range.startColumn - 1);
    const suffix = endLine.slice(range.endColumn - 1);
    return [...before, prefix + replacement + suffix, ...after].join('\n');
  };

  const handleApplyFix = () => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab || !fixedCode) return;
    const { isSelection, selectionRange } = state.bugFixModal as any;
    if (isSelection && selectionRange) {
      dispatch({ type: 'UPDATE_TAB_CONTENT', id: activeTab.id, content: replaceRange(activeTab.content, selectionRange, fixedCode) });
    } else {
      dispatch({ type: 'UPDATE_TAB_CONTENT', id: activeTab.id, content: fixedCode });
    }
    handleClose();
  };

  const statusIcon: Record<string, string> = {
    pending: 'radio_button_unchecked',
    running: 'autorenew',
    done:    'check_circle',
    error:   'error',
  };
  const statusColor: Record<string, string> = {
    pending: 'text-gray-400',
    running: 'text-blue-500 animate-spin',
    done:    'text-green-500',
    error:   'text-red-500',
  };

  const phaseTitle: Record<string, string> = {
    planning:  'Planning…',
    review:    'Review Action Plan',
    executing: 'Executing Plan…',
    done:      'AI Code Assistant',
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center space-x-3 flex-1">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white">
                {phase === 'done' ? 'code_blocks' : phase === 'executing' ? 'play_circle' : 'checklist'}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">{phaseTitle[phase] ?? 'AI Code Assistant'}</h2>
              <p className="text-xs text-gray-500">
                {phase === 'planning'  && 'Identifying issues…'}
                {phase === 'review'    && `${todos.length} action${todos.length !== 1 ? 's' : ''} found — confirm before executing`}
                {phase === 'executing' && 'Applying fixes…'}
                {phase === 'done'      && 'Analysis · Bug fixes · Improvements'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {phase === 'done' && fixedCode && (
              <button
                onClick={handleApplyFix}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Apply Fix
              </button>
            )}
            <button onClick={handleClose} className="p-1 hover:bg-gray-200 rounded-full">
              <span className="material-symbols-outlined text-gray-500">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        {error ? (
          <div className="flex-1 flex items-center justify-center bg-red-50 p-8">
            <div className="text-center max-w-md">
              <span className="material-symbols-outlined text-4xl text-red-400 block mb-3">error</span>
              <p className="text-sm font-semibold text-red-700 mb-2">Failed</p>
              <p className="text-xs text-red-500 bg-red-100 rounded-lg px-4 py-3 font-mono text-left break-words">{error}</p>
              <button onClick={handleClose} className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold">Close</button>
            </div>
          </div>
        ) : phase === 'planning' ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400">
              <span className="material-symbols-outlined text-4xl animate-spin block mb-3">autorenew</span>
              <p className="text-sm font-medium">Building action plan…</p>
              <p className="text-xs text-gray-400 mt-1">Scanning code for issues</p>
            </div>
          </div>
        ) : (phase === 'review' || phase === 'executing') ? (
          <div className="flex-1 overflow-auto p-6 bg-gray-50 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {todos.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <span className="material-symbols-outlined text-3xl block mb-2">check_circle</span>
                  <p className="text-sm">No issues found — code looks good!</p>
                </div>
              ) : todos.map((todo: TodoItem) => (
                <div
                  key={todo.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                    todo.status === 'running' ? 'bg-blue-50 border-blue-200' :
                    todo.status === 'done'    ? 'bg-green-50 border-green-200' :
                    todo.status === 'error'   ? 'bg-red-50 border-red-200' :
                    'bg-white border-gray-200'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[18px] mt-0.5 shrink-0 ${statusColor[todo.status]}`}>
                    {statusIcon[todo.status]}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{todo.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{todo.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {phase === 'review' && todos.length > 0 && (
              <button
                onClick={handleExecute}
                className="mt-2 flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow transition-colors"
              >
                <span className="material-symbols-outlined">play_circle</span>
                Execute {todos.length} Action{todos.length !== 1 ? 's' : ''}
              </button>
            )}

            {phase === 'executing' && (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-blue-600 font-medium">
                <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                AI is applying fixes…
              </div>
            )}
          </div>
        ) : (
          /* phase === 'done' */
          <div className="flex-1 overflow-auto p-6 grid grid-cols-2 gap-6 bg-gray-50">
            <div className="flex flex-col border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-blue-50 px-4 py-2 border-b border-blue-200 flex items-center">
                <span className="material-symbols-outlined text-blue-500 text-sm mr-2">psychology</span>
                <span className="text-xs font-bold text-blue-700 uppercase">Analysis &amp; Explanation</span>
              </div>
              <div className="p-4 text-sm leading-relaxed bg-white flex-1 overflow-auto">
                {explanation ? (
                  <ReactMarkdown
                    components={{
                      p({ children }) { return <p style={{ marginBottom: '0.6em', marginTop: 0 }}>{children}</p>; },
                      ul({ children }) { return <ul style={{ paddingLeft: '1.2em', marginBottom: '0.6em' }}>{children}</ul>; },
                      ol({ children }) { return <ol style={{ paddingLeft: '1.2em', marginBottom: '0.6em' }}>{children}</ol>; },
                      code({ children }) { return <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3, fontSize: '0.85em', fontFamily: 'monospace' }}>{children}</code>; },
                    }}
                  >
                    {explanation}
                  </ReactMarkdown>
                ) : (
                  <span className="text-gray-400 italic">No explanation provided.</span>
                )}
              </div>
            </div>

            <div className="flex flex-col border border-green-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-4 py-2 border-b border-green-200 flex items-center justify-between">
                <div className="flex items-center">
                  <span className="material-symbols-outlined text-green-600 text-sm mr-2">check_circle</span>
                  <span className="text-xs font-bold text-green-700 uppercase">Fixed / Improved Code</span>
                </div>
                {fixedCode && (
                  <button
                    onClick={handleApplyFix}
                    className="text-xs px-2 py-0.5 bg-green-600 hover:bg-green-700 text-white rounded font-semibold transition-colors"
                  >
                    Apply
                  </button>
                )}
              </div>
              <pre className="p-4 font-mono text-sm leading-6 bg-green-50/30 flex-1 whitespace-pre-wrap overflow-auto text-gray-800">
                {fixedCode || 'No fix generated.'}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
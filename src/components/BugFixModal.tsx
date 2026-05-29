import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useAppState } from '../store/AppContext';

export const BugFixModal: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { open, explanation, fixedCode, loading, isSelection, selectionText } = state.bugFixModal;

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
    const replaced = [
      ...before,
      prefix + replacement + suffix,
      ...after,
    ].join('\n');
    return replaced;
  };

  const handleApplyFix = () => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab || !fixedCode) return;

    const { isSelection, selectionRange } = state.bugFixModal as any;
    if (isSelection && selectionRange) {
      const updatedContent = replaceRange(activeTab.content, selectionRange, fixedCode);
      dispatch({ type: 'UPDATE_TAB_CONTENT', id: activeTab.id, content: updatedContent });
    } else {
      dispatch({ type: 'UPDATE_TAB_CONTENT', id: activeTab.id, content: fixedCode });
    }

    handleClose();
  };

  const hasFixedCode = fixedCode && fixedCode !== (state.tabs.find(t => t.id === state.activeTabId)?.content ?? '');

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center space-x-3 flex-1">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white">code_blocks</span>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-gray-900">AI Code Assistant</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-gray-500">Analysis · Bug fixes · Improvements</p>
                {isSelection && (
                  <div className="flex items-center gap-1.5 ml-auto bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium border border-green-200">
                    <span className="material-symbols-outlined text-green-600 text-[12px]">check_circle</span>
                    Selection active
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fixedCode && !loading && (
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
        {loading ? (
          <div className="flex-1 flex items-center justify-center bg-gray-50">
            <div className="text-center text-gray-400">
              <span className="material-symbols-outlined text-4xl animate-spin block mb-3">autorenew</span>
              <p className="text-sm font-medium">Analyzing code…</p>
            </div>
          </div>
        ) : state.bugFixModal.error ? (
          <div className="flex-1 flex items-center justify-center bg-red-50 p-8">
            <div className="text-center max-w-md">
              <span className="material-symbols-outlined text-4xl text-red-400 block mb-3">error</span>
              <p className="text-sm font-semibold text-red-700 mb-2">Analysis failed</p>
              <p className="text-xs text-red-500 bg-red-100 rounded-lg px-4 py-3 font-mono text-left break-words">
                {state.bugFixModal.error}
              </p>
              <button
                onClick={() => dispatch({ type: 'CLOSE_BUG_FIX_MODAL' })}
                className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto p-6 grid grid-cols-2 gap-6 bg-gray-50">
            {/* Explanation panel */}
            <div className="flex flex-col border border-blue-200 rounded-lg overflow-hidden">
              <div className="bg-blue-50 px-4 py-2 border-b border-blue-200 flex items-center">
                <span className="material-symbols-outlined text-blue-500 text-sm mr-2">psychology</span>
                <span className="text-xs font-bold text-blue-700 uppercase">Analysis &amp; Explanation</span>
              </div>
              <div className="p-4 text-sm leading-relaxed bg-white flex-1 overflow-auto">
                {explanation ? (
                  <ReactMarkdown
                    components={{
                      p({ children }) {
                        return <p style={{ marginBottom: '0.6em', marginTop: 0 }}>{children}</p>;
                      },
                      ul({ children }) {
                        return <ul style={{ paddingLeft: '1.2em', marginBottom: '0.6em' }}>{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol style={{ paddingLeft: '1.2em', marginBottom: '0.6em' }}>{children}</ol>;
                      },
                      code({ children, className }) {
                        return (
                          <code style={{ background: '#f1f5f9', padding: '1px 4px', borderRadius: 3, fontSize: '0.85em', fontFamily: 'monospace' }}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {explanation}
                  </ReactMarkdown>
                ) : (
                  <span className="text-gray-400 italic">No explanation provided.</span>
                )}
              </div>
            </div>

            {/* Fixed code panel */}
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
                    title="Apply this code to the active file"
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

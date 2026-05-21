import React from 'react';
import { useAppState } from '../store/AppContext';

export const BugFixModal: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { open, explanation, fixedCode } = state.bugFixModal;

  if (!open) return null;

  const handleClose = () => dispatch({ type: 'CLOSE_BUG_FIX_MODAL' });

  return (
    <div
    className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-6"
    onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
    <div className="bg-white w-full max-w-6xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col border border-gray-200 overflow-hidden">
    <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
    <div className="flex items-center space-x-3">
    <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
    <span className="material-symbols-outlined text-white">code_blocks</span>
    </div>
    <div>
    <h2 className="text-lg font-bold text-gray-900">AI Debugging Assistant</h2>
    <p className="text-xs text-gray-500">Your AI pair programmer for faster debugging</p>
    </div>
    </div>
    <button onClick={handleClose} className="p-1 hover:bg-gray-200 rounded-full">
    <span className="material-symbols-outlined text-gray-500">close</span>
    </button>
    </div>
    <div className="flex-1 overflow-auto p-6 grid grid-cols-2 gap-6 bg-gray-50">
    <div className="flex flex-col border border-red-200 rounded-lg overflow-hidden">
    <div className="bg-red-50 px-4 py-2 border-b border-red-200 flex items-center">
    <span className="material-symbols-outlined text-red-500 text-sm mr-2">bug_report</span>
    <span className="text-xs font-bold text-red-600 uppercase">Bug Explanation</span>
    </div>
    <div className="p-4 font-mono text-sm leading-6 bg-red-50/30 flex-1">
    {explanation || 'No explanation provided.'}
    </div>
    </div>
    <div className="flex flex-col border border-green-200 rounded-lg overflow-hidden">
    <div className="bg-green-50 px-4 py-2 border-b border-green-200 flex items-center">
    <span className="material-symbols-outlined text-green-600 text-sm mr-2">check_circle</span>
    <span className="text-xs font-bold text-green-700 uppercase">Fixed Code</span>
    </div>
    <pre className="p-4 font-mono text-sm leading-6 bg-green-50/30 flex-1 whitespace-pre-wrap">
    {fixedCode || 'No fix generated.'}
    </pre>
    </div>
    </div>
    </div>
    </div>
  );
};

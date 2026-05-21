import React, { useState } from 'react';

export const AgentPopover: React.FC = () => {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <button
        onClick={() => setVisible(!visible)}
        className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-800 text-white rounded-full px-4 py-2 text-sm font-medium shadow-lg z-50 hover:bg-slate-700"
      >
        <span className="material-symbols-outlined text-[16px] mr-2 align-middle">smart_toy</span>
        Agent
      </button>

      {visible && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-[340px] bg-slate-800 text-white rounded-2xl shadow-2xl overflow-hidden z-50 border border-slate-700">
          <div className="p-3 bg-slate-900/50 flex space-x-1">
            <button className="flex-1 py-1.5 px-3 text-xs font-semibold rounded-md bg-slate-700/50 text-slate-400">
              Single Actions
            </button>
            <button className="flex-1 py-1.5 px-3 text-xs font-semibold rounded-md bg-slate-700 text-white shadow-sm">
              Agent Workspace
            </button>
          </div>

          <div className="p-5 flex flex-col space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Goal Input</span>
                <span className="material-symbols-outlined text-slate-400 text-[14px]">edit</span>
              </div>
              <div className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-700 text-xs text-slate-300 italic">
                "Auto-Fix Test Suite"
              </div>
            </div>

            <div className="flex justify-center py-4 relative">
              <div className="w-32 h-20 bg-white rounded-md shadow-lg relative z-10 flex items-center justify-center">
                <div className="w-full h-full p-2 space-y-1">
                  <div className="w-1/2 h-1 bg-gray-100 rounded"></div>
                  <div className="w-3/4 h-1 bg-gray-100 rounded"></div>
                  <div className="w-2/3 h-1 bg-gray-100 rounded"></div>
                </div>
              </div>
              <div className="absolute w-28 h-16 bg-slate-600/40 rounded-md -bottom-2 -right-4 -z-10"></div>
              <div className="absolute w-24 h-14 bg-slate-600/20 rounded-md -bottom-4 -right-8 -z-20"></div>
            </div>

            <div className="text-center space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <span className="material-symbols-outlined text-blue-400 animate-spin text-[16px]">sync</span>
                <span className="text-xs text-slate-300 font-medium">Running python script...</span>
              </div>
              <div className="text-[10px] text-slate-500">Iteration 2/3... Checking for syntax errors</div>
            </div>

            <button className="w-full py-4 bg-[#ffedc2] hover:bg-[#ffe5a1] text-[#4c1a00] font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center space-x-2">
              <span className="material-symbols-outlined">play_circle</span>
              <span>Execute Agent Loop</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
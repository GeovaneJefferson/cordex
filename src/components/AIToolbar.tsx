import React, { useState } from 'react';
import { useAI } from '../hooks/useAI';
import { useAppState } from '../store/AppContext';

interface AIButtonProps {
  icon: string;
  label: string;
  title: string;
  loading?: boolean;
  variant?: 'dark' | 'light';
  onClick?: () => void;
}

const AIButton: React.FC<AIButtonProps> = ({ icon, label, title, loading, variant = 'light', onClick }) => (
  <button
    title={title}
    onClick={onClick}
    disabled={loading}
    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all duration-200 ease-in-out shadow-sm disabled:opacity-50 disabled:cursor-not-allowed select-none ${
      variant === 'dark'
        ? 'bg-gray-900 text-white hover:bg-gray-700 active:scale-95'
        : 'bg-white text-gray-800 border border-gray-200 hover:bg-gray-50 hover:border-gray-300 active:scale-95'
    }`}
  >
    <span className={`material-symbols-outlined text-[15px] ${loading ? 'animate-spin' : ''}`}>
      {loading ? 'autorenew' : icon}
    </span>
    {label}
  </button>
);

export const AIToolbar: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { analyzeCode, bugFixActiveTab, generateDocstring } = useAI();
  const [docLoading, setDocLoading] = useState(false);
  const [improveLoading, setImproveLoading] = useState(false);
  const [bugLoading, setBugLoading] = useState(false);

  const activeTab = state.tabs.find(t => t.id === state.activeTabId);

  const handleDoc = async () => {
    if (!activeTab) return;
    setDocLoading(true);
    try {
      const result = await generateDocstring(activeTab.content);
      if (result?.ok) {
        dispatch({ type: 'OPEN_BUG_FIX_MODAL', explanation: result.text ?? '', fixedCode: activeTab.content });
      }
    } finally { setDocLoading(false); }
  };

  const handleImprove = async () => {
    if (!activeTab) return;
    setImproveLoading(true);
    try { await analyzeCode(activeTab.content); }
    finally { setImproveLoading(false); }
  };

  const handleBugFix = async () => {
    if (!activeTab) return;
    setBugLoading(true);
    try { await bugFixActiveTab(); }
    finally { setBugLoading(false); }
  };

  return (
    <div className="flex items-center justify-center bg-white border-b border-gray-100 py-2 px-4 gap-2 flex-shrink-0">
      <AIButton icon="description" label="Documentation" title="Generate documentation" variant="dark" loading={docLoading} onClick={handleDoc} />
      <AIButton icon="auto_awesome" label="Improve" title="Analyze & improve active file" loading={improveLoading} onClick={handleImprove} />
      <AIButton icon="medical_services" label="Bug Fix" title="AI bug fix for active file" loading={bugLoading} onClick={handleBugFix} />
      <div className="w-px h-5 bg-gray-100 mx-1" />
      <AIButton icon="account_tree" label="Flow" title="Visualize code as flow diagram" onClick={() => {}} />
    </div>
  );
};
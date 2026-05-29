import React, { useEffect, useState, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { AISettings } from '../types';
import { themes } from '../themes';
import { useTheme } from '../hooks/useTheme';

const Cordex = (window as any).Cordex;

// Wrapper — avoids early-return hooks violation
export const AISettingsModal: React.FC = () => {
  const { state } = useAppState();
  if (!state.aiSettingsOpen) return null;
  return <AISettingsInner />;
};

// Feature tiers
const LITE_FEATURES = ['autocomplete'] as (keyof AISettings)[];
const FULL_FEATURES = ['analyze', 'bugfix', 'docstring', 'flow'] as (keyof AISettings)[];

// ── Helpers ────────────────────────────────────────────────────────────
function formatSize(bytes: number): string {
  if (!bytes) return '';
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

interface ModelInfo { name: string; sizeLabel: string }

// ══════════════════════════════════════════════════════════════════════
const AISettingsInner: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { currentThemeId, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'ai' | 'theme'>('ai');
  const [refreshing, setRefreshing]   = useState(false);
  const [serverStatus, setServerStatus] = useState<'stopped'|'running'|'starting'>('stopped');
  const [starting, setStarting]     = useState(false);
  const [models, setModels]         = useState<ModelInfo[]>([]);
  const [liteModel, setLiteModel]   = useState('');
  const [fullModel, setFullModel]   = useState('');
  const [selectedTheme, setSelectedTheme] = useState(currentThemeId);

  const close = () => dispatch({ type: 'TOGGLE_AI_SETTINGS' });

  // ── Load: ping Ollama, then list models ──────────────────────────────
  const loadStatus = useCallback(async () => {
    // 1) Check if Ollama is up
    const ping = await Cordex?.ollama?.ping?.();
    const running = ping?.ok === true;
    setServerStatus(running ? 'running' : 'stopped');
    if (!running) { setModels([]); return; }

    // 2) Fetch installed models
    const listRes = await Cordex?.ollama?.list?.();
    const raw: any[] = listRes?.models ?? [];

    const mapped: ModelInfo[] = raw.map(m => ({
      name: m.name,
      // Prefer actual disk size in GB/MB; fall back to parameter count only if size is absent
      sizeLabel: formatSize(m.size) || (m.parameterSize ? m.parameterSize.toUpperCase() : ''),
    }));
    setModels(mapped);

    if (mapped.length > 0) {
      const names = mapped.map(m => m.name);
      // Heuristic: last entry is usually smallest, first is largest
      const smallest = names[names.length - 1];
      const largest  = names[0];
      setLiteModel(v => v || state.aiSettings.autocomplete || smallest);
      setFullModel(v  => v || state.aiSettings.analyze     || largest);
    }
    setSelectedTheme(currentThemeId);
  }, [state.aiSettings.autocomplete, state.aiSettings.analyze]);

  useEffect(() => { loadStatus(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedTheme(currentThemeId); }, [currentThemeId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try { await loadStatus(); }
    finally { setRefreshing(false); }
  }, [loadStatus]);

  // ── "Retry" just re-pings. Ollama is an external process we can't start. ──
  const retryConnect = async () => {
    setStarting(true);
    setServerStatus('starting');
    // Give it 1.5 s in case the user just ran `ollama serve`
    await new Promise(r => setTimeout(r, 1500));
    await loadStatus();
    setStarting(false);
  };

  // ── Apply: persist to app state + settings file ──────────────────────
  const applyAndClose = async () => {
    const settings: Partial<AISettings> = {};
    LITE_FEATURES.forEach(k => { if (liteModel) settings[k] = liteModel; });
    FULL_FEATURES.forEach(k => { if (fullModel) settings[k] = fullModel; });
    dispatch({ type: 'SET_AI_SETTINGS', settings });
    setTheme(selectedTheme);

    // Persist to disk so the models survive a restart
    try {
      const current = (await Cordex?.settings?.get?.()) ?? {};
      await Cordex?.settings?.set?.({
        ...current,
        autocompleteModel: liteModel || current.autocompleteModel,
        analysisModel:     fullModel  || current.analysisModel,
        theme:             selectedTheme || current.theme,
      });
    } catch {}

    close();
  };

  const ollamaRunning  = serverStatus === 'running';
  const ollamaStarting = serverStatus === 'starting';
  const hasModels      = models.length > 0;

  // ── Model select dropdown ────────────────────────────────────────────
  const ModelSelect: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => (
    <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className="w-full text-[11px] border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-orange-400 cursor-pointer transition-colors"
    >
    {!value && <option value="">— pick a model —</option>}
    <optgroup label="Installed models">
    {models.map(m => (
      <option key={m.name} value={m.name}>
      {m.name}{m.sizeLabel ? `  (${m.sizeLabel})` : ''}
      </option>
    ))}
    </optgroup>
    </select>
  );

  return (
    <div
    className="fixed inset-0 z-[70] bg-black/25 backdrop-blur-[2px] flex items-center justify-center p-4"
    style={{ animation: 'fadeIn 150ms ease' }}
    onClick={e => e.target === e.currentTarget && close()}
    >
    <div
    className="bg-white w-full max-w-[480px] rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col"
    style={{ animation: 'slideUp 180ms cubic-bezier(0.4,0,0.2,1)' }}
    >
    {/* ── Header ───────────────────────────────────────────────── */}
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
    <div className="flex items-center gap-3">
    <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
    <span className="material-symbols-outlined text-white text-[18px]">settings</span>
    </div>
    <div>
    <h2 className="text-[13px] font-semibold text-gray-900">Settings</h2>
    <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
    <span>{ollamaRunning ? 'Ollama running' : ollamaStarting ? 'Checking…' : 'Ollama offline'}</span>
    </div>
    </div>
    </div>
    <button onClick={close} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
    <span className="material-symbols-outlined text-[18px]">close</span>
    </button>
    </div>
    <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex gap-2">
      <button
        type="button"
        onClick={() => setActiveTab('ai')}
        className={`text-[11px] px-3 py-1.5 rounded-lg transition ${activeTab === 'ai' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-white/80'}`}
      >AI</button>
      <button
        type="button"
        onClick={() => setActiveTab('theme')}
        className={`text-[11px] px-3 py-1.5 rounded-lg transition ${activeTab === 'theme' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900 hover:bg-white/80'}`}
      >Themes</button>
    </div>

    {/* ── Status bar ───────────────────────────────────────────── */}
    <div className={`px-5 py-3 border-b flex items-center justify-between gap-3 ${
      ollamaRunning ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'
    }`}>
    <div>
    <div className={`text-[11px] font-semibold ${ollamaRunning ? 'text-emerald-800' : 'text-amber-800'}`}>
    {ollamaRunning ? '✓ Ollama running' : 'Ollama not detected'}
    </div>
    <div className="text-[10px] text-gray-500 mt-0.5 font-mono">
    {ollamaRunning ? 'http://127.0.0.1:11434' : 'Run: ollama serve'}
    </div>
    </div>
    {!ollamaRunning ? (
      <button
      onClick={retryConnect}
      disabled={starting}
      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
      <span className={`material-symbols-outlined text-[14px] ${starting ? 'animate-spin' : ''}`}>
      {starting ? 'autorenew' : 'refresh'}
      </span>
      {starting ? 'Checking…' : 'Retry'}
      </button>
    ) : (
      <div className="flex items-center gap-1.5 text-[10px] text-emerald-700 font-medium">
      <span className="material-symbols-outlined text-[13px]">check_circle</span>
      {models.length} model{models.length !== 1 ? 's' : ''} found
      </div>
    )}
    </div>

    {/* ── Model assignment ─────────────────────────────────────── */}
    <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">

    {activeTab === 'theme' ? (
      <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              Theme
            </span>
            <span className="text-[12px] font-semibold text-gray-800">Editor + UI</span>
            <span className="text-[11px] text-gray-400">— choose your app theme</span>
          </div>
          <p className="text-[10px] text-gray-400">
            Switch the Monaco editor theme and the app shell appearance from a single settings panel.
          </p>
          <select
            value={selectedTheme}
            onChange={e => setSelectedTheme(e.target.value)}
            className="w-full text-[11px] border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-orange-400 cursor-pointer transition-colors"
          >
            {themes.map(theme => (
              <option key={theme.id} value={theme.id}>{theme.name}</option>
            ))}
          </select>
        </div>
      </div>
    ) : (
      <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1">

      {/* No models hint */}
    {ollamaRunning && !hasModels && (
      <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-700 leading-relaxed">
      No Ollama models found. Pull one first:
      <code className="block mt-1 bg-blue-100 px-2 py-1 rounded font-mono">
      ollama pull qwen2.5-coder:7b
      </code>
      </div>
    )}

    {/* Ollama offline hint */}
    {!ollamaRunning && !ollamaStarting && (
      <div className="p-3 bg-amber-50 border border-amber-100 rounded-lg text-[11px] text-amber-800 leading-relaxed">
      Ollama is not running. Start it in a terminal:
      <code className="block mt-1 bg-amber-100 px-2 py-1 rounded font-mono">
      ollama serve
      </code>
      Then click <strong>Retry</strong> above.
      </div>
    )}

    {/* ── LITE model ─────────────────────────────────────────── */}
    <div className="space-y-2">
    <div className="flex items-center gap-2">
    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
    LITE
    </span>
    <span className="text-[12px] font-semibold text-gray-800">Fast model</span>
    <span className="text-[11px] text-gray-400">— for autocomplete</span>
    </div>
    <p className="text-[10px] text-gray-400">
    Small model for low-latency ghost completions as you type.
    Recommended: <code className="font-mono">qwen2.5-coder:1.5b-base</code>
    </p>
    {hasModels ? (
      <ModelSelect value={liteModel} onChange={setLiteModel} />
    ) : (
      <div className="text-[11px] text-gray-400 italic py-1">No models available</div>
    )}
    <div className="flex flex-wrap gap-1">
    {LITE_FEATURES.map(k => (
      <span key={k} className="text-[9px] px-1.5 py-0.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-full font-medium">
      {k}
      </span>
    ))}
    </div>
    </div>

    <div className="border-t border-gray-100" />

    {/* ── FULL model ─────────────────────────────────────────── */}
    <div className="space-y-2">
    <div className="flex items-center gap-2">
    <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
    FULL
    </span>
    <span className="text-[12px] font-semibold text-gray-800">Capable model</span>
    <span className="text-[11px] text-gray-400">— for analysis & fixes</span>
    </div>
    <p className="text-[10px] text-gray-400">
    Larger model for bug fixing, refactoring, explanations, and code generation.
    Recommended: <code className="font-mono">qwen2.5-coder:7b</code>
    </p>
    {hasModels ? (
      <ModelSelect value={fullModel} onChange={setFullModel} />
    ) : (
      <div className="text-[11px] text-gray-400 italic py-1">No models available</div>
    )}
    <div className="flex flex-wrap gap-1">
    {FULL_FEATURES.map(k => (
      <span key={k} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full font-medium">
      {k}
      </span>
    ))}
    </div>
    </div>

    {/* ── Installed models list ───────────────────────────────── */}
    {models.length > 0 && (
      <div className="border-t border-gray-100 pt-3">
      <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
      Installed models ({models.length})
      </div>
      <div className="space-y-0.5">
      {models.map(m => (
        <div key={m.name} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
        <span className="text-[11px] text-gray-700 font-mono truncate flex-1">{m.name}</span>
        <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{m.sizeLabel}</span>
        </div>
      ))}
      </div>
      </div>
    )}
    </div>
    )}

    {/* ── Footer ───────────────────────────────────────────────── */}
    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
    <div className="text-[10px] text-gray-400 truncate max-w-[55%]">
    {liteModel && fullModel
      ? `Lite: ${liteModel.split(':')[0]} · Full: ${fullModel.split(':')[0]}`
      : liteModel || fullModel
      ? `Selected: ${liteModel || fullModel}`
      : ''}
      </div>
      <div className="flex gap-2">
      <button
      onClick={close}
      className="px-3 py-1.5 text-gray-600 text-[12px] hover:bg-gray-100 rounded-lg transition-colors"
      >
      Cancel
      </button>
      <button
      onClick={applyAndClose}
      disabled={!hasModels}
      className="px-4 py-1.5 bg-orange-500 text-white text-[12px] font-semibold rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
      Apply
      </button>
      </div>
      </div>
      </div>
      </div>
      </div>
    );  };
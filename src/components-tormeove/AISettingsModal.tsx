import React, { useEffect, useState, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { AISettings } from '../store/reducer';

const Cordex = (window as any).Cordex;

// Wrapper — avoids early-return hooks violation
export const AISettingsModal: React.FC = () => {
  const { state } = useAppState();
  if (!state.aiSettingsOpen) return null;
  return <AISettingsInner />;
};

// Feature tiers — autocomplete needs LITE (fast), heavy tasks need FULL
const LITE_FEATURES  = ['autocomplete'] as (keyof AISettings)[];
const FULL_FEATURES  = ['analyze', 'bugfix', 'docstring', 'flow'] as (keyof AISettings)[];

const FEATURE_META: { key: keyof AISettings; label: string; icon: string; tier: 'lite'|'full' }[] = [
  { key: 'autocomplete', label: 'Autocomplete',    icon: 'auto_fix_high',    tier: 'lite' },
  { key: 'analyze',      label: 'Analyze/Improve', icon: 'auto_awesome',     tier: 'full' },
  { key: 'bugfix',       label: 'Bug Fix',          icon: 'medical_services', tier: 'full' },
  { key: 'docstring',    label: 'Documentation',    icon: 'description',      tier: 'full' },
  { key: 'flow',         label: 'Flow Diagram',     icon: 'account_tree',     tier: 'full' },
];

const AISettingsInner: React.FC = () => {
  const { state, dispatch } = useAppState();

  const [refreshing,    setRefreshing]    = useState(false);
  const [llamaPath,     setLlamaPath]     = useState('');
  const [serverStatus,  setServerStatus]  = useState<string>('stopped');
  const [starting,      setStarting]      = useState(false);
  const [models,        setModels]        = useState<{name:string;path:string;sizeBytes:number;sizeLabel:string}[]>([]);
  const [liteModel,     setLiteModel]     = useState('');
  const [fullModel,     setFullModel]     = useState('');

  const close = () => dispatch({ type: 'TOGGLE_AI_SETTINGS' });

  useEffect(() => {
    Cordex?.llama?.status?.().then((s: any) => {
      if (!s) return;
      setServerStatus(s.status ?? 'stopped');
      if (s.binary) setLlamaPath(s.binary);
      if (s.models?.length) {
        setModels(s.models);
        // Auto-assign: smallest for lite, largest for full (models sorted largest-first)
        const allModels: string[] = s.models.map((m: any) => m.name);
        const smallest = allModels[allModels.length - 1] ?? allModels[0];
        const largest  = allModels[0];
        // Only set defaults if current settings are empty/invalid
        const curAuto = state.aiSettings.autocomplete;
        const curFull = state.aiSettings.analyze;
        if (!curAuto || curAuto === '' || curAuto === 'local') setLiteModel(smallest);
        else setLiteModel(curAuto);
        if (!curFull || curFull === '' || curFull === 'local') setFullModel(largest);
        else setFullModel(curFull);
      }
    });
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const s = await Cordex?.llama?.status?.();
      if (s) {
        setServerStatus(s.status ?? 'stopped');
        if (s.models?.length) setModels(s.models);
      }
    } finally { setRefreshing(false); }
  }, []);

  useEffect(() => { refresh(); }, []);

  const startServer = async () => {
    setStarting(true); setServerStatus('starting');
    try {
      const r = await Cordex?.llama?.start?.({ ngl: 99 });
      setServerStatus(r?.ok ? 'running' : 'error');
      if (r?.ok) refresh();
    } catch { setServerStatus('error'); }
    finally { setStarting(false); }
  };

  const stopServer  = async () => { await Cordex?.llama?.stop?.(); setServerStatus('stopped'); };

  const applyAndClose = async () => {
    // Apply lite model to autocomplete, full model to everything else
    const settings: Partial<AISettings> = {};
    LITE_FEATURES.forEach(k => { if (liteModel) settings[k] = liteModel; });
    FULL_FEATURES.forEach(k => { if (fullModel) settings[k] = fullModel; });
    dispatch({ type: 'SET_AI_SETTINGS', settings });
    if (llamaPath) await Cordex?.llama?.saveConfig?.({ llamaServerPath: llamaPath, llamaModelPath: fullModel || undefined });
    close();
  };

  const llamaRunning  = serverStatus === 'running';
  const llamaStarting = serverStatus === 'starting';

  // Model options — llama-server local .gguf files only
  const llamaModelOptions = models.map(m => ({ value: m.name, label: `${m.name} (${m.sizeLabel})`, source: 'llama' }));
  const allOptions        = llamaModelOptions;

  const hasModels = allOptions.length > 0;

  const ModelSelect: React.FC<{value: string; onChange: (v:string)=>void; placeholder?: string}> = ({ value, onChange, placeholder }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="flex-1 text-[11px] border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:border-orange-400 cursor-pointer transition-colors min-w-0">
      {!value && <option value="">-- pick a model --</option>}
      {llamaModelOptions.length > 0 && (
        <optgroup label="── Local .gguf (llama-server)">
          {llamaModelOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      )}
    </select>
  );

  return (
    <div className="fixed inset-0 z-[70] bg-black/25 backdrop-blur-[2px] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn 150ms ease' }}
      onClick={e => e.target === e.currentTarget && close()}>
      <div className="bg-white w-full max-w-[480px] rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-h-[90vh] flex flex-col"
        style={{ animation: 'slideUp 180ms cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-[18px]">smart_toy</span>
            </div>
            <div>
              <h2 className="text-[13px] font-semibold text-gray-900">AI Model Settings</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${llamaRunning ? 'bg-emerald-400' : llamaStarting ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
                <span className="text-[11px] text-gray-500">{llamaRunning ? 'GPU server running' : llamaStarting ? 'Starting…' : 'GPU offline'}</span>
                <button onClick={refresh} disabled={refreshing} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
                  <span className={`material-symbols-outlined text-[13px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
                </button>
              </div>
            </div>
          </div>
          <button onClick={close} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* llama-server control */}
        <div className={`px-5 py-3 border-b flex items-center justify-between gap-3 ${llamaRunning ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
          <div>
            <div className={`text-[11px] font-semibold ${llamaRunning ? 'text-emerald-800' : 'text-amber-800'}`}>
              {llamaRunning ? '✓ GPU server active' : 'GPU server not running'}
            </div>
            <div className="text-[10px] text-gray-500 mt-0.5 font-mono truncate max-w-[260px]">
              {llamaPath.split('/').pop() ?? 'binary not found'}
            </div>
          </div>
          {!llamaRunning ? (
            <button onClick={startServer} disabled={starting || !llamaPath}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-[11px] font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors">
              <span className={`material-symbols-outlined text-[14px] ${starting ? 'animate-spin' : ''}`}>{starting ? 'autorenew' : 'play_arrow'}</span>
              {starting ? 'Starting…' : 'Start GPU Server'}
            </button>
          ) : (
            <button onClick={stopServer}
              className="flex-shrink-0 px-3 py-1.5 border border-emerald-300 text-emerald-700 text-[11px] font-semibold rounded-lg hover:bg-emerald-100 transition-colors">
              Stop
            </button>
          )}
        </div>

        {/* Model assignment — just TWO selectors */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">

          {!hasModels && (
            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-[11px] text-blue-700 leading-relaxed">
              No local models found. Place <code>.gguf</code> files (≥100MB) in <code>~/llama.cpp/models/</code>.
            </div>
          )}

          {/* Lite model — autocomplete */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">LITE</span>
              <span className="text-[12px] font-semibold text-gray-800">Fast model</span>
              <span className="text-[11px] text-gray-400">— for autocomplete</span>
            </div>
            <div className="text-[10px] text-gray-400 ml-0.5">Use the smallest model for lowest latency inline suggestions.</div>
            {hasModels ? (
              <ModelSelect value={liteModel} onChange={setLiteModel} />
            ) : (
              <div className="text-[11px] text-gray-400 italic py-1">No models available</div>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {LITE_FEATURES.map(k => (
                <span key={k} className="text-[9px] px-1.5 py-0.5 bg-orange-50 text-orange-600 border border-orange-200 rounded-full font-medium">{k}</span>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-100" />

          {/* Full model — everything else */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">FULL</span>
              <span className="text-[12px] font-semibold text-gray-800">Capable model</span>
              <span className="text-[11px] text-gray-400">— for analysis & fixes</span>
            </div>
            <div className="text-[10px] text-gray-400 ml-0.5">Use the largest available model for tasks that need reasoning.</div>
            {hasModels ? (
              <ModelSelect value={fullModel} onChange={setFullModel} />
            ) : (
              <div className="text-[11px] text-gray-400 italic py-1">No models available</div>
            )}
            <div className="flex flex-wrap gap-1 mt-1">
              {FULL_FEATURES.map(k => (
                <span key={k} className="text-[9px] px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full font-medium">{k}</span>
              ))}
            </div>
          </div>

          {/* Binary path */}
          <div className="border-t border-gray-100 pt-3 space-y-1.5">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">llama-server binary</div>
            <input value={llamaPath} onChange={e => setLlamaPath(e.target.value)}
              placeholder="/home/user/llama.cpp/build/bin/llama-server"
              className="w-full text-[11px] border border-gray-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-orange-400 font-mono" />
          </div>

          {/* Available models list */}
          {models.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Models found ({models.length})
              </div>
              <div className="space-y-1">
                {models.map(m => (
                  <div key={m.path} className="flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50">
                    <span className="text-[11px] text-gray-700 font-mono truncate flex-1">{m.name}</span>
                    <span className="text-[10px] text-gray-400 ml-2 flex-shrink-0">{m.sizeLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="text-[10px] text-gray-400">
            {liteModel && fullModel && `Lite: ${liteModel.split('/').pop()} · Full: ${fullModel.split('/').pop()}`}
          </div>
          <div className="flex gap-2">
            <button onClick={close} className="px-3 py-1.5 text-gray-600 text-[12px] hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
            <button onClick={applyAndClose} className="px-4 py-1.5 bg-orange-500 text-white text-[12px] font-semibold rounded-lg hover:bg-orange-600 transition-colors">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
};

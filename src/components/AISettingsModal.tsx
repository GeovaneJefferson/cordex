import React, { useEffect, useState, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { themes } from '../themes';
import { useTheme } from '../hooks/useTheme';

const Cordex = (window as any).Cordex;

export const AISettingsModal: React.FC = () => {
  const { state } = useAppState();
  if (!state.aiSettingsOpen) return null;
  return <AISettingsInner />;
};

// ── Traffic light badge ───────────────────────────────────────────────────
const TrafficLight: React.FC<{ tier: string; onGpu?: boolean }> = ({ tier, onGpu }) => {
  const map: Record<string, { color: string; label: string; title: string }> = {
    Green:  { color: '#22c55e', label: '●', title: 'GPU compatible — runs 100% on VRAM' },
    Yellow: { color: '#f59e0b', label: '●', title: 'CPU fallback — performance may be slow' },
    Red:    { color: '#ef4444', label: '●', title: 'Insufficient memory — model too large' },
  };
  const meta = map[tier] ?? map.Green;
  return (
    <span title={meta.title} style={{ fontSize: 14, color: meta.color, flexShrink: 0, lineHeight: 1 }}>
      {meta.label}
    </span>
  );
};

// ── Reusable slider ───────────────────────────────────────────────────────
const Slider: React.FC<{ label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; disabled?: boolean }> =
  ({ label, value, min, max, step, onChange, disabled }) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#f97316', fontWeight: 700 }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#f97316', opacity: disabled ? 0.4 : 1 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)' }}>
        <span>{min}</span><span>{max}</span>
      </div>
    </div>
  );

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ value, onChange, disabled }) => (
  <button onClick={() => !disabled && onChange(!value)} disabled={disabled}
    style={{
      position: 'relative', width: 36, height: 20, borderRadius: 10, border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1,
      background: value ? '#f97316' : 'var(--bg-muted)', transition: 'background 0.2s', flexShrink: 0,
    }}>
    <span style={{
      position: 'absolute', top: 2, left: value ? 18 : 2, width: 16, height: 16,
      borderRadius: 8, background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
      transition: 'left 0.2s', display: 'block',
    }} />
  </button>
);

// ── Editor settings helpers ───────────────────────────────────────────────
function getLS(k: string, def: any) {
  try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; } catch { return def; }
}
function buildMonacoOptions() {
  return {
    fontSize: getLS('ce_fontSize', 13),
    minimap: { enabled: getLS('ce_minimap', false) },
    lineNumbers: getLS('ce_lineNumbers', 'on'),
    wordWrap: getLS('ce_wordWrap', 'off'),
    tabSize: getLS('ce_tabSize', 2),
    renderWhitespace: getLS('ce_whitespace', 'none'),
    cursorBlinking: getLS('ce_cursorBlinking', 'smooth'),
    cursorStyle: getLS('ce_cursorStyle', 'line'),
    fontLigatures: getLS('ce_ligatures', false),
    renderLineHighlight: getLS('ce_lineHighlight', 'all'),
    smoothScrolling: getLS('ce_smoothScroll', true),
    stickyScroll: { enabled: getLS('ce_stickyScroll', false) },
    bracketPairColorization: { enabled: getLS('ce_bracketPairs', true) },
  };
}

const Row: React.FC<{ label: string; sub?: string; children: React.ReactNode }> = ({ label, sub, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <div>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{label}</p>
      {sub && <p style={{ margin: 0, fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{sub}</p>}
    </div>
    <div style={{ flexShrink: 0, marginLeft: 12 }}>{children}</div>
  </div>
);
const Sel: React.FC<{ value: string; onChange: (v: string) => void; opts: {v:string;l:string}[]; disabled?: boolean }> = ({ value, onChange, opts, disabled }) => (
  <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}
    style={{ fontSize: 11, border: '1px solid var(--border-default)', borderRadius: 6, padding: '3px 6px', background: 'var(--bg-elevated)', cursor: disabled ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)', opacity: disabled ? 0.5 : 1 }}>
    {opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>
);
const Stepper: React.FC<{ value: number; onChange: (v: number) => void; min: number; max: number; unit?: string }> = ({ value, onChange, min, max, unit }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
    <button onClick={() => onChange(Math.max(min, value-1))} style={{ width:22,height:22,borderRadius:5,border:'1px solid var(--border-default)',background:'var(--bg-subtle)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center' }}>−</button>
    <span style={{ minWidth:36,textAlign:'center',fontSize:12,fontWeight:700,color:'var(--text-primary)' }}>{value}{unit}</span>
    <button onClick={() => onChange(Math.min(max, value+1))} style={{ width:22,height:22,borderRadius:5,border:'1px solid var(--border-default)',background:'var(--bg-subtle)',cursor:'pointer',fontSize:14,fontWeight:700,color:'var(--text-secondary)',display:'flex',alignItems:'center',justifyContent:'center' }}>+</button>
  </div>
);
const SL: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p style={{ fontSize:10,fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.6px',margin:'14px 0 4px' }}>{children}</p>
);

// ── Main ──────────────────────────────────────────────────────────────────
const AISettingsInner: React.FC = () => {
  const { state, dispatch } = useAppState();
  const { currentThemeId, setTheme } = useTheme();
  const hw = state.hardware;
  const hasGpu = !!(hw?.has_gpu && (hw as any).vram_mb > 0);

  type TabId = 'ai' | 'editor' | 'theme';
  const [tab,       setTab]       = useState<TabId>('ai');
  const [chatModels, setChatModels] = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [ollamaOk,  setOllamaOk]  = useState(false);

  // Active chat model config
  const [selectedId, setSelectedId] = useState((state.aiSettings as any).chatModelId || '');
  const [thinking,   setThinking]   = useState((state.aiSettings as any).thinkingEnabled ?? false);
  const [temperature, setTemperature] = useState((state.aiSettings as any).temperature ?? 0.7);
  const [topP,        setTopP]        = useState((state.aiSettings as any).topP ?? 0.9);
  const [numCtx,      setNumCtx]      = useState((state.aiSettings as any).numCtx ?? 4096);

  const [selectedTheme, setSelectedTheme] = useState(currentThemeId);
  const [uiZoom,  setUiZoom]  = useState(() => getLS('ce_uiZoom', 100));
  const [fontSize, setFontSz] = useState(() => getLS('ce_fontSize', 13));
  const [minimap,  setMinimap] = useState(() => getLS('ce_minimap', false));
  const [lineNumbers, setLineNumbers] = useState(() => getLS('ce_lineNumbers', 'on'));
  const [wordWrap,  setWordWrap] = useState(() => getLS('ce_wordWrap', 'off'));
  const [tabSz,     setTabSz]   = useState(() => getLS('ce_tabSize', 2));
  const [whitespace, setWS]    = useState(() => getLS('ce_whitespace', 'none'));
  const [fmtSave,   setFmtSave] = useState(() => getLS('ce_formatOnSave', false));
  const [fmtPaste,  setFmtPaste]= useState(() => getLS('ce_formatOnPaste', false));
  const [curBlink,  setCurBlink]= useState(() => getLS('ce_cursorBlinking', 'smooth'));
  const [curStyle,  setCurStyle]= useState(() => getLS('ce_cursorStyle', 'line'));
  const [ligs,      setLigs]    = useState(() => getLS('ce_ligatures', false));
  const [lineHL,    setLineHL]  = useState(() => getLS('ce_lineHighlight', 'all'));
  const [smooth,    setSmooth]  = useState(() => getLS('ce_smoothScroll', true));
  const [sticky,    setSticky]  = useState(() => getLS('ce_stickyScroll', false));
  const [bPairs,    setBPairs]  = useState(() => getLS('ce_bracketPairs', true));
  const [bGuides,   setBGuides] = useState(() => getLS('ce_bracketGuides', true));

  const close = () => dispatch({ type: 'TOGGLE_AI_SETTINGS' });

  function live(key: string, value: any, setter: (v: any) => void) {
    setter(value);
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('cordex:editor-options', { detail: buildMonacoOptions() }));
  }

  // Load profile-driven chat models
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const ping = await Cordex?.ollama?.ping?.();
        setOllamaOk(ping?.ok === true);
        const models = await Cordex?.profile?.chatModels?.();
        if (models?.length) {
          setChatModels(models);
          if (!selectedId) setSelectedId(models[0].model_identifier);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Update params from profile when model changes
  useEffect(() => {
    const m = chatModels.find(m => m.model_identifier === selectedId);
    if (!m) return;
    setTemperature(m.parameters?.temperature ?? 0.7);
    setTopP(m.parameters?.top_p ?? 0.9);
    setNumCtx(m.parameters?.num_ctx ?? 4096);
    // Force thinking off for CPU
    if (!hasGpu && thinking) setThinking(false);
    // Apply profile default
    if (m.ui_features?.thinking_mode_allowed && m.ui_features?.default_thinking_state) {
      setThinking(hasGpu);
    } else {
      setThinking(false);
    }
  }, [selectedId, chatModels]);

  const selectedModel = chatModels.find(m => m.model_identifier === selectedId);
  const thinkingAllowed = (selectedModel?.ui_features?.thinking_mode_allowed ?? false) && hasGpu;

  const applyAndClose = async () => {
    dispatch({ type: 'SET_AI_SETTINGS', settings: {
      autocomplete: (state.aiSettings as any).autocomplete || 'qwen2.5-coder:1.5b-base',
      analyze:      selectedId,
      bugfix:       selectedId,
      docstring:    selectedId,
      flow:         selectedId,
      chatModelId:      selectedId,
      thinkingEnabled:  thinking,
      temperature,
      topP,
      numCtx,
      agentModels: { document: selectedId, fixCode: selectedId },
    } as any });
    setTheme(selectedTheme);
    try {
      const cur = await Cordex?.settings?.get?.() ?? {};
      await Cordex?.settings?.set?.({ ...cur, analysisModel: selectedId, theme: selectedTheme });
    } catch {}
    close();
  };

  const TABS: {id: TabId; label: string}[] = [{id:'ai',label:'AI Models'},{id:'editor',label:'Editor'},{id:'theme',label:'Theme'}];

  return (
    <div style={{ position:'fixed',inset:0,zIndex:70,background:'rgba(0,0,0,0.35)',display:'flex',alignItems:'center',justifyContent:'center' }}
      onClick={e => e.target === e.currentTarget && close()}>
      <div style={{ width:640,height:600,background:'var(--bg-elevated)',borderRadius:14,boxShadow:'0 24px 64px rgba(0,0,0,0.45)',border:'1px solid var(--border-default)',display:'flex',flexDirection:'column',overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border-subtle)',flexShrink:0 }}>
          <div style={{ display:'flex',alignItems:'center',gap:10 }}>
            <div style={{ width:32,height:32,borderRadius:8,background:'#f97316',display:'flex',alignItems:'center',justifyContent:'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize:17,color:'white' }}>settings</span>
            </div>
            <div>
              <p style={{ margin:0,fontSize:13,fontWeight:700,color:'var(--text-primary)' }}>Settings</p>
              <p style={{ margin:0,fontSize:10,color:'var(--text-muted)',marginTop:1 }}>
                {ollamaOk ? `● Ollama ready · ${chatModels.length} model(s)` : '○ Ollama offline'}
              </p>
            </div>
          </div>
          <button onClick={close} style={{ background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',display:'flex',alignItems:'center',justifyContent:'center',padding:4,borderRadius:6,width:28,height:28 }}
            onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-muted)')}
            onMouseLeave={e=>(e.currentTarget.style.background='none')}>
            <span className="material-symbols-outlined" style={{ fontSize:18,display:'block' }}>close</span>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex',gap:2,padding:'8px 20px',borderBottom:'1px solid var(--border-subtle)',background:'var(--bg-subtle)',flexShrink:0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ fontSize:11,padding:'5px 12px',borderRadius:7,border:'none',cursor:'pointer',fontWeight:600,
                background: tab===t.id ? 'var(--bg-elevated)' : 'transparent',
                color: tab===t.id ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: tab===t.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1,overflowY:'auto',minHeight:0 }}>

          {/* ── AI Models ─────────────────────────────────────────────── */}
          {tab === 'ai' && (
            <div style={{ padding:'16px 20px' }}>
              {/* Baseline info */}
              <div style={{ padding:'8px 12px',background:'var(--bg-subtle)',border:'1px solid var(--border-subtle)',borderRadius:8,marginBottom:16,fontSize:11,color:'var(--text-secondary)',lineHeight:1.6 }}>
                <strong style={{ color:'var(--text-primary)' }}>Autonomic baseline:</strong> Autocomplete (<code style={{ fontFamily:'monospace',fontSize:10 }}>qwen2.5-coder:1.5b-base</code>) and Embeddings (<code style={{ fontFamily:'monospace',fontSize:10 }}>qwen3-embedding</code>) are managed automatically — no configuration needed.
              </div>

              {/* Chat model selector */}
              <div style={{ marginBottom:16 }}>
                <p style={{ margin:'0 0 8px',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px' }}>Chat / Analysis Model</p>
                {loading ? (
                  <div style={{ fontSize:11,color:'var(--text-muted)',padding:'8px 0' }}>Loading models…</div>
                ) : chatModels.length === 0 ? (
                  <div style={{ padding:'10px 12px',background:'var(--bg-subtle)',borderRadius:8,fontSize:11,color:'var(--text-muted)' }}>
                    No models found. Start Ollama and run: <code style={{ fontFamily:'monospace' }}>ollama serve</code>
                  </div>
                ) : (
                  <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
                    {chatModels.map(m => {
                      const tier = m.ui_features?.traffic_light_tier ?? 'Green';
                      const isRed = tier === 'Red';
                      const sel   = selectedId === m.model_identifier;
                      return (
                        <button key={m.model_identifier}
                          disabled={isRed}
                          onClick={() => setSelectedId(m.model_identifier)}
                          style={{
                            display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:9,
                            border:`1.5px solid ${sel ? '#f97316' : 'var(--border-subtle)'}`,
                            background: sel ? 'var(--bg-muted)' : 'var(--bg-subtle)',
                            cursor: isRed ? 'not-allowed' : 'pointer',
                            opacity: isRed ? 0.5 : 1, textAlign:'left', transition:'all 0.12s',
                          }}>
                          <TrafficLight tier={tier} onGpu={m.ui_features?.on_gpu} />
                          <div style={{ flex:1 }}>
                            <p style={{ margin:0,fontSize:12,fontWeight:700,color:'var(--text-primary)' }}>{m.friendly_name}</p>
                            <p style={{ margin:0,fontSize:10,color:'var(--text-muted)' }}>
                              {tier === 'Yellow' ? 'Warning: CPU fallback — performance may be slow' :
                               tier === 'Red'    ? 'Not compatible — insufficient memory' :
                               `VRAM: ≥${m.hardware_requirements?.minimum_vram_gb}GB · ctx: ${m.parameters?.num_ctx?.toLocaleString()}`}
                            </p>
                          </div>
                          {isRed
                            ? <span style={{ fontSize:10,color:'#ef4444',fontWeight:700,flexShrink:0 }}>Not Compatible</span>
                            : sel
                            ? <span className="material-symbols-outlined" style={{ fontSize:16,color:'#f97316',flexShrink:0 }}>check_circle</span>
                            : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Thinking mode */}
              {selectedModel?.ui_features?.thinking_mode_allowed && (
                <div style={{ padding:'12px',border:'1px solid var(--border-subtle)',borderRadius:9,background:'var(--bg-subtle)',marginBottom:16 }}>
                  <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom: !hasGpu ? 6 : 0 }}>
                    <div style={{ display:'flex',alignItems:'center',gap:8 }}>
                      <span className="material-symbols-outlined" style={{ fontSize:16,color:'#f59e0b' }}>psychology</span>
                      <div>
                        <p style={{ margin:0,fontSize:12,fontWeight:700,color:'var(--text-primary)' }}>Thinking Mode</p>
                        <p style={{ margin:0,fontSize:10,color:'var(--text-muted)' }}>Model reasons inside {'<think>'} tags before answering</p>
                      </div>
                    </div>
                    <Toggle value={thinking} onChange={setThinking} disabled={!thinkingAllowed} />
                  </div>
                  {!hasGpu && (
                    <p style={{ margin:'6px 0 0',fontSize:10,color:'#f59e0b',lineHeight:1.5 }}>
                      ⚠ Thinking mode is disabled for CPU-only systems to prevent severe token generation degradation.
                    </p>
                  )}
                </div>
              )}

              {/* Model execution parameters */}
              {selectedModel && (
                <div>
                  <p style={{ margin:'0 0 10px',fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px' }}>Execution Parameters</p>
                  <Slider label="Temperature" value={temperature} min={0.0} max={2.0} step={0.05}
                    onChange={setTemperature} />
                  <Slider label="Top-P" value={topP} min={0.0} max={1.0} step={0.05}
                    onChange={setTopP} />
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
                      <span style={{ fontSize:11,color:'var(--text-secondary)',fontWeight:600 }}>Context Window (num_ctx)</span>
                      <span style={{ fontSize:11,fontFamily:'monospace',color:'#f97316',fontWeight:700 }}>{numCtx.toLocaleString()}</span>
                    </div>
                    <input type="number" value={numCtx} min={512} max={32768} step={512}
                      onChange={e => setNumCtx(Math.min(32768, Math.max(512, parseInt(e.target.value)||512)))}
                      style={{ width:'100%',fontSize:11,border:'1px solid var(--border-default)',borderRadius:6,padding:'5px 8px',background:'var(--bg-elevated)',color:'var(--text-secondary)' }} />
                    <p style={{ margin:'3px 0 0',fontSize:9,color:'var(--text-muted)' }}>Range: 512 – 32,768 tokens (profile default: {selectedModel.parameters?.num_ctx?.toLocaleString()})</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Editor ────────────────────────────────────────────────── */}
          {tab === 'editor' && (
            <div style={{ padding:'4px 20px 14px' }}>
              <SL>Interface</SL>
              <Row label="UI Zoom" sub="Scales the entire app">
                <div style={{ display:'flex',alignItems:'center',gap:6 }}>
                  <input type="range" min={70} max={130} step={5} value={uiZoom}
                    onChange={e => { const v=Number(e.target.value); setUiZoom(v); localStorage.setItem('ce_uiZoom',JSON.stringify(v)); Cordex?.zoom?.set?.(v/100); }}
                    style={{ width:80,accentColor:'#f97316' }} />
                  <span style={{ fontSize:12,fontWeight:700,color:'#f97316',minWidth:36 }}>{uiZoom}%</span>
                </div>
              </Row>
              <SL>Text</SL>
              <Row label="Editor Font Size" sub="Code text size"><Stepper value={fontSize} min={10} max={28} unit="px" onChange={v=>live('ce_fontSize',v,setFontSz)} /></Row>
              <Row label="Tab Size"><Sel value={String(tabSz)} onChange={v=>live('ce_tabSize',parseInt(v),setTabSz)} opts={[{v:'2',l:'2 spaces'},{v:'4',l:'4 spaces'},{v:'8',l:'8 spaces'}]} /></Row>
              <Row label="Font Ligatures"><Toggle value={ligs} onChange={v=>live('ce_ligatures',v,setLigs)} /></Row>
              <SL>View</SL>
              <Row label="Minimap"><Toggle value={minimap} onChange={v=>live('ce_minimap',v,setMinimap)} /></Row>
              <Row label="Line Numbers"><Sel value={lineNumbers} onChange={v=>live('ce_lineNumbers',v,setLineNumbers)} opts={[{v:'on',l:'On'},{v:'off',l:'Off'},{v:'relative',l:'Relative'}]} /></Row>
              <Row label="Word Wrap"><Sel value={wordWrap} onChange={v=>live('ce_wordWrap',v,setWordWrap)} opts={[{v:'off',l:'Off'},{v:'on',l:'On'},{v:'wordWrapColumn',l:'At column'}]} /></Row>
              <Row label="Render Whitespace"><Sel value={whitespace} onChange={v=>live('ce_whitespace',v,setWS)} opts={[{v:'none',l:'None'},{v:'boundary',l:'Boundary'},{v:'selection',l:'Selection'},{v:'all',l:'All'}]} /></Row>
              <Row label="Line Highlight"><Sel value={lineHL} onChange={v=>live('ce_lineHighlight',v,setLineHL)} opts={[{v:'none',l:'None'},{v:'gutter',l:'Gutter'},{v:'line',l:'Line'},{v:'all',l:'All'}]} /></Row>
              <Row label="Sticky Scroll"><Toggle value={sticky} onChange={v=>live('ce_stickyScroll',v,setSticky)} /></Row>
              <Row label="Smooth Scrolling"><Toggle value={smooth} onChange={v=>live('ce_smoothScroll',v,setSmooth)} /></Row>
              <SL>Editing</SL>
              <Row label="Format on Save"><Toggle value={fmtSave} onChange={v=>live('ce_formatOnSave',v,setFmtSave)} /></Row>
              <Row label="Format on Paste"><Toggle value={fmtPaste} onChange={v=>live('ce_formatOnPaste',v,setFmtPaste)} /></Row>
              <Row label="Bracket Pair Colorization"><Toggle value={bPairs} onChange={v=>live('ce_bracketPairs',v,setBPairs)} /></Row>
              <Row label="Bracket Pair Guides"><Toggle value={bGuides} onChange={v=>live('ce_bracketGuides',v,setBGuides)} /></Row>
              <SL>Cursor</SL>
              <Row label="Cursor Style"><Sel value={curStyle} onChange={v=>live('ce_cursorStyle',v,setCurStyle)} opts={[{v:'line',l:'Line'},{v:'block',l:'Block'},{v:'underline',l:'Underline'},{v:'line-thin',l:'Thin'}]} /></Row>
              <Row label="Cursor Blinking"><Sel value={curBlink} onChange={v=>live('ce_cursorBlinking',v,setCurBlink)} opts={[{v:'blink',l:'Blink'},{v:'smooth',l:'Smooth'},{v:'phase',l:'Phase'},{v:'expand',l:'Expand'},{v:'solid',l:'Solid'}]} /></Row>
            </div>
          )}

          {/* ── Theme ─────────────────────────────────────────────────── */}
          {tab === 'theme' && (
            <div style={{ padding:'14px 20px',display:'flex',flexDirection:'column',gap:8 }}>
              <p style={{ margin:'0 0 8px',fontSize:11,color:'var(--text-secondary)' }}>Changes Monaco editor and the app shell.</p>
              {themes.map(t => (
                <button key={t.id} onClick={() => setSelectedTheme(t.id)}
                  style={{ display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:9,
                    border:`1.5px solid ${selectedTheme===t.id ? '#f97316' : 'var(--border-subtle)'}`,
                    background: selectedTheme===t.id ? 'var(--bg-muted)' : 'var(--bg-subtle)',
                    cursor:'pointer',textAlign:'left',transition:'all 0.12s' }}>
                  <div style={{ width:28,height:28,borderRadius:7,background:(t as any).preview||'#374151',flexShrink:0,border:'1px solid rgba(0,0,0,0.1)' }} />
                  <p style={{ margin:0,fontSize:12,fontWeight:600,color:'var(--text-primary)' }}>{t.name}</p>
                  {selectedTheme===t.id && <span className="material-symbols-outlined" style={{ fontSize:16,color:'#f97316',marginLeft:'auto' }}>check_circle</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'10px 20px',borderTop:'1px solid var(--border-subtle)',display:'flex',justifyContent:'flex-end',gap:8,flexShrink:0 }}>
          <button onClick={close} style={{ padding:'6px 16px',borderRadius:8,border:'1px solid var(--border-default)',background:'var(--bg-elevated)',color:'var(--text-secondary)',fontSize:12,fontWeight:600,cursor:'pointer' }}>Cancel</button>
          <button onClick={applyAndClose} style={{ padding:'6px 16px',borderRadius:8,border:'none',background:'#f97316',color:'white',fontSize:12,fontWeight:700,cursor:'pointer' }}>Apply</button>
        </div>
      </div>
    </div>
  );
};

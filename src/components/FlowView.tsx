import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useAppState } from '../store/AppContext';
import { Tab } from '../types';

// ── Types ────────────────────────────────────────────────────────────────────
interface FNode {
  id: string; nodeType: string; label: string; sub?: string;
  description?: string; errorMsg?: string; line?: number | null;
  position: { x: number; y: number }; width: number; height: number;
}
interface FEdge { id: string; source: string; target: string; label?: string; kind?: string }
interface FlowGraph { nodes: FNode[]; edges: FEdge[]; error?: string }
interface LogEntry  { text: string; kind: 'info'|'success'|'error'|'ai'|'warn' }
type NodeStatus = 'idle'|'running'|'success'|'error'|'predicted'|'risk'|'skipped';
type PlayMode   = 'execution'|'simulation'|null;

// ── Module-level graph cache ──────────────────────────────────────────────────
const GRAPH_CACHE = new Map<string, { graph: FlowGraph; nodes: FNode[]; sourceHash: string }>();
function hashStr(s: string) { let h = 0; for (let i = 0; i < Math.min(s.length, 500); i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h.toString(36); }

// ── Node visual config ───────────────────────────────────────────────────────
const NCFG: Record<string, { bg: string; border: string; icon: string; tag: string; tagColor: string; tagBg: string }> = {
  entry:    { bg:'#f0fdf4', border:'#16a34a', icon:'play_arrow',    tag:'ENTRY',  tagColor:'#15803d', tagBg:'#dcfce7' },
  exit:     { bg:'#fef2f2', border:'#dc2626', icon:'stop',          tag:'EXIT',   tagColor:'#b91c1c', tagBg:'#fee2e2' },
  call:     { bg:'#ffffff', border:'#e2e8f0', icon:'code',          tag:'DO',     tagColor:'#0284c7', tagBg:'#e0f2fe' },
  decision: { bg:'#fffbeb', border:'#f59e0b', icon:'device_hub',    tag:'IF',     tagColor:'#b45309', tagBg:'#fef3c7' },
  loop:     { bg:'#f5f3ff', border:'#7c3aed', icon:'autorenew',     tag:'LOOP',   tagColor:'#6d28d9', tagBg:'#ede9fe' },
  error:    { bg:'#fff1f2', border:'#e11d48', icon:'error_outline', tag:'ERROR',  tagColor:'#be123c', tagBg:'#ffe4e6' },
  value:    { bg:'#f0f9ff', border:'#0284c7', icon:'data_object',   tag:'VALUE',  tagColor:'#0369a1', tagBg:'#e0f2fe' },
};
const cfg = (t: string) => NCFG[t] ?? NCFG.call;
const NODE_W = 260;

const STATUS_STYLE: Record<NodeStatus, { border: string; bg: string; glow?: string }> = {
  idle:      { border:'',        bg:''        },
  running:   { border:'#f97316', bg:'#fff7ed', glow:'rgba(249,115,22,0.25)' },
  success:   { border:'#16a34a', bg:'#f0fdf4', glow:'rgba(22,163,74,0.15)'  },
  error:     { border:'#dc2626', bg:'#fff1f2', glow:'rgba(220,38,38,0.2)'   },
  predicted: { border:'#0ea5e9', bg:'#f0f9ff', glow:'rgba(14,165,233,0.15)' },
  risk:      { border:'#f59e0b', bg:'#fffbeb', glow:'rgba(245,158,11,0.2)'  },
  skipped:   { border:'#cbd5e1', bg:'#f8fafc'  },
};

function orthogonalPath(sx: number, sy: number, tx: number, ty: number) {
  const midY = sy + Math.max(30, (ty - sy) / 2);
  if (Math.abs(sx - tx) < 4) return `M ${sx} ${sy} L ${tx} ${ty}`;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
}

// ── NodeCard ─────────────────────────────────────────────────────────────────
const NodeCard: React.FC<{
  node: FNode; selected: boolean; status: NodeStatus; riskReasons?: string[];
  onClick: () => void;
}> = ({ node, selected, status, riskReasons = [], onClick }) => {
  const d = (node as any).data ?? node;
  const nodeType = d.nodeType ?? node.nodeType ?? 'call';
  const label    = d.label    ?? node.label    ?? node.id;
  const desc     = d.description ?? node.description ?? null;
  const errMsg   = d.errorMsg    ?? node.errorMsg    ?? null;
  const c   = cfg(nodeType);
  const st  = STATUS_STYLE[status];
  const border = selected ? '#f97316' : (st.border || c.border);
  const bg     = st.bg || c.bg;
  const shadow = selected
    ? '0 0 0 3px rgba(249,115,22,0.25),0 4px 16px rgba(0,0,0,0.1)'
    : st.glow ? `0 0 0 2px ${st.glow},0 2px 10px rgba(0,0,0,0.07)` : '0 2px 8px rgba(0,0,0,0.07)';

  const iconName = status==='running'?'autorenew':status==='success'?'check_circle':status==='error'?'error':status==='risk'?'warning':status==='predicted'?'trending_flat':status==='skipped'?'remove_circle':c.icon;
  const iconBg   = status==='running'?'#f97316':status==='success'?'#16a34a':status==='error'?'#dc2626':status==='risk'?'#f59e0b':status==='predicted'?'#0ea5e9':status==='skipped'?'#94a3b8':border;

  return (
    <div data-node-id={node.id}
      style={{ position:'absolute', left:node.position.x, top:node.position.y,
        width:NODE_W, background:bg, border:`2px solid ${border}`,
        borderRadius:12, cursor:'grab', userSelect:'none',
        boxShadow:shadow, transition:'border-color .2s,box-shadow .2s,background .2s', zIndex:selected?10:5 }}
      onClick={onClick}>
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px 6px' }}>
        <div style={{ width:32, height:32, borderRadius:7, flexShrink:0, background:iconBg,
          display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize:17, color:'white',
            animation:status==='running'?'spin 1s linear infinite':'none' }}>{iconName}</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', lineHeight:1.3, wordBreak:'break-word' }}>{label}</div>
          {node.line && <div style={{ fontSize:9, color:'#94a3b8', fontFamily:'monospace' }}>line {node.line}</div>}
        </div>
      </div>
      <div style={{ paddingLeft:14, paddingBottom:6, display:'flex', gap:6, flexWrap:'wrap' }}>
        <span style={{ fontSize:9, fontWeight:700, letterSpacing:'.6px', background:c.tagBg, color:c.tagColor, padding:'2px 6px', borderRadius:4 }}>{c.tag}</span>
        {status !== 'idle' && (
          <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4,
            background:st.glow?st.bg:'#f1f5f9', color:border, border:`1px solid ${border}` }}>
            {status.toUpperCase()}
          </span>
        )}
      </div>
      {(desc || errMsg) && (
        <div style={{ margin:'0 14px 10px', borderTop:`1px dashed ${border}`, paddingTop:7 }}>
          {desc && <div style={{ fontFamily:'monospace', fontSize:11, color:status==='success'?'#15803d':status==='error'?'#dc2626':'#64748b', lineHeight:1.4 }}>{desc}</div>}
          {errMsg && <div style={{ fontFamily:'monospace', fontSize:11, color:'#dc2626', background:'#fef2f2', borderRadius:4, padding:'3px 6px', marginTop:4 }}>{errMsg}</div>}
        </div>
      )}
      {status === 'risk' && riskReasons.length > 0 && (
        <div style={{ margin:'0 14px 10px', background:'#fffbeb', border:'1px solid #fcd34d', borderRadius:6, padding:'6px 8px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#b45309', marginBottom:3 }}>⚠ Static warnings</div>
          {riskReasons.map((r,i) => <div key={i} style={{ fontSize:10, color:'#92400e' }}>• {r}</div>)}
        </div>
      )}
      {status === 'error' && (
        <div style={{ margin:'0 14px 10px', background:'#f5f3ff', border:'1px solid #a78bfa', borderRadius:6, padding:'6px 10px' }}>
          <div style={{ fontSize:10, color:'#6d28d9' }}>
            <span className="material-symbols-outlined" style={{ fontSize:11, verticalAlign:'middle', marginRight:3 }}>memory</span>
            Open Chat → Bug Fix for AI repair suggestions.
          </div>
        </div>
      )}
    </div>
  );
};

// ── RightPanel ───────────────────────────────────────────────────────────────
const RightPanel: React.FC<{
  mode: PlayMode; running: boolean; logs: LogEntry[];
  stats: { executed:number; errors:number; risks:number; predicted:number; total:number }|null;
  onPlay: ()=>void; onReset: ()=>void; onStop: ()=>void;
  onRegenerate: ()=>void;
}> = ({ mode, running, logs, stats, onPlay, onReset, onStop, onRegenerate }) => {
  const logsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);

  return (
    <div style={{ width:300, borderLeft:'1px solid #e2e8f0', background:'#fff', display:'flex', flexDirection:'column', flexShrink:0 }}>
      {mode && (
        <div style={{ padding:'8px 12px', borderBottom:'1px solid #e2e8f0',
          background:mode==='execution'?'#f0fdf4':'#eff6ff', display:'flex', alignItems:'center', gap:8 }}>
          <span className="material-symbols-outlined" style={{ fontSize:15, color:mode==='execution'?'#16a34a':'#3b82f6' }}>
            {mode==='execution'?'bolt':'analytics'}
          </span>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:mode==='execution'?'#15803d':'#1d4ed8' }}>
              {mode==='execution'?'⚡ EXECUTION MODE':'🔵 SIMULATION MODE'}
            </div>
            <div style={{ fontSize:10, color:'#64748b' }}>{mode==='execution'?'Real subprocess':'Static analysis'}</div>
          </div>
        </div>
      )}
      {stats && (
        <div style={{ padding:'8px 12px', borderBottom:'1px solid #e2e8f0', display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
          {[['Executed','#16a34a',stats.executed],['Errors','#dc2626',stats.errors],['Risks','#f59e0b',stats.risks],['Predicted','#0ea5e9',stats.predicted]].map(([l,c,v]) => (
            <div key={l as string} style={{ background:'#f8fafc', borderRadius:6, padding:'4px 8px', borderLeft:`3px solid ${c}` }}>
              <div style={{ fontSize:16, fontWeight:800, color:c as string, lineHeight:1 }}>{v as number}</div>
              <div style={{ fontSize:9, color:'#94a3b8', fontWeight:600 }}>{(l as string).toUpperCase()}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding:'10px 12px', borderBottom:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:6 }}>
        {running
          ? <button onClick={onStop} style={{ width:'100%', padding:'7px 0', background:'#dc2626', color:'white', border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:16 }}>stop</span>Stop
            </button>
          : <button onClick={onPlay} style={{ width:'100%', padding:'7px 0', background:'#16a34a', color:'white', border:'none', borderRadius:7, fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              <span className="material-symbols-outlined" style={{ fontSize:16 }}>play_arrow</span>{mode?'Run Again':'Run / Simulate'}
            </button>}
        <button onClick={onReset} style={{ width:'100%', padding:'5px 0', background:'white', color:'#64748b', border:'1px solid #e2e8f0', borderRadius:7, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <span className="material-symbols-outlined" style={{ fontSize:14 }}>refresh</span>Reset
        </button>
        <button onClick={onRegenerate} style={{ width:'100%', padding:'5px 0', background:'white', color:'#94a3b8', border:'1px solid #e2e8f0', borderRadius:7, fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
          <span className="material-symbols-outlined" style={{ fontSize:14 }}>account_tree</span>Regenerate flow
        </button>
      </div>
      <div style={{ padding:'6px 12px 4px', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:'#94a3b8', borderBottom:'1px solid #f1f5f9' }}>
        Output
      </div>
      <div ref={logsRef} style={{ flex:1, overflowY:'auto', padding:'4px 6px', display:'flex', flexDirection:'column', gap:2 }}>
        {logs.map((l,i) => (
          <div key={i} style={{ fontSize:10.5, fontFamily:'monospace', lineHeight:1.4, padding:'2px 7px', borderRadius:4,
            borderLeft:`3px solid ${l.kind==='success'?'#16a34a':l.kind==='error'?'#dc2626':l.kind==='warn'?'#f59e0b':l.kind==='ai'?'#7c3aed':'#94a3b8'}`,
            background:l.kind==='success'?'#f0fdf4':l.kind==='error'?'#fef2f2':l.kind==='warn'?'#fffbeb':l.kind==='ai'?'#f5f3ff':'#f8fafc',
            color:l.kind==='success'?'#15803d':l.kind==='error'?'#b91c1c':l.kind==='warn'?'#92400e':l.kind==='ai'?'#6d28d9':'#475569',
            whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
            {l.text}
          </div>
        ))}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
export const FlowView: React.FC<{ flowTab?: Tab }> = ({ flowTab }) => {
  const { state } = useAppState();

  const sourceTab = flowTab?.flowSourceTabId
    ? state.tabs.find((t: Tab) => t.id === flowTab!.flowSourceTabId)
    : state.tabs.find((t: Tab) => t.id === state.activeTabId && t.tabType !== 'flow');

  const cacheKey = flowTab?.flowSourceTabId ?? sourceTab?.id ?? '';

  const [graph,      setGraph]      = useState<FlowGraph|null>(() => GRAPH_CACHE.get(cacheKey)?.graph ?? null);
  const [nodes,      setNodes]      = useState<FNode[]>(() => GRAPH_CACHE.get(cacheKey)?.nodes ?? []);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [selected,   setSelected]   = useState<string|null>(null);
  const [logs,       setLogs]       = useState<LogEntry[]>([{ text:'Ready. Press Run to execute or simulate.', kind:'info' }]);
  const [running,    setRunning]    = useState(false);
  const [playMode,   setPlayMode]   = useState<PlayMode>(null);
  const [nodeStatus, setNodeStatus] = useState<Record<string,NodeStatus>>({});
  const [riskMap,    setRiskMap]    = useState<Record<string,string[]>>({});
  const [stats,      setStats]      = useState<{executed:number;errors:number;risks:number;predicted:number;total:number}|null>(null);

  // Z-zoom state
  const [zoomMode,   setZoomMode]   = useState(false);
  const [zoomRect,   setZoomRect]   = useState<{x:number;y:number;w:number;h:number}|null>(null);

  const zoomApiRef = useRef<any>(null);
  const canvasRef  = useRef<HTMLDivElement>(null);
  const zoomStartRef = useRef<{x:number;y:number}|null>(null);

  const addLog = useCallback((text: string, kind: LogEntry['kind'] = 'info') =>
    setLogs(l => [...l, { text, kind }]), []);

  const resetStatuses = useCallback((ns: FNode[]) => {
    const m: Record<string,NodeStatus> = {};
    ns.forEach(n => { m[n.id] = 'idle'; });
    setNodeStatus(m); setRiskMap({}); setStats(null);
  }, []);

  const computeStats = useCallback((statuses: Record<string,NodeStatus>) => {
    const v = Object.values(statuses);
    setStats({ executed:v.filter(s=>s==='success').length, errors:v.filter(s=>s==='error').length, risks:v.filter(s=>s==='risk').length, predicted:v.filter(s=>s==='predicted').length, total:v.length });
  }, []);

  // ── Graph generation ──────────────────────────────────────────────────────
  const analyze = useCallback(async () => {
    if (!sourceTab?.content) return;
    setAnalyzing(true); setGraph(null); setNodes([]); setPlayMode(null);
    setLogs([{ text:`[AI] Analyzing ${sourceTab.name}…`, kind:'ai' }]);
    try {
      const result = await (window as any).electronAPI?.analyzeFlow?.({
        code: sourceTab.content, filePath: sourceTab.path ?? null,
        projectRoot: (window as any).__cordexRoot ?? null,
      });
      if (result?.nodes?.length) {
        setGraph(result); setNodes(result.nodes);
        resetStatuses(result.nodes);
        GRAPH_CACHE.set(cacheKey, { graph:result, nodes:result.nodes, sourceHash:hashStr(sourceTab.content) });
        addLog(`[Flow] ${result.nodes.length} nodes, ${result.edges?.length ?? 0} edges`, 'success');
      } else { addLog(result?.error ?? 'No flow data returned', 'error'); }
    } catch (e: any) { addLog(`[Error] ${e?.message}`, 'error'); }
    finally { setAnalyzing(false); }
  }, [sourceTab, cacheKey, resetStatuses, addLog]);

  useEffect(() => {
    if (!sourceTab?.content) return;
    const cached = GRAPH_CACHE.get(cacheKey);
    if (cached) { setGraph(cached.graph); setNodes(cached.nodes); resetStatuses(cached.nodes); return; }
    analyze();
  }, [cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const nodeForLine = useCallback((line: number): string|null => {
    if (!nodes.length) return null;
    const withLines = nodes.filter(n => n.line != null);
    if (withLines.length > 0) {
      const best = withLines.reduce((p,c) => Math.abs((c.line??0)-line) < Math.abs((p.line??0)-line) ? c : p);
      if (Math.abs((best.line??0)-line) < 30) return best.id;
    }
    const sorted = [...nodes].sort((a,b) => a.position.y-b.position.y);
    return (sorted.filter(n=>(n.nodeType??'call')!=='exit').at(-1) ?? sorted.at(-1))?.id ?? null;
  }, [nodes]);

  // ── Execution mode ────────────────────────────────────────────────────────
  const runExecution = useCallback(async (language: string) => {
    if (!sourceTab || !graph) return;
    addLog(`[⚡ Exec] Running ${sourceTab.name}…`, 'info');
    const fresh: Record<string,NodeStatus> = {};
    nodes.forEach(n => { fresh[n.id] = 'idle'; });
    setNodeStatus({ ...fresh });

    const result = await (window as any).electronAPI?.runFlow?.({ code:sourceTab.content, language, filePath:sourceTab.path });
    if (!result) { addLog('[Error] No response from execution engine', 'error'); return; }

    const sorted = [...nodes].sort((a,b) => a.position.y-b.position.y);
    const errorLine = result.errorLine;
    const hasRealError = !result.success || result.hasStderrErrors;

    if (!hasRealError) {
      sorted.forEach(n => { fresh[n.id] = 'success'; });
      setNodeStatus({ ...fresh });
      addLog(`✓ Exit 0`, 'success');
      if (result.stdout) result.stdout.split('\n').forEach((l: string) => l && addLog(l, 'success'));
      if (result.stderr) result.stderr.split('\n').forEach((l: string) => l && addLog(l, 'warn'));
    } else {
      const errorNodeId = errorLine ? nodeForLine(errorLine) : null;
      let hitError = false;
      for (const node of sorted) {
        if (!hitError) {
          if (node.id === errorNodeId) { fresh[node.id] = 'error'; hitError = true; }
          else fresh[node.id] = 'success';
        } else { fresh[node.id] = 'skipped'; }
      }
      if (!hitError && sorted.length) {
        const errTarget = sorted.filter(n=>n.nodeType!=='exit').at(-1) ?? sorted.at(-1);
        if (errTarget) {
          fresh[errTarget.id] = 'error';
          sorted.filter(n => n.id !== errTarget.id && fresh[n.id] !== 'skipped').forEach(n => { fresh[n.id] = 'success'; });
        }
      }
      setNodeStatus({ ...fresh });
      addLog(`✗ Exit ${result.exitCode}${result.hasStderrErrors && result.success ? ' (runtime error caught)' : ''}`, 'error');
      if (result.phase === 'compile') addLog('[Compile phase failed]', 'error');
      if (result.stderr) result.stderr.split('\n').slice(0,25).forEach((l:string) => l && addLog(l, 'error'));
      if (result.stdout) result.stdout.split('\n').forEach((l:string) => l && addLog(l, 'info'));
    }
    computeStats(fresh);
  }, [sourceTab, graph, nodes, nodeForLine, addLog, computeStats]);

  // ── Simulation mode ───────────────────────────────────────────────────────
  const runSimulation = useCallback(async (language: string) => {
    if (!graph) return;
    addLog(`[🔵 Sim] Static analysis of ${sourceTab?.name}…`, 'ai');
    const result = await (window as any).electronAPI?.simulateFlow?.({ code:sourceTab?.content??'', language, nodes });
    if (!result) { addLog('[Error] Simulation failed', 'error'); return; }
    const fresh: Record<string,NodeStatus> = {};
    nodes.forEach(n => { fresh[n.id]='idle'; });
    (result.executedNodes??[]).forEach((id:string) => { fresh[id]='success'; });
    (result.predictedNodes??[]).forEach((id:string) => { fresh[id]='predicted'; });
    const newRiskMap: Record<string,string[]> = {};
    (result.riskNodes??[]).forEach(({ id, risks }: {id:string;risks:string[]}) => { fresh[id]='risk'; newRiskMap[id]=risks; });
    setNodeStatus(fresh); setRiskMap(newRiskMap); computeStats(fresh);
    addLog(`Predicted: ${(result.executedNodes??[]).length} executed, ${(result.riskNodes??[]).length} risky`, 'info');
    if (result.fileRisks?.length) addLog(`File risks: ${result.fileRisks.join(', ')}`, 'warn');
    addLog('Simulation is approximate — no code was executed.', 'ai');
  }, [sourceTab, graph, nodes, addLog, computeStats]);

  const handlePlay = useCallback(async () => {
    if (!sourceTab || !graph || running) return;
    setRunning(true);
    setLogs([{ text:'[Play] Detecting mode…', kind:'info' }]);
    resetStatuses(nodes);
    const language = sourceTab.language ?? 'plaintext';
    const modeRes = await (window as any).electronAPI?.detectFlowMode?.({ language, filePath:sourceTab.path });
    const mode: PlayMode = modeRes?.mode ?? 'simulation';
    setPlayMode(mode);
    addLog(mode==='execution' ? `[Mode] ⚡ EXECUTION — ${modeRes?.reason}` : `[Mode] 🔵 SIMULATION — ${modeRes?.reason??'static analysis'}`, mode==='execution'?'success':'ai');
    if (mode === 'execution') await runExecution(language);
    else await runSimulation(language);
    setRunning(false);
  }, [sourceTab, graph, running, nodes, resetStatuses, addLog, runExecution, runSimulation]);

  const handleStop = () => { setRunning(false); addLog('[Stopped]', 'warn'); };
  const handleReset = () => { resetStatuses(nodes); setPlayMode(null); setLogs([{ text:'Reset.', kind:'info' }]); };
  const handleRegenerate = () => { GRAPH_CACHE.delete(cacheKey); analyze(); };

  // ── Edges ─────────────────────────────────────────────────────────────────
  const renderEdges = () => {
    if (!graph) return null;
    const byId: Record<string,FNode> = {};
    nodes.forEach(n => { byId[n.id]=n; });
    return graph.edges.map(edge => {
      const src=byId[edge.source], tgt=byId[edge.target];
      if (!src||!tgt) return null;
      const sx=src.position.x+NODE_W/2, sy=src.position.y+(src.height??100)+4;
      const tx=tgt.position.x+NODE_W/2, ty=tgt.position.y-4;
      const isErr = edge.kind==='error' || ['raises','error','catch'].includes(edge.label??'');
      const isBr  = edge.kind==='branch'|| ['false','no','else'].includes(edge.label??'');
      const stroke= isErr?'#ef4444':isBr?'#f59e0b':'#94a3b8';
      return (
        <g key={edge.id}>
          <path d={orthogonalPath(sx,sy,tx,ty)} fill="none" stroke={stroke}
            strokeWidth={isErr?2.5:2} strokeDasharray={isErr?'6 3':undefined}
            markerEnd={`url(#arr-${isErr?'red':isBr?'amber':'gray'})`} />
          {edge.label && (
            <g transform={`translate(${(sx+tx)/2},${sy+(ty-sy)/2})`}>
              <rect x={-32} y={-9} width={64} height={18} rx={4} fill="white" stroke={stroke} strokeWidth={1}/>
              <text textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={600} fill={stroke}>{edge.label}</text>
            </g>
          )}
        </g>
      );
    });
  };

  // ── Z-box-zoom handlers (using the library's setTransform) ────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z') {
        if (!(e.ctrlKey || e.metaKey)) {
          setZoomMode(true);
          e.preventDefault();
        }
      }
      if (e.key === 'Escape') {
        setZoomMode(false);
        setZoomRect(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'z' || e.key === 'Z') {
        setZoomMode(false);
        setZoomRect(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Mouse handlers for box-zoom (only active when zoomMode is true)
  const onCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (!zoomMode) return;
    if (e.button !== 0) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    zoomStartRef.current = { x, y };
    setZoomRect({ x, y, w: 0, h: 0 });
    e.preventDefault();
    e.stopPropagation();
  }, [zoomMode]);

  const onCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!zoomMode || !zoomStartRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const sx = zoomStartRef.current.x;
    const sy = zoomStartRef.current.y;
    setZoomRect({ x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) });
  }, [zoomMode]);

  const onCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (!zoomMode || !zoomStartRef.current) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const sx = zoomStartRef.current.x;
    const sy = zoomStartRef.current.y;
    const rw = Math.abs(cx - sx);
    const rh = Math.abs(cy - sy);
    if (rw > 10 && rh > 10) {
      const rx = Math.min(sx, cx);
      const ry = Math.min(sy, cy);
      // Get current transform from the library
      const api = zoomApiRef.current;
      if (api) {
        const curState = api.state;
        const curScale = curState.scale;
        const curPosX = curState.positionX;
        const curPosY = curState.positionY;
        // Calculate world coordinates under the top-left of the rectangle
        const worldX = (rx - curPosX) / curScale;
        const worldY = (ry - curPosY) / curScale;
        // Calculate new scale to fit the rectangle
        const newScale = Math.min(2, Math.max(0.2, Math.min(rect.width / rw, rect.height / rh) * 0.9));
        // New position to center that world point
        const newPosX = rx - worldX * newScale;
        const newPosY = ry - worldY * newScale;
        api.setTransform(newPosX, newPosY, newScale, 200, 'easeOut');
      }
    }
    zoomStartRef.current = null;
    setZoomRect(null);
    setZoomMode(false);
  }, [zoomMode]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', background:'#f8fafc' }}>
      {/* ── Canvas ────────────────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        style={{ flex:1, position:'relative', overflow:'hidden',
          backgroundImage:'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
          backgroundSize:'20px 20px',
          cursor: zoomMode ? 'crosshair' : 'grab',
          userSelect: 'none',
        }}
        onMouseDown={onCanvasMouseDown}
        onMouseMove={onCanvasMouseMove}
        onMouseUp={onCanvasMouseUp}
        onContextMenu={e => e.preventDefault()}
      >
        <TransformWrapper
          initialScale={0.9}
          initialPositionX={60}
          initialPositionY={40}
          minScale={0.2}
          maxScale={2}
          wheel={{ step: 0.1 }}
          panning={{ disabled: zoomMode }}   // disable panning while in box-zoom mode
          doubleClick={{ disabled: true }}
          onInit={ref => (zoomApiRef.current = ref)}
        >
          {({ zoomIn, zoomOut, resetTransform, state: { scale } }) => (
            <>
              {/* Toolbar */}
              {graph && (
                <div style={{ position:'absolute', top:10, left:10, right:10, zIndex:20, display:'flex', alignItems:'center', gap:8, pointerEvents:'none' }}>
                  <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:600, color:'#64748b', display:'flex', alignItems:'center', gap:6, pointerEvents:'auto' }}>
                    <span className="material-symbols-outlined" style={{ fontSize:14, color:'#f97316' }}>account_tree</span>
                    {sourceTab?.name ?? 'Flow'} — {nodes.length} nodes
                  </div>
                  {playMode && (
                    <div style={{ padding:'4px 10px', borderRadius:20, fontSize:10, fontWeight:700,
                      background:playMode==='execution'?'#dcfce7':'#dbeafe', color:playMode==='execution'?'#15803d':'#1d4ed8',
                      border:`1px solid ${playMode==='execution'?'#86efac':'#93c5fd'}` }}>
                      {playMode==='execution'?'⚡ EXECUTION':'🔵 SIMULATION'}
                    </div>
                  )}
                  {zoomMode && (
                    <div style={{ padding:'4px 10px', borderRadius:20, fontSize:10, fontWeight:700, background:'#fef3c7', color:'#b45309', border:'1px solid #fcd34d' }}>
                      🔍 Z-ZOOM — drag a rectangle
                    </div>
                  )}
                  <div style={{ flex:1 }} />
                  {/* Zoom controls */}
                  <button key="zo" style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 7px', cursor:'pointer', fontSize:11, color:'#64748b', display:'flex', alignItems:'center', pointerEvents:'auto' }}
                    onClick={() => zoomOut()}>
                    <span className="material-symbols-outlined" style={{ fontSize:15 }}>zoom_out</span>
                  </button>
                  <span key="pct" style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 8px', fontSize:11, fontWeight:600, color:'#64748b', pointerEvents:'auto' }}>
                    {Math.round(scale * 100)}%
                  </span>
                  <button key="zi" style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 7px', cursor:'pointer', fontSize:11, color:'#64748b', display:'flex', alignItems:'center', pointerEvents:'auto' }}
                    onClick={() => zoomIn()}>
                    <span className="material-symbols-outlined" style={{ fontSize:15 }}>zoom_in</span>
                  </button>
                  <button key="fit" style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 7px', cursor:'pointer', fontSize:11, color:'#64748b', display:'flex', alignItems:'center', pointerEvents:'auto' }}
                    onClick={() => resetTransform()}>
                    <span className="material-symbols-outlined" style={{ fontSize:15 }}>fit_screen</span>
                  </button>
                </div>
              )}

              {/* Pan/zoom content */}
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '3000px', height: '2000px' }}
              >
                {graph && (
                  <>
                    <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', overflow:'visible' }}>
                      <defs>
                        {[['gray','#94a3b8'],['red','#ef4444'],['amber','#f59e0b']].map(([id,fill]) => (
                          <marker key={id as string} id={`arr-${id}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                            <path d="M0,0 L7,3.5 L0,7 z" fill={fill as string} />
                          </marker>
                        ))}
                      </defs>
                      {renderEdges()}
                    </svg>
                    {nodes.map(n => (
                      <NodeCard key={n.id} node={n}
                        selected={selected===n.id}
                        status={nodeStatus[n.id]??'idle'}
                        riskReasons={riskMap[n.id]??[]}
                        onClick={() => setSelected(s => s===n.id ? null : n.id)}
                      />
                    ))}
                  </>
                )}
              </TransformComponent>
            </>
          )}
        </TransformWrapper>

        {/* Loading overlay */}
        {analyzing && (
          <div style={{ position:'absolute', inset:0, background:'rgba(248,250,252,0.92)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, zIndex:30 }}>
            <div style={{ position:'relative', width:56, height:56 }}>
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'4px solid #f1f5f9' }} />
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:'4px solid #f97316', borderTopColor:'transparent', animation:'spin 1s linear infinite' }} />
              <span className="material-symbols-outlined" style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, color:'#f97316' }}>account_tree</span>
            </div>
            <p style={{ fontSize:13, fontWeight:600, color:'#64748b' }}>Building flow graph…</p>
          </div>
        )}

        {/* Empty state overlay */}
        {!analyzing && !graph && (
          <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12, zIndex:30 }}>
            <span className="material-symbols-outlined" style={{ fontSize:52, color:'#e2e8f0' }}>account_tree</span>
            <p style={{ fontSize:13, fontWeight:600, color:'#94a3b8' }}>
              {sourceTab ? `Generating flow for ${sourceTab.name}…` : 'No source file open'}
            </p>
            {sourceTab && (
              <button onClick={analyze} style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 18px', borderRadius:20, background:'#0f172a', color:'white', border:'none', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                <span className="material-symbols-outlined" style={{ fontSize:15 }}>account_tree</span>Generate Flow
              </button>
            )}
          </div>
        )}

        {/* Z-zoom rectangle overlay */}
        {zoomRect && zoomRect.w > 4 && zoomRect.h > 4 && (
          <div style={{ position:'absolute', left:zoomRect.x, top:zoomRect.y, width:zoomRect.w, height:zoomRect.h,
            border:'2px solid #f97316', background:'rgba(249,115,22,0.06)', pointerEvents:'none', zIndex:40,
            borderRadius:3, boxShadow:'0 0 0 1px rgba(249,115,22,0.3)' }} />
        )}

        <div style={{ position:'absolute', bottom:10, left:12, fontSize:10, color:'#94a3b8', pointerEvents:'none' }}>
          Drag to pan · Scroll to zoom · Hold Z + drag to box-zoom
        </div>
      </div>

      <RightPanel
        mode={playMode} running={running} logs={logs} stats={stats}
        onPlay={handlePlay} onReset={handleReset} onStop={handleStop} onRegenerate={handleRegenerate}
      />
    </div>
  );
};
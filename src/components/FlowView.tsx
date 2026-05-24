import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { Tab } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FNode {
  id: string; nodeType: string; label: string; sub?: string;
  description?: string; errorMsg?: string; line?: number | null;
  position: { x: number; y: number }; width: number; height: number;
}
interface FEdge { id: string; source: string; target: string; label?: string; kind?: 'normal'|'branch'|'error' }
interface FlowGraph { nodes: FNode[]; edges: FEdge[]; error?: string }
interface LogEntry  { text: string; kind: 'info'|'success'|'error'|'ai'|'warn' }

type NodeStatus = 'idle'|'running'|'success'|'error'|'predicted'|'risk'|'skipped';
type PlayMode   = 'execution'|'simulation'|null;

// ── Node visual config ────────────────────────────────────────────────────────
const NCFG: Record<string, { bg: string; border: string; icon: string; tag: string; tagColor: string; tagBg: string }> = {
  entry:    { bg:'#f0fdf4', border:'#16a34a', icon:'play_arrow',    tag:'ENTRY',  tagColor:'#15803d', tagBg:'#dcfce7' },
  exit:     { bg:'#fef2f2', border:'#dc2626', icon:'stop',          tag:'EXIT',   tagColor:'#b91c1c', tagBg:'#fee2e2' },
  call:     { bg:'#ffffff', border:'#e2e8f0', icon:'code',          tag:'DO',     tagColor:'#0284c7', tagBg:'#e0f2fe' },
  decision: { bg:'#fffbeb', border:'#f59e0b', icon:'device_hub',    tag:'IF',     tagColor:'#b45309', tagBg:'#fef3c7' },
  loop:     { bg:'#f5f3ff', border:'#7c3aed', icon:'autorenew',     tag:'LOOP',   tagColor:'#6d28d9', tagBg:'#ede9fe' },
  error:    { bg:'#fff1f2', border:'#e11d48', icon:'error_outline', tag:'ERROR',  tagColor:'#be123c', tagBg:'#ffe4e6' },
  value:    { bg:'#f0f9ff', border:'#0284c7', icon:'data_object',   tag:'VALUE',  tagColor:'#0369a1', tagBg:'#e0f2fe' },
  import:   { bg:'#f0f9ff', border:'#0284c7', icon:'inventory_2',   tag:'IMPORT', tagColor:'#0369a1', tagBg:'#e0f2fe' },
};
const cfg = (t: string) => NCFG[t] ?? NCFG.call;
const NODE_W = 260;

// ── Status overlay colours ────────────────────────────────────────────────────
const STATUS_STYLE: Record<NodeStatus, { border: string; bg: string; glow?: string }> = {
  idle:      { border: '',        bg: ''        },
  running:   { border: '#f97316', bg: '#fff7ed', glow: 'rgba(249,115,22,0.25)' },
  success:   { border: '#16a34a', bg: '#f0fdf4', glow: 'rgba(22,163,74,0.15)'  },
  error:     { border: '#dc2626', bg: '#fff1f2', glow: 'rgba(220,38,38,0.2)'   },
  predicted: { border: '#0ea5e9', bg: '#f0f9ff', glow: 'rgba(14,165,233,0.15)' },
  risk:      { border: '#f59e0b', bg: '#fffbeb', glow: 'rgba(245,158,11,0.2)'  },
  skipped:   { border: '#cbd5e1', bg: '#f8fafc'  },
};

// ── Edge path helper ──────────────────────────────────────────────────────────
function orthogonalPath(sx: number, sy: number, tx: number, ty: number): string {
  const midY = sy + Math.max(30, (ty - sy) / 2);
  if (Math.abs(sx - tx) < 4) return `M ${sx} ${sy} L ${tx} ${ty}`;
  return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
}

// ── NodeCard ──────────────────────────────────────────────────────────────────
const NodeCard: React.FC<{
  node: FNode; selected: boolean; status: NodeStatus;
  riskReasons?: string[];
  onClick: () => void;
}> = ({ node, selected, status, riskReasons = [], onClick }) => {
  const d         = (node as any).data ?? node;
  const nodeType  = d.nodeType  ?? node.nodeType  ?? 'call';
  const label     = d.label     ?? node.label     ?? node.id;
  const desc      = d.description ?? node.description ?? null;
  const errMsg    = d.errorMsg  ?? node.errorMsg  ?? null;
  const c         = cfg(nodeType);

  const st        = STATUS_STYLE[status];
  const border    = selected ? '#f97316' : st.border || c.border;
  const bg        = st.bg    || c.bg;
  const shadow    = selected
    ? '0 0 0 3px rgba(249,115,22,0.25), 0 4px 16px rgba(0,0,0,0.1)'
    : st.glow
      ? `0 0 0 2px ${st.glow}, 0 2px 10px rgba(0,0,0,0.07)`
      : '0 2px 8px rgba(0,0,0,0.07)';

  const iconName =
    status === 'running'   ? 'autorenew'        :
    status === 'success'   ? 'check_circle'     :
    status === 'error'     ? 'error'            :
    status === 'risk'      ? 'warning'          :
    status === 'predicted' ? 'trending_flat'    :
    status === 'skipped'   ? 'remove_circle'    : c.icon;

  const iconBg =
    status === 'running'   ? '#f97316' :
    status === 'success'   ? '#16a34a' :
    status === 'error'     ? '#dc2626' :
    status === 'risk'      ? '#f59e0b' :
    status === 'predicted' ? '#0ea5e9' :
    status === 'skipped'   ? '#94a3b8' : border;

  return (
    <div
      data-node-id={node.id}
      style={{ position:'absolute', left:node.position.x, top:node.position.y,
        width:NODE_W, background:bg, border:`2px solid ${border}`,
        borderRadius:12, cursor:'grab', userSelect:'none',
        boxShadow:shadow, transition:'border-color 0.2s,box-shadow 0.2s,background 0.2s', zIndex:selected?10:5 }}
      onClick={onClick}
    >
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px 6px' }}>
        <div style={{ width:32, height:32, borderRadius:7, flexShrink:0, background:iconBg,
          display:'flex', alignItems:'center', justifyContent:'center', transition:'background 0.2s' }}>
          <span className="material-symbols-outlined" style={{ fontSize:17, color:'white',
            animation: status === 'running' ? 'spin 1s linear infinite' : 'none' }}>
            {iconName}
          </span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', lineHeight:1.3, wordBreak:'break-word' }}>
            {label}
          </div>
          {node.sub && <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{node.sub}</div>}
          {node.line && <div style={{ fontSize:9, color:'#94a3b8', marginTop:1, fontFamily:'monospace' }}>line {node.line}</div>}
        </div>
      </div>

      {/* Tag + status badge row */}
      <div style={{ paddingLeft:14, paddingBottom:6, display:'flex', alignItems:'center', gap:6 }}>
        <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.6px',
          background:c.tagBg, color:c.tagColor, padding:'2px 6px', borderRadius:4 }}>
          {c.tag}
        </span>
        {status !== 'idle' && (
          <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.5px', padding:'2px 6px', borderRadius:4,
            background: st.glow ? st.bg : '#f1f5f9',
            color: border, border: `1px solid ${border}` }}>
            {status.toUpperCase()}
          </span>
        )}
      </div>

      {/* Body */}
      {(desc || errMsg) && (
        <div style={{ margin:'0 14px 10px', borderTop:`1px dashed ${border}`, paddingTop:7 }}>
          {desc && (
            <div style={{ fontFamily:'monospace', fontSize:11,
              color: status==='success' ? '#15803d' : status==='error' ? '#dc2626' : '#64748b', lineHeight:1.4 }}>
              {desc}
            </div>
          )}
          {errMsg && (
            <div style={{ fontFamily:'monospace', fontSize:11, color:'#dc2626',
              background:'#fef2f2', borderRadius:4, padding:'3px 6px', marginTop:4 }}>
              {errMsg}
            </div>
          )}
        </div>
      )}

      {/* Risk warnings */}
      {status === 'risk' && riskReasons.length > 0 && (
        <div style={{ margin:'0 14px 10px', background:'#fffbeb', border:'1px solid #fcd34d',
          borderRadius:6, padding:'6px 8px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#b45309', marginBottom:3 }}>
            ⚠ Static analysis warnings
          </div>
          {riskReasons.map((r, i) => (
            <div key={i} style={{ fontSize:10, color:'#92400e', lineHeight:1.4 }}>• {r}</div>
          ))}
        </div>
      )}

      {/* Error — AI fix prompt */}
      {status === 'error' && (
        <div style={{ margin:'0 14px 10px', background:'#f5f3ff', border:'1px solid #a78bfa',
          borderRadius:6, padding:'8px 10px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#7c3aed', marginBottom:4 }}>
            <span className="material-symbols-outlined" style={{ fontSize:12, verticalAlign:'middle', marginRight:3 }}>memory</span>
            AI Fix Suggestion available
          </div>
          <div style={{ fontSize:10, color:'#6d28d9', lineHeight:1.4 }}>
            Open Chat → Bug Fix for an AI-assisted repair suggestion.
          </div>
        </div>
      )}
    </div>
  );
};

// ── Right panel ───────────────────────────────────────────────────────────────
const RightPanel: React.FC<{
  mode: PlayMode; running: boolean; logs: LogEntry[];
  stats: { executed: number; errors: number; risks: number; predicted: number; total: number } | null;
  onPlay: () => void; onReset: () => void; onStop: () => void;
}> = ({ mode, running, logs, stats, onPlay, onReset, onStop }) => {
  const logsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);

  return (
    <div style={{ width:300, borderLeft:'1px solid #e2e8f0', background:'#fff',
      display:'flex', flexDirection:'column', flexShrink:0 }}>

      {/* Mode badge */}
      {mode && (
        <div style={{
          padding:'8px 12px', borderBottom:'1px solid #e2e8f0',
          background: mode === 'execution' ? '#f0fdf4' : '#eff6ff',
          display:'flex', alignItems:'center', gap:8,
        }}>
          <span className="material-symbols-outlined" style={{
            fontSize:15, color: mode === 'execution' ? '#16a34a' : '#3b82f6' }}>
            {mode === 'execution' ? 'bolt' : 'analytics'}
          </span>
          <div>
            <div style={{ fontSize:11, fontWeight:700,
              color: mode === 'execution' ? '#15803d' : '#1d4ed8' }}>
              {mode === 'execution' ? '⚡ EXECUTION MODE' : '🔵 SIMULATION MODE'}
            </div>
            <div style={{ fontSize:10, color:'#64748b' }}>
              {mode === 'execution' ? 'Real subprocess run' : 'Static flow analysis'}
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ padding:'8px 12px', borderBottom:'1px solid #e2e8f0',
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
          {[
            { label:'Executed', val: stats.executed, color:'#16a34a' },
            { label:'Errors',   val: stats.errors,   color:'#dc2626' },
            { label:'Risks',    val: stats.risks,     color:'#f59e0b' },
            { label:'Predicted',val: stats.predicted, color:'#0ea5e9' },
          ].map(s => (
            <div key={s.label} style={{ background:'#f8fafc', borderRadius:6,
              padding:'4px 8px', borderLeft:`3px solid ${s.color}` }}>
              <div style={{ fontSize:16, fontWeight:800, color:s.color, lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:9, color:'#94a3b8', fontWeight:600 }}>{s.label.toUpperCase()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ padding:'10px 12px', borderBottom:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:6 }}>
        {running ? (
          <button onClick={onStop} style={{ width:'100%', padding:'8px 0',
            background:'#dc2626', color:'white', border:'none', borderRadius:7,
            fontSize:12, fontWeight:700, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <span className="material-symbols-outlined" style={{ fontSize:16 }}>stop</span>
            Stop
          </button>
        ) : (
          <button onClick={onPlay} style={{ width:'100%', padding:'8px 0',
            background:'#16a34a', color:'white', border:'none', borderRadius:7,
            fontSize:12, fontWeight:700, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            <span className="material-symbols-outlined" style={{ fontSize:16 }}>play_arrow</span>
            {mode ? 'Run Again' : 'Run / Simulate'}
          </button>
        )}
        <button onClick={onReset} style={{ width:'100%', padding:'6px 0',
          background:'white', color:'#64748b', border:'1px solid #e2e8f0',
          borderRadius:7, fontSize:12, fontWeight:600, cursor:'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
          <span className="material-symbols-outlined" style={{ fontSize:14 }}>refresh</span>
          Reset
        </button>
      </div>

      {/* Legend */}
      <div style={{ padding:'8px 12px', borderBottom:'1px solid #e2e8f0' }}>
        <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px',
          color:'#94a3b8', marginBottom:5 }}>Legend</div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 10px' }}>
          {[
            { color:'#16a34a', label:'Executed'  },
            { color:'#dc2626', label:'Error'     },
            { color:'#f59e0b', label:'Risk'      },
            { color:'#0ea5e9', label:'Predicted' },
            { color:'#94a3b8', label:'Skipped'   },
          ].map(l => (
            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
              <div style={{ width:8, height:8, borderRadius:2, background:l.color }} />
              <span style={{ fontSize:10, color:'#64748b' }}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Output log */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0 }}>
        <div style={{ padding:'6px 12px 4px', fontSize:10, fontWeight:700,
          textTransform:'uppercase', letterSpacing:'0.5px', color:'#94a3b8',
          borderBottom:'1px solid #f1f5f9', flexShrink:0 }}>
          Output
        </div>
        <div ref={logsRef} style={{ flex:1, overflowY:'auto', padding:'6px 8px',
          display:'flex', flexDirection:'column', gap:2 }}>
          {logs.map((l, i) => (
            <div key={i} style={{
              fontSize:10.5, fontFamily:'monospace', lineHeight:1.4,
              padding:'3px 8px', borderRadius:4,
              borderLeft:`3px solid ${
                l.kind==='success' ? '#16a34a' :
                l.kind==='error'   ? '#dc2626' :
                l.kind==='warn'    ? '#f59e0b' :
                l.kind==='ai'      ? '#7c3aed' : '#94a3b8'}`,
              background:
                l.kind==='success' ? '#f0fdf4' :
                l.kind==='error'   ? '#fef2f2' :
                l.kind==='warn'    ? '#fffbeb' :
                l.kind==='ai'      ? '#f5f3ff' : '#f8fafc',
              color:
                l.kind==='success' ? '#15803d' :
                l.kind==='error'   ? '#b91c1c' :
                l.kind==='warn'    ? '#92400e' :
                l.kind==='ai'      ? '#6d28d9' : '#475569',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {l.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// FlowView
// ══════════════════════════════════════════════════════════════════════════════
export const FlowView: React.FC<{ flowTab?: Tab }> = ({ flowTab }) => {
  const { state } = useAppState();

  const sourceTab = flowTab?.flowSourceTabId
    ? state.tabs.find((t: Tab) => t.id === flowTab!.flowSourceTabId)
    : state.tabs.find((t: Tab) => t.id === state.activeTabId && t.tabType !== 'flow');

  const [graph,      setGraph]      = useState<FlowGraph | null>(null);
  const [nodes,      setNodes]      = useState<FNode[]>([]);
  const [analyzing,  setAnalyzing]  = useState(false);
  const [selected,   setSelected]   = useState<string | null>(null);
  const [pan,        setPan]        = useState({ x:60, y:40 });
  const [zoom,       setZoom]       = useState(0.9);
  const [logs,       setLogs]       = useState<LogEntry[]>([{ text:'Ready. Press Run to execute or simulate.', kind:'info' }]);
  const [running,    setRunning]    = useState(false);
  const [playMode,   setPlayMode]   = useState<PlayMode>(null);
  const [nodeStatus, setNodeStatus] = useState<Record<string, NodeStatus>>({});
  const [riskMap,    setRiskMap]    = useState<Record<string, string[]>>({});
  const [stats,      setStats]      = useState<{ executed:number; errors:number; risks:number; predicted:number; total:number } | null>(null);

  const canvasRef    = useRef<HTMLDivElement>(null);
  const isPanning    = useRef(false);
  const lastMouse    = useRef({ x: 0, y: 0 });
  const draggingId   = useRef<string | null>(null);
  const zoomRef      = useRef(zoom);
  const abortRef     = useRef(false);
  const [isPanningState, setIsPanningState] = useState(false);

  // Keep zoomRef current so the mousemove closure always has the latest zoom
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // ── Unified native pointer handling ───────────────────────────────────────
  // All mouse events are wired natively so Electron's Chromium never loses
  // the capture between React synthetic dispatch and native window listeners.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;

      // Walk up from the click target to find a node card
      const nodeEl = (e.target as Element).closest('[data-node-id]') as HTMLElement | null;

      if (nodeEl?.dataset.nodeId) {
        // ── Node drag ────────────────────────────────────────────────────
        draggingId.current = nodeEl.dataset.nodeId;
        lastMouse.current  = { x: e.clientX, y: e.clientY };
      } else {
        // ── Canvas pan ───────────────────────────────────────────────────
        isPanning.current = true;
        setIsPanningState(true);
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
      e.preventDefault();   // stop text-select; keep inside one effect
    };

    const onMove = (e: MouseEvent) => {
      if (isPanning.current) {
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        lastMouse.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (draggingId.current) {
        const z  = zoomRef.current;
        const dx = (e.clientX - lastMouse.current.x) / z;
        const dy = (e.clientY - lastMouse.current.y) / z;
        setNodes(ns => ns.map(n =>
          n.id === draggingId.current
            ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } }
            : n
        ));
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onUp = () => {
      isPanning.current  = false;
      draggingId.current = null;
      setIsPanningState(false);
    };

    // mousedown on the canvas element, move/up on window so drag works
    // even when the pointer leaves the canvas bounds.
    el.addEventListener('mousedown',  onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      el.removeEventListener('mousedown',  onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, []); // no deps — zoomRef keeps zoom fresh without re-registering

  const addLog = useCallback((text: string, kind: LogEntry['kind'] = 'info') =>
    setLogs(l => [...l, { text, kind }]), []);

  const resetStatuses = useCallback((ns: FNode[]) => {
    const m: Record<string, NodeStatus> = {};
    ns.forEach(n => { m[n.id] = 'idle'; });
    setNodeStatus(m);
    setRiskMap({});
    setStats(null);
  }, []);

  // ── Build flow graph via AI ───────────────────────────────────────────────
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
        addLog(`[Flow] ${result.nodes.length} nodes, ${result.edges?.length ?? 0} edges`, 'success');
      } else {
        addLog(result?.error ?? 'No flow data', 'error');
      }
    } catch (e: any) { addLog(`[Error] ${e?.message}`, 'error'); }
    finally { setAnalyzing(false); }
  }, [sourceTab, resetStatuses, addLog]);

  const analyzeRef = useRef(analyze);
  useEffect(() => { analyzeRef.current = analyze; });
  useEffect(() => {
    const t = setTimeout(() => { if (sourceTab?.content) analyzeRef.current(); }, 120);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const computeStats = useCallback((statuses: Record<string, NodeStatus>) => {
    const vals = Object.values(statuses);
    setStats({
      executed:  vals.filter(s => s === 'success').length,
      errors:    vals.filter(s => s === 'error').length,
      risks:     vals.filter(s => s === 'risk').length,
      predicted: vals.filter(s => s === 'predicted').length,
      total:     vals.length,
    });
  }, []);

  // Find the node closest to an error line number
  const nodeForLine = useCallback((errorLine: number): string | null => {
    if (!nodes.length) return null;
    // 1) Try nodes that have explicit line numbers
    const withLines = nodes.filter(n => n.line != null);
    if (withLines.length > 0) {
      const best = withLines.reduce((prev, curr) =>
        Math.abs((curr.line ?? 0) - errorLine) < Math.abs((prev.line ?? 0) - errorLine) ? curr : prev
      );
      if (Math.abs((best.line ?? 0) - errorLine) < 30) return best.id;
    }
    // 2) Fallback — return the last non-exit node in Y order
    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
    const nonExit = sorted.filter(n => (n.nodeType ?? 'call') !== 'exit');
    return (nonExit.at(-1) ?? sorted.at(-1))?.id ?? null;
  }, [nodes]);

  // ── EXECUTION MODE ────────────────────────────────────────────────────────
  const runExecution = useCallback(async (language: string) => {
    if (!sourceTab || !graph) return;
    addLog(`[⚡ Exec] Running ${sourceTab.name}…`, 'info');

    const fresh: Record<string, NodeStatus> = {};
    nodes.forEach(n => { fresh[n.id] = 'idle'; });
    setNodeStatus({ ...fresh });

    const result = await (window as any).electronAPI?.runFlow?.({
      code: sourceTab.content, language, filePath: sourceTab.path,
    });

    if (!result) { addLog('[Error] No response from execution engine', 'error'); return; }

    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);

    if (result.success) {
      // All nodes green
      sorted.forEach(n => { fresh[n.id] = 'success'; });
      setNodeStatus({ ...fresh });
      addLog(`✓ Exit 0${result.timedOut ? ' (timeout)' : ''}`, 'success');
      if (result.stdout) result.stdout.split('\n').forEach((l: string) => addLog(l, 'success'));
    } else {
      // Mark executed nodes green up to the crash point, then red, then skipped
      const errorLine  = result.errorLine;
      const errorNodeId = errorLine ? nodeForLine(errorLine) : null;

      let hitError = false;
      for (const node of sorted) {
        if (!hitError) {
          if (node.id === errorNodeId) { fresh[node.id] = 'error'; hitError = true; }
          else fresh[node.id] = 'success';
        } else {
          fresh[node.id] = 'skipped';
        }
      }
      // If we never found the error node, mark last node as error
      if (!hitError && sorted.length) {
        const last = sorted[sorted.length - 1];
        fresh[last.id] = 'error';
        sorted.slice(0, -1).forEach(n => { fresh[n.id] = 'success'; });
      }

      setNodeStatus({ ...fresh });
      addLog(`✗ Exit ${result.exitCode}${result.timedOut ? ' (timeout)' : ''}`, 'error');
      if (result.phase === 'compile') addLog('[Compile error]', 'error');
      if (result.stderr) result.stderr.split('\n').slice(0, 20).forEach((l: string) => addLog(l, 'error'));
      if (result.stdout) result.stdout.split('\n').forEach((l: string) => addLog(l, 'info'));
    }
    computeStats(fresh);
  }, [sourceTab, graph, nodes, nodeForLine, addLog, computeStats]);

  // ── SIMULATION MODE ───────────────────────────────────────────────────────
  const runSimulation = useCallback(async (language: string) => {
    if (!graph) return;
    addLog(`[🔵 Sim] Static analysis of ${sourceTab?.name}…`, 'ai');

    const result = await (window as any).electronAPI?.simulateFlow?.({
      code: sourceTab?.content ?? '', language, nodes,
    });

    if (!result) { addLog('[Error] Simulation engine failed', 'error'); return; }

    const fresh: Record<string, NodeStatus> = {};
    nodes.forEach(n => { fresh[n.id] = 'idle'; });

    (result.executedNodes  ?? []).forEach((id: string) => { fresh[id] = 'success';   });
    (result.predictedNodes ?? []).forEach((id: string) => { fresh[id] = 'predicted'; });

    const newRiskMap: Record<string, string[]> = {};
    (result.riskNodes ?? []).forEach(({ id, risks }: { id: string; risks: string[] }) => {
      fresh[id] = 'risk';
      newRiskMap[id] = risks;
    });

    setNodeStatus(fresh);
    setRiskMap(newRiskMap);
    computeStats(fresh);

    addLog(`Predicted ${(result.executedNodes ?? []).length} executed, ${(result.riskNodes ?? []).length} risky, ${(result.predictedNodes ?? []).length} conditional`, 'info');
    if (result.fileRisks?.length) {
      addLog(`File-level risks: ${result.fileRisks.join(', ')}`, 'warn');
    }
    addLog('Note: simulation is approximate — no code was executed.', 'ai');
  }, [sourceTab, graph, nodes, addLog, computeStats]);

  // ── Play button ───────────────────────────────────────────────────────────
  const handlePlay = useCallback(async () => {
    if (!sourceTab || !graph || running) return;
    setRunning(true); abortRef.current = false;
    setLogs([{ text:`[Play] Starting…`, kind:'info' }]);
    resetStatuses(nodes);

    const language = sourceTab.language ?? 'plaintext';

    // Detect mode
    const modeRes = await (window as any).electronAPI?.detectFlowMode?.({
      language, filePath: sourceTab.path,
    });

    const mode: PlayMode = modeRes?.mode ?? 'simulation';
    setPlayMode(mode);
    addLog(
      mode === 'execution'
        ? `[Mode] ⚡ EXECUTION — ${modeRes?.reason}`
        : `[Mode] 🔵 SIMULATION — ${modeRes?.reason ?? 'static analysis'}`,
      mode === 'execution' ? 'success' : 'ai'
    );

    if (abortRef.current) { setRunning(false); return; }

    if (mode === 'execution') {
      await runExecution(language);
    } else {
      await runSimulation(language);
    }

    setRunning(false);
  }, [sourceTab, graph, running, nodes, resetStatuses, addLog, runExecution, runSimulation]);

  const handleStop = () => { abortRef.current = true; setRunning(false); addLog('[Stopped]', 'warn'); };

  const handleReset = () => {
    resetStatuses(nodes); setPlayMode(null);
    setLogs([{ text:'Reset. Press Run to execute or simulate.', kind:'info' }]);
  };

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.25, z - e.deltaY * 0.001)));
  };

  // ── Edge render ───────────────────────────────────────────────────────────
  const renderEdges = () => {
    if (!graph) return null;
    const byId: Record<string, FNode> = {};
    nodes.forEach(n => { byId[n.id] = n; });

    return graph.edges.map(edge => {
      const src = byId[edge.source], tgt = byId[edge.target];
      if (!src || !tgt) return null;
      const sw = src.width ?? NODE_W;
      const sx = src.position.x + sw / 2,      sy = src.position.y + (src.height ?? 100) + 4;
      const tx = tgt.position.x + (tgt.width ?? NODE_W) / 2, ty = tgt.position.y - 4;
      const isErr  = edge.kind === 'error'  || ['raises','error','catch'].includes(edge.label ?? '');
      const isBr   = edge.kind === 'branch' || ['false','no','else','if not record'].includes(edge.label ?? '');
      const stroke = isErr ? '#ef4444' : isBr ? '#f59e0b' : '#94a3b8';
      return (
        <g key={edge.id}>
          <path d={orthogonalPath(sx,sy,tx,ty)} fill="none" stroke={stroke}
            strokeWidth={isErr ? 2.5 : 2} strokeDasharray={isErr ? '6 3' : undefined}
            markerEnd={`url(#arr-${isErr?'red':isBr?'amber':'gray'})`} />
          {edge.label && (
            <g transform={`translate(${(sx+tx)/2},${sy+(ty-sy)/2})`}>
              <rect x={-32} y={-9} width={64} height={18} rx={4} fill="white" stroke={stroke} strokeWidth={1} />
              <text textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={600} fill={stroke}>{edge.label}</text>
            </g>
          )}
        </g>
      );
    });
  };

  // ── Loading / empty states ────────────────────────────────────────────────
  if (analyzing) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#f8fafc]">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
        <div className="absolute inset-0 rounded-full border-4 border-orange-400 border-t-transparent animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center material-symbols-outlined text-[22px] text-orange-400">account_tree</span>
      </div>
      <p className="text-[13px] font-semibold text-gray-600">Building flow graph…</p>
    </div>
  );

  if (!graph) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#f8fafc]">
      <span className="material-symbols-outlined text-[52px] text-gray-200">account_tree</span>
      <p className="text-[13px] font-semibold text-gray-500">Flow Diagram</p>
      <p className="text-[12px] text-gray-400 max-w-xs text-center">
        {sourceTab ? `Generating flow for ${sourceTab.name}…` : 'No source file selected'}
      </p>
      <button onClick={analyze}
        className="flex items-center gap-2 px-5 py-2 rounded-full bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-700 transition-all">
        <span className="material-symbols-outlined text-[15px]">account_tree</span>Generate Flow
      </button>
    </div>
  );

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', background:'#f8fafc' }}>
      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div
        ref={canvasRef}
        style={{ flex:1, position:'relative', overflow:'hidden',
          backgroundImage:'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize:'20px 20px',
          cursor: isPanningState ? 'grabbing' : 'grab' }}
        onWheel={onWheel}
        onContextMenu={e => e.preventDefault()}
      >

        {/* Toolbar */}
        <div style={{ position:'absolute', top:10, left:10, right:10, zIndex:20,
          display:'flex', alignItems:'center', gap:8, pointerEvents:'none' }}>

          {/* File + graph info */}
          <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:8,
            padding:'5px 10px', fontSize:11, fontWeight:600, color:'#64748b',
            display:'flex', alignItems:'center', gap:6, pointerEvents:'auto' }}>
            <span className="material-symbols-outlined" style={{ fontSize:14, color:'#f97316' }}>account_tree</span>
            {sourceTab?.name ?? 'Flow'} — {nodes.length} nodes
          </div>

          {/* Mode pill */}
          {playMode && (
            <div style={{
              padding:'4px 10px', borderRadius:20, fontSize:10, fontWeight:700,
              background: playMode === 'execution' ? '#dcfce7' : '#dbeafe',
              color:      playMode === 'execution' ? '#15803d' : '#1d4ed8',
              border:     `1px solid ${playMode === 'execution' ? '#86efac' : '#93c5fd'}`,
            }}>
              {playMode === 'execution' ? '⚡ EXECUTION' : '🔵 SIMULATION'}
            </div>
          )}

          <div style={{ flex:1 }} />

          {/* Zoom controls */}
          {[['zoom_out',''], [null, `${Math.round(zoom*100)}%`], ['zoom_in',''], ['fit_screen','']].map(([icon, label], i) =>
            icon ? (
              <button key={i} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6,
                padding:'4px 7px', cursor:'pointer', fontSize:11, fontWeight:600, color:'#64748b',
                display:'flex', alignItems:'center', gap:3, pointerEvents:'auto' }}
                onClick={() => icon === 'zoom_out' ? setZoom(z => Math.max(0.25, z-0.1))
                  : icon === 'zoom_in' ? setZoom(z => Math.min(2, z+0.1))
                  : (setZoom(0.9), setPan({x:60,y:40}))}>
                <span className="material-symbols-outlined" style={{ fontSize:15 }}>{icon}</span>
              </button>
            ) : (
              <span key={i} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6,
                padding:'4px 8px', fontSize:11, fontWeight:600, color:'#64748b', pointerEvents:'auto' }}>
                {label}
              </span>
            )
          )}

          <button style={{ background:'#0f172a', border:'none', borderRadius:6, padding:'5px 12px',
            cursor:'pointer', fontSize:11, fontWeight:700, color:'white',
            display:'flex', alignItems:'center', gap:5, pointerEvents:'auto' }}
            onClick={analyze}>
            <span className="material-symbols-outlined" style={{ fontSize:14 }}>refresh</span>
            Regenerate
          </button>
        </div>

        {/* Pan/zoom layer */}
        <div style={{ transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          transformOrigin:'0 0', position:'absolute', width:3000, height:2000 }}>
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%',
            pointerEvents:'none', overflow:'visible' }}>
            <defs>
              {[['gray','#94a3b8'],['red','#ef4444'],['amber','#f59e0b']].map(([id, fill]) => (
                <marker key={id as string} id={`arr-${id}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 z" fill={fill as string} />
                </marker>
              ))}
            </defs>
            {renderEdges()}
          </svg>

          {nodes.map(n => (
            <NodeCard key={n.id} node={n}
              selected={selected === n.id}
              status={nodeStatus[n.id] ?? 'idle'}
              riskReasons={riskMap[n.id] ?? []}
              onClick={() => setSelected(s => s === n.id ? null : n.id)}
            />
          ))}
        </div>

        {/* Bottom hint */}
        <div style={{ position:'absolute', bottom:10, left:12, fontSize:10, color:'#94a3b8', pointerEvents:'none' }}>
          Drag to pan · Scroll to zoom · Drag nodes to reposition
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <RightPanel
        mode={playMode} running={running} logs={logs} stats={stats}
        onPlay={handlePlay} onReset={handleReset} onStop={handleStop}
      />
    </div>
  );
};
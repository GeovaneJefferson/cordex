import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { Tab } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FNode {
  id: string;
  nodeType: string;
  label: string;
  sub?: string;
  description?: string;
  errorMsg?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
}
interface FEdge { id: string; source: string; target: string; label?: string; kind?: 'normal'|'branch'|'error' }
interface FlowGraph { nodes: FNode[]; edges: FEdge[]; error?: string }

// ── Execution log entry ───────────────────────────────────────────────────────
interface LogEntry { text: string; kind: 'info'|'success'|'error'|'ai' }

// ── Node config ───────────────────────────────────────────────────────────────
const NCFG: Record<string, { bg: string; border: string; icon: string; tag: string; tagColor: string; tagBg: string }> = {
  entry:    { bg:'#f0fdf4', border:'#16a34a', icon:'play_arrow',      tag:'ENTRY',    tagColor:'#15803d', tagBg:'#dcfce7' },
  exit:     { bg:'#fef2f2', border:'#dc2626', icon:'stop',            tag:'EXIT',     tagColor:'#b91c1c', tagBg:'#fee2e2' },
  call:     { bg:'#ffffff', border:'#e2e8f0', icon:'code',            tag:'DO THIS',  tagColor:'#0284c7', tagBg:'#e0f2fe' },
  decision: { bg:'#fffbeb', border:'#f59e0b', icon:'device_hub',      tag:'IF',       tagColor:'#b45309', tagBg:'#fef3c7' },
  loop:     { bg:'#f5f3ff', border:'#7c3aed', icon:'autorenew',       tag:'LOOP',     tagColor:'#6d28d9', tagBg:'#ede9fe' },
  error:    { bg:'#fff1f2', border:'#e11d48', icon:'error_outline',   tag:'ERROR',    tagColor:'#be123c', tagBg:'#ffe4e6' },
  value:    { bg:'#f0f9ff', border:'#0284c7', icon:'data_object',     tag:'VALUE',    tagColor:'#0369a1', tagBg:'#e0f2fe' },
  import:   { bg:'#f0f9ff', border:'#0284c7', icon:'inventory_2',     tag:'IMPORT',   tagColor:'#0369a1', tagBg:'#e0f2fe' },
};
const cfg = (t: string) => NCFG[t] ?? NCFG.call;

const NODE_W = 260;

// ── Orthogonal edge routing (straight lines, Manhattan style) ─────────────────
function orthogonalPath(sx: number, sy: number, tx: number, ty: number): string {
  const midY = sy + Math.max(30, (ty - sy) / 2);
  if (Math.abs(sx - tx) < 4) {
    // Straight vertical
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }
  // L-shape: down to midpoint, horizontal, down to target
  return `M ${sx} ${sy} L ${sx} ${midY} L ${tx} ${midY} L ${tx} ${ty}`;
}

// ── Single node card ──────────────────────────────────────────────────────────
const NodeCard: React.FC<{
  node: FNode; selected: boolean;
  onClick: () => void; onDragStart: (e: React.MouseEvent) => void;
  running?: boolean; status?: 'idle'|'running'|'success'|'error';
}> = ({ node, selected, onClick, onDragStart, status = 'idle' }) => {
  const c = cfg(node.nodeType);
  const borderColor = selected ? '#f97316' : status === 'success' ? '#16a34a' : status === 'error' ? '#dc2626' : c.border;
  const bg = status === 'success' ? '#f0fdf4' : status === 'error' ? '#fff1f2' : c.bg;

  return (
    <div
      style={{
        position: 'absolute', left: node.position.x, top: node.position.y,
        width: NODE_W, background: bg,
        border: `2px solid ${borderColor}`,
        borderRadius: 12, cursor: 'grab', userSelect: 'none',
        boxShadow: selected
          ? '0 0 0 3px rgba(249,115,22,0.2), 0 4px 16px rgba(0,0,0,0.1)'
          : '0 2px 8px rgba(0,0,0,0.07)',
        transition: 'border-color 0.25s, box-shadow 0.2s, background 0.25s',
        zIndex: selected ? 10 : 5,
      }}
      onMouseDown={onDragStart}
      onClick={onClick}
    >
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px 8px' }}>
        <div style={{
          width:32, height:32, borderRadius:7, flexShrink:0,
          background: status === 'running' ? '#f97316' : status === 'success' ? '#16a34a' : status === 'error' ? '#dc2626' : borderColor,
          display:'flex', alignItems:'center', justifyContent:'center',
          transition: 'background 0.25s',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize:17, color:'white' }}>
            {status === 'running' ? 'autorenew' : c.icon}
          </span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, color:'#0f172a', lineHeight:1.3, wordBreak:'break-word' }}>
            {node.label}
          </div>
          {node.sub && <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>{node.sub}</div>}
        </div>
      </div>

      {/* Tag */}
      <div style={{ paddingLeft:14, paddingBottom:6 }}>
        <span style={{ fontSize:9, fontWeight:700, letterSpacing:'0.6px',
          background:c.tagBg, color:c.tagColor, padding:'2px 6px', borderRadius:4 }}>
          {c.tag}
        </span>
      </div>

      {/* Body — description or runtime value */}
      {(node.description || node.errorMsg) && (
        <div style={{
          margin:'0 14px 10px', padding:'6px 8px',
          borderTop: `1px dashed ${borderColor}`,
          paddingTop:7,
        }}>
          {node.description && (
            <div style={{ fontFamily:'monospace', fontSize:11, color: status==='success' ? '#15803d' : '#64748b', lineHeight:1.4 }}>
              {node.description}
            </div>
          )}
          {node.errorMsg && (
            <div style={{ fontFamily:'monospace', fontSize:11, color:'#dc2626',
              background:'#fef2f2', borderRadius:4, padding:'3px 6px', marginTop:4 }}>
              {node.errorMsg}
            </div>
          )}
        </div>
      )}

      {/* Error: AI fix drawer */}
      {(node.nodeType === 'error' || (node.errorMsg && status === 'error')) && (
        <div style={{ margin:'0 14px 10px', background:'#f5f3ff', border:'1px solid #a78bfa',
          borderRadius:6, padding:'8px 10px' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#7c3aed', marginBottom:4 }}>
            <span className="material-symbols-outlined" style={{ fontSize:12, verticalAlign:'middle', marginRight:3 }}>memory</span>
            AI Fix Available
          </div>
          <button style={{ width:'100%', padding:'4px 8px', background:'#7c3aed', color:'white',
            border:'none', borderRadius:5, fontSize:10, fontWeight:600, cursor:'pointer' }}>
            Run In-Place Fix
          </button>
        </div>
      )}
    </div>
  );
};

// ── Right panel — code viewer + run + log ────────────────────────────────────
const RightPanel: React.FC<{
  sourceTab: Tab | undefined;
  onRun: () => void;
  onReset: () => void;
  running: boolean;
  logs: LogEntry[];
}> = ({ sourceTab, onRun, onReset, running, logs }) => {
  const logsRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight; }, [logs]);

  return (
    <div style={{ width:300, borderLeft:'1px solid #e2e8f0', background:'#ffffff', display:'flex', flexDirection:'column', flexShrink:0 }}>
      {/* Header */}
      {/* <div style={{ padding:'12px 14px 10px', borderBottom:'1px solid #e2e8f0', background:'#f8fafc' }}>
        <div style={{ fontSize:13, fontWeight:700, color:'#0f172a' }}>Universal Swap Workspace</div>
        <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
          {sourceTab ? `$ pytest ${sourceTab.path}` : 'Monitoring build toolchains'}
        </div>
      </div> */}

      {/* File tabs */}
      {/* {sourceTab && (
        <div style={{ display:'flex', background:'#f1f5f9', borderBottom:'1px solid #e2e8f0' }}>
          <div style={{ padding:'7px 12px', fontSize:11, fontWeight:600, background:'#0f172a', color:'white',
            display:'flex', alignItems:'center', gap:5, cursor:'pointer' }}>
            <span className="material-symbols-outlined" style={{ fontSize:13 }}>code</span>
            {sourceTab.name}
          </div>
        </div>
      )} */}

      {/* Code preview */}
      {/* <div style={{ flex:1, background:'#0f172a', padding:12, overflowY:'auto', minHeight:0, maxHeight:340, fontFamily:'monospace', fontSize:11 }}>
        {sourceTab?.content.split('\n').map((line, i) => (
          <div key={i} style={{ color:'#94a3b8', lineHeight:1.6, whiteSpace:'pre' }}>
            <span style={{ color:'#334155', marginRight:8, userSelect:'none', minWidth:24, display:'inline-block', textAlign:'right' }}>{i+1}</span>
            {line}
          </div>
        ))}
      </div> */}

      {/* Run controls */}
      <div style={{ padding:'10px 12px', borderTop:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:6 }}>
        <button
          onClick={onRun}
          disabled={running}
          style={{ width:'100%', padding:'8px 0', background: running ? '#16a34a99' : '#16a34a',
            color:'white', border:'none', borderRadius:7, fontSize:12, fontWeight:700,
            cursor: running ? 'default' : 'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize:16 }}>
            {running ? 'autorenew' : 'play_arrow'}
          </span>
          {running ? 'Running…' : 'Trigger Local Run Command'}
        </button>
        <button
          onClick={onReset}
          style={{ width:'100%', padding:'6px 0', background:'white', color:'#64748b',
            border:'1px solid #e2e8f0', borderRadius:7, fontSize:12, fontWeight:600,
            cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize:14 }}>refresh</span>
          Reset Workspace State
        </button>
      </div>

      {/* Shell output */}
      <div style={{ borderTop:'1px solid #e2e8f0' }}>
        <div style={{ padding:'6px 12px 4px', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', color:'#94a3b8' }}>
          Local Shell Execution Output
        </div>
        <div ref={logsRef} style={{ maxHeight:160, overflowY:'auto', padding:'0 8px 8px', display:'flex', flexDirection:'column', gap:3 }}>
          {logs.map((l, i) => (
            <div key={i} style={{
              fontSize:10.5, fontFamily:'monospace', lineHeight:1.4, padding:'4px 8px',
              borderRadius:4, borderLeft:`3px solid ${l.kind==='success'?'#16a34a':l.kind==='error'?'#dc2626':l.kind==='ai'?'#7c3aed':'#94a3b8'}`,
              background: l.kind==='success'?'#f0fdf4':l.kind==='error'?'#fef2f2':l.kind==='ai'?'#f5f3ff':'#f8fafc',
              color: l.kind==='success'?'#15803d':l.kind==='error'?'#b91c1c':l.kind==='ai'?'#6d28d9':'#475569',
            }}
              dangerouslySetInnerHTML={{ __html: l.text }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main FlowView ─────────────────────────────────────────────────────────────
export const FlowView: React.FC<{ flowTab?: Tab }> = ({ flowTab }) => {
  const { state } = useAppState();

  // Source tab = the file that spawned this flow view
  const sourceTab = flowTab?.flowSourceTabId
    ? state.tabs.find(t => t.id === flowTab!.flowSourceTabId)
    : state.tabs.find(t => t.id === state.activeTabId && t.tabType !== 'flow');

  const [graph,     setGraph]     = useState<FlowGraph | null>(null);
  const [nodes,     setNodes]     = useState<FNode[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [selected,  setSelected]  = useState<string | null>(null);
  const [pan,       setPan]       = useState({ x: 60, y: 40 });
  const [zoom,      setZoom]      = useState(0.9);
  const [logs,      setLogs]      = useState<LogEntry[]>([{ text:'Workspace monitored. Standing by.', kind:'info' }]);
  const [running,   setRunning]   = useState(false);
  const [nodeStatus, setNodeStatus] = useState<Record<string, 'idle'|'running'|'success'|'error'>>({});

  const isPanning  = useRef(false);
  const lastMouse  = useRef({ x:0, y:0 });
  const draggingId = useRef<string | null>(null);

  const addLog = (text: string, kind: LogEntry['kind'] = 'info') =>
    setLogs(l => [...l, { text, kind }]);

  const analyzeRef = React.useRef<() => void>(() => {});

  const analyze = useCallback(async () => {
    if (!sourceTab?.content) return;
    setAnalyzing(true);
    setGraph(null);
    setNodes([]);
    setNodeStatus({});
    addLog(`[AI] Analyzing ${sourceTab.name} via llama.cpp…`, 'ai');

    try {
      // Pass filePath + projectRoot so the backend can build a dependency manifest
      const projectRoot = (window as any).__cordexRoot ?? null;
      const result = await (window as any).electronAPI?.analyzeFlow?.({
        code:        sourceTab.content,
        filePath:    sourceTab.path ?? null,
        projectRoot,
      });
      if (result?.nodes?.length) {
        setGraph(result);
        setNodes(result.nodes);
        const statuses: Record<string, 'idle'|'running'|'success'|'error'> = {};
        result.nodes.forEach((n: FNode) => { statuses[n.id] = 'idle'; });
        setNodeStatus(statuses);
        addLog(`[Flow] Graph ready: ${result.nodes.length} nodes, ${result.edges?.length ?? 0} edges`, 'success');
      } else {
        addLog(result?.error ?? 'No flow data returned', 'error');
      }
    } catch (e: any) {
      addLog(`[Error] ${e?.message}`, 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [sourceTab]);

  // Trigger analysis on mount
  useEffect(() => {
    analyzeRef.current = analyze;
  });
  useEffect(() => {
    const timer = setTimeout(() => { if (sourceTab?.content) analyzeRef.current(); }, 100);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Simulate run through nodes ────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!graph || running) return;
    setRunning(true);
    addLog(`[Run] Starting execution simulation…`, 'ai');

    // Reset all nodes to idle
    const fresh: Record<string, 'idle'|'running'|'success'|'error'> = {};
    nodes.forEach(n => { fresh[n.id] = 'idle'; });
    setNodeStatus({ ...fresh });

    // Walk nodes in topological order (by y position as proxy)
    const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
    for (const node of sorted) {
      setNodeStatus(s => ({ ...s, [node.id]: 'running' }));
      addLog(`[Runtime] Executing: ${node.label}`, 'info');
      await new Promise(r => setTimeout(r, 500));

      const isError = node.nodeType === 'error' || !!node.errorMsg;
      if (isError) {
        setNodeStatus(s => ({ ...s, [node.id]: 'error' }));
        addLog(`[Error] ${node.errorMsg ?? 'Exception in ' + node.label}`, 'error');
        break;
      } else {
        setNodeStatus(s => ({ ...s, [node.id]: 'success' }));
        addLog(`[OK] ${node.label} completed`, 'success');
      }
    }

    setRunning(false);
  }, [graph, nodes, running]);

  const handleReset = () => {
    const fresh: Record<string, 'idle'|'running'|'success'|'error'> = {};
    nodes.forEach(n => { fresh[n.id] = 'idle'; });
    setNodeStatus({ ...fresh });
    setLogs([{ text:'Workspace reset. Standing by.', kind:'info' }]);
  };

  // ── Pan & drag ────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isPanning.current) {
        setPan(p => ({ x: p.x + e.clientX - lastMouse.current.x, y: p.y + e.clientY - lastMouse.current.y }));
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
      if (draggingId.current) {
        const dx = (e.clientX - lastMouse.current.x) / zoom;
        const dy = (e.clientY - lastMouse.current.y) / zoom;
        setNodes(ns => ns.map(n => n.id === draggingId.current
          ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n));
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    };
    const onUp = () => { isPanning.current = false; draggingId.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [zoom]);

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanning.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(2, Math.max(0.25, z - e.deltaY * 0.001)));
  };

  const startDrag = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    draggingId.current = id;
    lastMouse.current = { x: e.clientX, y: e.clientY };
  };

  // ── Edge rendering (orthogonal lines) ─────────────────────────
  const renderEdges = () => {
    if (!graph) return null;
    const byId: Record<string, FNode> = {};
    nodes.forEach(n => { byId[n.id] = n; });

    return graph.edges.map(edge => {
      const src = byId[edge.source];
      const tgt = byId[edge.target];
      if (!src || !tgt) return null;
      const sw = src.width ?? NODE_W;

      // Exit point: bottom-center of source node
      const sx = src.position.x + sw / 2;
      const sy = src.position.y + (src.height ?? 100) + 4;
      // Entry point: top-center of target node
      const tx = tgt.position.x + (tgt.width ?? NODE_W) / 2;
      const ty = tgt.position.y - 4;

      const isError  = edge.kind === 'error'  || edge.label === 'raises' || edge.label === 'error';
      const isBranch = edge.kind === 'branch' || edge.label === 'false'  || edge.label === 'no' || edge.label === 'else' || edge.label === 'if not record';
      const stroke   = isError ? '#ef4444' : isBranch ? '#f59e0b' : '#94a3b8';

      const d = orthogonalPath(sx, sy, tx, ty);
      const labelX = (sx + tx) / 2;
      const labelY = sy + (ty - sy) / 2;

      return (
        <g key={edge.id}>
          {/* Arrow marker inline */}
          <path d={d} fill="none" stroke={stroke} strokeWidth={isError ? 2.5 : 2}
            strokeDasharray={isError ? '6 3' : undefined}
            markerEnd={`url(#arr-${isError?'red':isBranch?'amber':'gray'})`}
          />
          {edge.label && (
            <g transform={`translate(${labelX},${labelY})`}>
              <rect x={-32} y={-9} width={64} height={18} rx={4} fill="white" stroke={stroke} strokeWidth={1} />
              <text textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={600} fill={stroke}>
                {edge.label}
              </text>
            </g>
          )}
        </g>
      );
    });
  };

  // ── Empty state ───────────────────────────────────────────────
  if (analyzing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#f8fafc]">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
          <div className="absolute inset-0 rounded-full border-4 border-orange-400 border-t-transparent animate-spin" />
          <span className="absolute inset-0 flex items-center justify-center material-symbols-outlined text-[22px] text-orange-400">account_tree</span>
        </div>
        <p className="text-[13px] font-semibold text-gray-600">Analyzing with llama.cpp GPU…</p>
        <p className="text-[11px] text-gray-400">Running on AMD RX 5700 XT · Vulkan</p>
      </div>
    );
  }

  if (!graph) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-[#f8fafc]">
        <span className="material-symbols-outlined text-[52px] text-gray-200">account_tree</span>
        <p className="text-[13px] font-semibold text-gray-500">Flow Diagram</p>
        <p className="text-[12px] text-gray-400 max-w-xs text-center">
          {sourceTab ? `Generating flow for ${sourceTab.name}…` : 'No source file'}
        </p>
        <button onClick={analyze}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-gray-900 text-white text-[12px] font-semibold hover:bg-gray-700 transition-all active:scale-95">
          <span className="material-symbols-outlined text-[15px]">account_tree</span>
          Generate Flow
        </button>
      </div>
    );
  }

  const canvasW = 3000, canvasH = 2000;

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden', background:'#f8fafc' }}>
      {/* ── Canvas ──────────────────────────────────────────── */}
      <div style={{ flex:1, position:'relative', overflow:'hidden',
        backgroundImage:'radial-gradient(circle, #cbd5e1 1px, transparent 1px)', backgroundSize:'20px 20px' }}
        onMouseDown={onCanvasMouseDown}
        onWheel={onWheel}
        onContextMenu={e => e.preventDefault()}
      >
        {/* Toolbar */}
        <div style={{ position:'absolute', top:10, left:10, right:10, display:'flex', alignItems:'center',
          gap:8, zIndex:20, pointerEvents:'none' }}>
          <div style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:8, padding:'5px 10px',
            fontSize:11, fontWeight:600, color:'#64748b', display:'flex', alignItems:'center', gap:6, pointerEvents:'auto' }}>
            <span className="material-symbols-outlined" style={{ fontSize:14, color:'#f97316' }}>account_tree</span>
            {sourceTab?.name ?? 'Flow'} — {nodes.length} nodes · {graph.edges?.length ?? 0} edges
          </div>
          <div style={{ flex:1 }} />
          {/* Zoom */}
          {[['zoom_out',''], [null,'100%'], ['zoom_in',''], ['fit_screen','']].map(([icon, label], i) => icon ? (
            <button key={i} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6, padding:'4px 7px',
              cursor:'pointer', fontSize:11, fontWeight:600, color:'#64748b', display:'flex', alignItems:'center', gap:3, pointerEvents:'auto' }}
              onClick={() => icon === 'zoom_out' ? setZoom(z => Math.max(0.25, z-0.1))
                : icon === 'zoom_in' ? setZoom(z => Math.min(2, z+0.1))
                : (setZoom(0.9), setPan({x:60, y:40}))}>
              <span className="material-symbols-outlined" style={{ fontSize:15 }}>{icon}</span>
              {label}
            </button>
          ) : (
            <span key={i} style={{ background:'white', border:'1px solid #e2e8f0', borderRadius:6,
              padding:'4px 8px', fontSize:11, fontWeight:600, color:'#64748b', pointerEvents:'auto' }}>
              {Math.round(zoom*100)}%
            </span>
          ))}
          <button style={{ background:'#0f172a', border:'none', borderRadius:6, padding:'5px 12px',
            cursor:'pointer', fontSize:11, fontWeight:700, color:'white', display:'flex', alignItems:'center', gap:5, pointerEvents:'auto' }}
            onClick={analyze}>
            <span className="material-symbols-outlined" style={{ fontSize:14 }}>refresh</span>
            Regenerate
          </button>
        </div>

        {/* Pan/zoom container */}
        <div style={{ transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
          transformOrigin:'0 0', position:'absolute', width:canvasW, height:canvasH }}>
          {/* SVG edges */}
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', overflow:'visible' }}>
            <defs>
              {[['gray','#94a3b8'],['red','#ef4444'],['amber','#f59e0b']].map(([id, fill]) => (
                <marker key={id} id={`arr-${id}`} markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
                  <path d="M0,0 L7,3.5 L0,7 z" fill={fill as string} />
                </marker>
              ))}
            </defs>
            {renderEdges()}
          </svg>

          {/* Node cards */}
          {nodes.map(n => (
            <NodeCard key={n.id} node={n} selected={selected === n.id}
              status={nodeStatus[n.id] ?? 'idle'}
              onClick={() => setSelected(s => s === n.id ? null : n.id)}
              onDragStart={e => startDrag(n.id, e)}
            />
          ))}
        </div>

        {/* Bottom hint */}
        <div style={{ position:'absolute', bottom:10, left:12, fontSize:10, color:'#94a3b8', pointerEvents:'none' }}>
          Alt+drag or middle-click to pan · Scroll to zoom · Drag nodes to move
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────── */}
      <RightPanel sourceTab={sourceTab} onRun={handleRun} onReset={handleReset} running={running} logs={logs} />
    </div>
  );
};

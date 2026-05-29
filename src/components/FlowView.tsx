import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  NodeProps,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ReactFlowProvider,
  Panel,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Tab } from '../types';

// ── Types matching flowHandler output ────────────────────────────────────────

type RFNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  nodeType: string;
  label: string;
  description: string | null;
  errorMsg: string | null;
  line: number | null;
  width: number;
  height: number;
};

type RFEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  type?: string;
  labelStyle?: React.CSSProperties;
  labelBgStyle?: React.CSSProperties;
  labelBgPadding?: [number, number];
  style?: React.CSSProperties;
};

type SimulationResult = {
  executedNodes: string[];
  riskNodes: Array<{ id: string; risks: string[] }>;
  predictedNodes: string[];
  fileRisks: string[];
  mode: string;
};

type RunResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  mode: string;
  errorLine?: number | null;
  hasStderrErrors?: boolean;
  phase?: string;
};

// ── Node type → visual config ─────────────────────────────────────────────────

const NODE_STYLES: Record<string, { bg: string; border: string; icon: string; iconColor: string }> = {
  entry:    { bg: '#f0fdf4', border: '#22c55e', icon: 'play_arrow',      iconColor: '#16a34a' },
  exit:     { bg: '#f0f9ff', border: '#38bdf8', icon: 'stop',            iconColor: '#0284c7' },
  call:     { bg: '#ffffff', border: '#cbd5e1', icon: 'call_made',        iconColor: '#64748b' },
  decision: { bg: '#fefce8', border: '#fbbf24', icon: 'device_hub',      iconColor: '#d97706' },
  loop:     { bg: '#faf5ff', border: '#a78bfa', icon: 'loop',            iconColor: '#7c3aed' },
  error:    { bg: '#fff1f2', border: '#f87171', icon: 'error_outline',   iconColor: '#dc2626' },
  value:    { bg: '#f8fafc', border: '#94a3b8', icon: 'data_object',     iconColor: '#475569' },
};

const getNodeStyle = (nodeType: string) => NODE_STYLES[nodeType] ?? NODE_STYLES.call;

// ── Custom FlowNode renderer ──────────────────────────────────────────────────

const FlowNodeComponent: React.FC<NodeProps> = ({ data, selected }) => {
  const style = getNodeStyle(data.nodeType);
  const simState: 'executed' | 'risk' | 'predicted' | 'idle' = data.__simState ?? 'idle';

  const ringColor =
    simState === 'executed'  ? '#22c55e' :
    simState === 'risk'      ? '#ef4444' :
    simState === 'predicted' ? '#f59e0b' :
    selected                 ? '#6366f1' :
    style.border;

  return (
    <div
      style={{
        width: 260,
        minHeight: 80,
        background: style.bg,
        border: `2px solid ${ringColor}`,
        borderRadius: 10,
        boxShadow: selected
          ? `0 0 0 3px ${ringColor}33, 0 4px 16px rgba(0,0,0,0.10)`
          : '0 2px 8px rgba(0,0,0,0.07)',
        padding: '10px 14px',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'default',
        position: 'relative',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: data.description ? 6 : 0 }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, color: style.iconColor, flexShrink: 0, lineHeight: 1 }}
        >
          {style.icon}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', lineHeight: 1.3, flex: 1 }}>
          {data.label}
        </span>
        {data.line != null && (
          <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>:{data.line}</span>
        )}
      </div>

      {/* Description */}
      {data.description && (
        <p style={{ fontSize: 11, color: '#64748b', margin: 0, lineHeight: 1.4 }}>
          {data.description}
        </p>
      )}

      {/* Risk badge */}
      {simState === 'risk' && data.__risks?.length > 0 && (
        <div style={{
          marginTop: 6,
          background: '#fff1f2',
          border: '1px solid #fecaca',
          borderRadius: 5,
          padding: '3px 7px',
        }}>
          {(data.__risks as string[]).map((r: string) => (
            <p key={r} style={{ fontSize: 10, color: '#dc2626', margin: 0, lineHeight: 1.5 }}>⚠ {r}</p>
          ))}
        </div>
      )}

      {/* Sim state badge */}
      {simState !== 'idle' && (
        <div style={{
          position: 'absolute',
          top: -8,
          right: 10,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.04em',
          padding: '2px 7px',
          borderRadius: 99,
          background: simState === 'executed' ? '#dcfce7' : simState === 'risk' ? '#fee2e2' : '#fef9c3',
          color:      simState === 'executed' ? '#15803d' : simState === 'risk' ? '#b91c1c' : '#854d0e',
          border: `1px solid ${simState === 'executed' ? '#bbf7d0' : simState === 'risk' ? '#fca5a5' : '#fde68a'}`,
        }}>
          {simState.toUpperCase()}
        </div>
      )}
    </div>
  );
};

const nodeTypes = { flowNode: FlowNodeComponent };

// ── Output Panel ─────────────────────────────────────────────────────────────

const OutputPanel: React.FC<{
  result: RunResult | null;
  simResult: SimulationResult | null;
  onClose: () => void;
}> = ({ result, simResult, onClose }) => {
  if (!result && !simResult) return null;

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 180,
      background: '#0f172a',
      borderTop: '1px solid #1e293b',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 20,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 12px',
        borderBottom: '1px solid #1e293b',
        gap: 8,
        flexShrink: 0,
      }}>
        {result && (
          <>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 13, color: result.success ? '#4ade80' : '#f87171' }}
            >
              {result.success ? 'check_circle' : 'cancel'}
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>
              {result.mode === 'execution'
                ? `Exit ${result.exitCode}${result.timedOut ? ' · timed out' : ''}`
                : 'Simulation complete'}
            </span>
          </>
        )}
        {simResult && !result && (
          <>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#a78bfa' }}>psychology</span>
            <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>
              Static analysis · {simResult.executedNodes.length} executed · {simResult.riskNodes.length} risks
            </span>
          </>
        )}
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#475569' }}>close</span>
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', fontFamily: 'monospace', fontSize: 11 }}>
        {result?.stdout && (
          <pre style={{ color: '#e2e8f0', margin: 0, whiteSpace: 'pre-wrap' }}>{result.stdout}</pre>
        )}
        {result?.stderr && (
          <pre style={{ color: '#f87171', margin: 0, whiteSpace: 'pre-wrap', marginTop: result.stdout ? 8 : 0 }}>
            {result.stderr}
          </pre>
        )}
        {(simResult?.fileRisks?.length ?? 0) > 0 && !result && (
          <div>
            {simResult!.fileRisks.map(r => (
              <p key={r} style={{ color: '#fbbf24', margin: '2px 0' }}>⚠ {r}</p>
            ))}
          </div>
        )}
        {simResult && !result && simResult.fileRisks?.length === 0 && (
          <p style={{ color: '#4ade80', margin: 0 }}>No global risks detected.</p>
        )}
      </div>
    </div>
  );
};

// ── Inner flow canvas (needs ReactFlowProvider context) ──────────────────────

const FlowCanvas: React.FC<{
  flowTab: Tab;
  rfNodes: RFNode[];
  rfEdges: RFEdge[];
  simResult: SimulationResult | null;
  runResult: RunResult | null;
  onCloseOutput: () => void;
}> = ({ flowTab, rfNodes, rfEdges, simResult, runResult, onCloseOutput }) => {
  const { fitView } = useReactFlow();

  // Merge simulation state into node data
  const enrichedNodes = rfNodes.map(n => {
    let simState: 'executed' | 'risk' | 'predicted' | 'idle' = 'idle';
    let risks: string[] = [];
    if (simResult) {
      if (simResult.executedNodes.includes(n.id))       simState = 'executed';
      else if (simResult.predictedNodes.includes(n.id)) simState = 'predicted';
      const riskEntry = simResult.riskNodes.find(r => r.id === n.id);
      if (riskEntry) { simState = 'risk'; risks = riskEntry.risks; }
    }
    return {
      ...n,
      data: {
        nodeType:    n.nodeType,
        label:       n.label,
        description: n.description,
        errorMsg:    n.errorMsg,
        line:        n.line,
        __simState:  simState,
        __risks:     risks,
      },
    };
  });

  const [nodes, , onNodesChange] = useNodesState(enrichedNodes);
  const [edges, , onEdgesChange] = useEdgesState(rfEdges as any);

  useEffect(() => { setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 80); }, [rfNodes.length]);

  const hasOutput = !!runResult || !!simResult;

  return (
    <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        style={{ background: '#f8fafc', height: hasOutput ? 'calc(100% - 180px)' : '100%' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Controls
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        />
        <MiniMap
          style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 8 }}
          nodeColor={n => getNodeStyle((n as any).nodeType ?? 'call').border}
        />
        {rfNodes.length === 0 && (
          <Panel position="top-center">
            <div style={{
              background: 'white',
              border: '1px solid #e2e8f0',
              borderRadius: 10,
              padding: '12px 20px',
              fontSize: 13,
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>account_tree</span>
              No flow data — click Analyze to generate
            </div>
          </Panel>
        )}
      </ReactFlow>

      <OutputPanel result={runResult} simResult={simResult} onClose={onCloseOutput} />
    </div>
  );
};

// ── Main FlowView component ───────────────────────────────────────────────────

export interface FlowViewProps {
  flowTab: Tab;
}

export const FlowView: React.FC<FlowViewProps> = ({ flowTab }) => {
  const [rfNodes,    setRfNodes]    = useState<RFNode[]>([]);
  const [rfEdges,    setRfEdges]    = useState<RFEdge[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [simResult,  setSimResult]  = useState<SimulationResult | null>(null);
  const [runResult,  setRunResult]  = useState<RunResult | null>(null);
  const [mode,       setMode]       = useState<'execution' | 'simulation' | null>(null);
  const abortRef = useRef(false);

  // Analyze: call IPC analyze-flow
  const handleAnalyze = useCallback(async () => {
    if (!flowTab.content && !flowTab.path) return;
    setLoading(true);
    setError(null);
    setSimResult(null);
    setRunResult(null);
    abortRef.current = false;

    try {
      const result = await (window as any).electron?.ipcRenderer?.invoke('analyze-flow', {
        code:        flowTab.content ?? '',
        filePath:    flowTab.path ?? null,
        projectRoot: flowTab.projectRoot ?? null,
      });
      if (abortRef.current) return;
      if (result?.error) { setError(result.error); return; }
      setRfNodes(result?.nodes ?? []);
      setRfEdges(result?.edges ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Unknown error');
    } finally {
      if (!abortRef.current) setLoading(false);
    }
  }, [flowTab]);

  // Detect run mode
  const detectMode = useCallback(async () => {
    const result = await (window as any).electron?.ipcRenderer?.invoke('flow:detect-mode', {
      language: flowTab.language,
      filePath: flowTab.path,
    });
    setMode(result?.mode ?? 'simulation');
    return result?.mode ?? 'simulation';
  }, [flowTab]);

  // Run or Simulate
  const handleRun = useCallback(async () => {
    setSimResult(null);
    setRunResult(null);
    const detectedMode = await detectMode();

    if (detectedMode === 'execution') {
      setLoading(true);
      try {
        const result = await (window as any).electron?.ipcRenderer?.invoke('flow:run', {
          code:     flowTab.content ?? '',
          language: flowTab.language,
          filePath: flowTab.path,
        });
        setRunResult(result);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        const result = await (window as any).electron?.ipcRenderer?.invoke('flow:simulate', {
          code:     flowTab.content ?? '',
          language: flowTab.language,
          nodes:    rfNodes,
        });
        setSimResult(result);
      } finally {
        setLoading(false);
      }
    }
  }, [detectMode, flowTab, rfNodes]);

  // Save / Load on mount
  useEffect(() => {
    if (!flowTab.fileHash) return;
    (window as any).electron?.ipcRenderer?.invoke('load-flow', flowTab.fileHash).then((saved: any) => {
      if (saved?.nodes?.length) {
        setRfNodes(saved.nodes);
        setRfEdges(saved.edges ?? []);
      }
    });
  }, [flowTab.fileHash]);

  const handleSave = useCallback(async () => {
    if (!flowTab.fileHash) return;
    await (window as any).electron?.ipcRenderer?.invoke('save-flow', flowTab.fileHash, {
      nodes: rfNodes,
      edges: rfEdges,
    });
  }, [flowTab.fileHash, rfNodes, rfEdges]);

  const runLabel = mode === 'execution' ? 'Run' : 'Simulate';
  const runIcon  = mode === 'execution' ? 'play_arrow' : 'psychology';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        borderBottom: '1px solid #e2e8f0',
        background: '#ffffff',
        flexShrink: 0,
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#64748b' }}>account_tree</span>
        <span style={{ fontSize: 12, color: '#475569', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {flowTab.name}
        </span>

        <button
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px',
            fontSize: 11, fontWeight: 600,
            background: loading ? '#f1f5f9' : '#6366f1',
            color: loading ? '#94a3b8' : 'white',
            border: 'none', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {loading
            ? <><span className="material-symbols-outlined" style={{ fontSize: 13, animation: 'spin 1s linear infinite' }}>progress_activity</span> Analyzing…</>
            : <><span className="material-symbols-outlined" style={{ fontSize: 13 }}>auto_fix_high</span> Analyze</>
          }
        </button>

        <button
          onClick={handleRun}
          disabled={loading || rfNodes.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px',
            fontSize: 11, fontWeight: 600,
            background: rfNodes.length === 0 ? '#f1f5f9' : '#0ea5e9',
            color: rfNodes.length === 0 ? '#94a3b8' : 'white',
            border: 'none', borderRadius: 6, cursor: (loading || rfNodes.length === 0) ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>{runIcon}</span>
          {runLabel}
        </button>

        <button
          onClick={handleSave}
          disabled={rfNodes.length === 0}
          title="Save layout"
          style={{
            display: 'flex', alignItems: 'center',
            padding: '3px 7px',
            background: 'none', border: '1px solid #e2e8f0',
            borderRadius: 6, cursor: rfNodes.length === 0 ? 'not-allowed' : 'pointer',
            color: '#64748b',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>save</span>
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div style={{
          padding: '7px 12px',
          background: '#fff1f2',
          borderBottom: '1px solid #fecaca',
          fontSize: 11,
          color: '#dc2626',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>error_outline</span>
          {error}
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>close</span>
          </button>
        </div>
      )}

      {/* ── Canvas ── */}
      <ReactFlowProvider>
        <FlowCanvas
          flowTab={flowTab}
          rfNodes={rfNodes}
          rfEdges={rfEdges}
          simResult={simResult}
          runResult={runResult}
          onCloseOutput={() => { setRunResult(null); setSimResult(null); }}
        />
      </ReactFlowProvider>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};
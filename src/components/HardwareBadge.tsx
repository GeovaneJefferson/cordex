import React, { useState, useRef, useEffect } from 'react';
import { useAppState } from '../store/AppContext';

const BACKEND_DOT: Record<string, string> = {
  cuda: 'bg-green-500', rocm: 'bg-orange-500', metal: 'bg-purple-500',
  vulkan: 'bg-blue-500', cpu: 'bg-gray-400',
};
const BACKEND_LABEL: Record<string, string> = {
  cuda: 'CUDA', rocm: 'ROCm', metal: 'Metal', vulkan: 'Vulkan', cpu: 'CPU',
};
function fmtMB(mb: number) { return mb >= 1024 ? `${(mb/1024).toFixed(1)} GB` : `${mb} MB`; }
const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="text-gray-400 flex-shrink-0">{label}</span>
    <span className={`text-right truncate ${color ?? 'text-gray-700'}`}>{value}</span>
  </div>
);

export const HardwareBadge: React.FC = () => {
  const { state } = useAppState();
  const hw       = state.hardware;
  const [open, setOpen]   = useState(false);
  const btnRef  = useRef<HTMLButtonElement>(null);
  const popRef  = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ bottom: 0, left: 0 });

  // Compute popup position from button rect — avoids being clipped by statusbar
  useEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setPos({ bottom: window.innerHeight - r.top + 6, left: r.left });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  if (!hw) return null;

  const backend   = (hw.gpu_backend ?? 'cpu') as string;
  const dotColor  = BACKEND_DOT[backend] ?? 'bg-gray-400';
  const label     = BACKEND_LABEL[backend] ?? backend.toUpperCase();
  const supported = hw.has_gpu && backend !== 'cpu';

  return (
    <>
      <button ref={btnRef} onClick={() => setOpen(o => !o)} title={hw.gpu_reason ?? 'Hardware info'}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-gray-500 hover:bg-white/40 transition-colors cursor-pointer">
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor} ${supported ? 'animate-pulse' : ''}`} />
        <span>{label}</span>
        {hw.gpu_layers && hw.gpu_layers > 0 && <span className="text-gray-400">·{hw.gpu_layers}L</span>}
      </button>

      {open && (
        <div ref={popRef}
          style={{ position: 'fixed', bottom: pos.bottom, left: pos.left, zIndex: 9999, animation: 'slideUp 150ms cubic-bezier(0.4,0,0.2,1)' }}
          className="bg-white border border-gray-200 rounded-xl shadow-2xl p-4 w-72 text-[11px]"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full ${dotColor}`} />
            <span className="font-semibold text-gray-900 text-[12px]">
              {supported ? `GPU Accelerated · ${label}` : 'CPU Mode'}
            </span>
          </div>
          <div className="space-y-1.5 text-gray-600">
            <Row label="GPU" value={hw.gpu_name || (supported ? hw.gpu_vendor : 'None')} />
            {hw.vram_mb     ? <Row label="VRAM"       value={fmtMB(hw.vram_mb)} /> : null}
            {hw.gpu_layers  ? <Row label="GPU Layers" value={`${hw.gpu_layers} offloaded`} /> : null}
            {hw.cuda_version  && <Row label="CUDA"  value={hw.cuda_version} color="text-green-600" />}
            {hw.rocm_version  && <Row label="ROCm"  value={hw.rocm_version} color="text-orange-600" />}
            {(hw as any).hsa_override && <Row label="HSA Override" value={(hw as any).hsa_override} color="text-amber-600" />}
            <div className="border-t border-gray-100 my-2" />
            <Row label="CPU" value={hw.cpu_model?.split('@')[0].trim() ?? '—'} />
            <Row label="RAM" value={`${hw.total_ram_gb} GB`} />
            <Row label="Tier" value={hw.capability}
              color={hw.capability === 'PRO' ? 'text-orange-600' : hw.capability === 'MID' ? 'text-blue-600' : 'text-gray-500'} />
            {hw.llama_flags?.length > 0 && (
              <>
                <div className="border-t border-gray-100 my-2" />
                <div>
                  <span className="text-gray-400 block mb-1">Ollama flags</span>
                  <code className="block bg-gray-50 rounded px-2 py-1 text-[10px] text-gray-700 font-mono break-all">
                    {hw.llama_flags.join(' ')}
                  </code>
                </div>
              </>
            )}
            {hw.gpu_reason && (
              <p className={`mt-2 leading-relaxed ${supported ? 'text-gray-400' : 'text-amber-600'}`}>{hw.gpu_reason}</p>
            )}
          </div>
          <button onClick={() => { setOpen(false); (window as any).Cordex?.hardware?.redetect?.(); }}
            className="mt-3 w-full text-center text-[10px] text-orange-500 hover:text-orange-700 transition-colors">
            Re-detect hardware
          </button>
        </div>
      )}
    </>
  );
};

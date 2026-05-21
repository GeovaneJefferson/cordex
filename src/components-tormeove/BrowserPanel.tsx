import React, { useState, useRef, useCallback, useEffect } from 'react';

const DEVICE_PRESETS = [
  { id: 'iphone-15-pro',  label: 'iPhone 15 Pro', w: 393,  h: 852,  os: 'ios',     hasIsland: true,  hasHomeBar: true  },
  { id: 'iphone-14',      label: 'iPhone 14',     w: 390,  h: 844,  os: 'ios',     hasIsland: true,  hasHomeBar: true  },
  { id: 'iphone-se',      label: 'iPhone SE',     w: 375,  h: 667,  os: 'ios',     hasIsland: false, hasHomeBar: false },
  { id: 'pixel-8',        label: 'Pixel 8',       w: 412,  h: 915,  os: 'android', hasIsland: false, hasHomeBar: false },
  { id: 'galaxy-s24',     label: 'Galaxy S24',    w: 360,  h: 780,  os: 'android', hasIsland: false, hasHomeBar: false },
  { id: 'ipad-pro',       label: 'iPad Pro 11"',  w: 834,  h: 1194, os: 'ios',     hasIsland: false, hasHomeBar: true  },
] as const;

const DESKTOP_WIDTHS = [
  { label: 'Full', value: 0 },
  { label: '1440', value: 1440 },
  { label: '1280', value: 1280 },
  { label: '1024', value: 1024 },
];

type DeviceId = typeof DEVICE_PRESETS[number]['id'];

interface BrowserPanelProps {
  initialMode: 'phone' | 'desktop';
  onClose: () => void;
  onModeChange: (mode: 'phone' | 'desktop') => void;
}

const BASE_URL = 'http://localhost:8081';

export const BrowserPanel: React.FC<BrowserPanelProps> = ({ initialMode, onClose, onModeChange }) => {
  const [mode,        setMode]        = useState<'phone' | 'desktop'>(initialMode);
  const [deviceId,    setDeviceId]    = useState<DeviceId>('iphone-15-pro');
  const [landscape,   setLandscape]   = useState(false);
  const [deskW,       setDeskW]       = useState(0);
  const [urlInput,    setUrlInput]    = useState(BASE_URL);
  const [currentUrl,  setCurrentUrl]  = useState(BASE_URL);
  const [loading,     setLoading]     = useState(true);
  const [iframeKey,   setIframeKey]   = useState(0);
  const [deviceMenu,  setDeviceMenu]  = useState(false);
  const [containerSz, setContainerSz] = useState({ w: 600, h: 700 });

  const containerRef  = useRef<HTMLDivElement>(null);
  const iframeRef     = useRef<HTMLIFrameElement>(null);
  const deviceMenuRef = useRef<HTMLDivElement>(null);
  const urlRef        = useRef<HTMLInputElement>(null);

  const device = DEVICE_PRESETS.find(d => d.id === deviceId)!;

  // Resize observer for container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      setContainerSz({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Close device menu on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) setDeviceMenu(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Navigate to typed URL
  const navigate = useCallback((url: string) => {
    let full = url.trim();
    if (!full.startsWith('http')) full = 'http://' + full;
    setCurrentUrl(full);
    setUrlInput(full);
    setIframeKey(k => k + 1);
    setLoading(true);
  }, []);

  const handleUrlKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') navigate(urlInput);
    if (e.key === 'Escape') { setUrlInput(currentUrl); urlRef.current?.blur(); }
  };

  const refresh = () => { setIframeKey(k => k + 1); setLoading(true); };

  const switchMode = (m: 'phone' | 'desktop') => {
    setMode(m); onModeChange(m); setLandscape(false);
  };

  // Phone scale to fit container
  const phoneW = landscape ? device.h : device.w;
  const phoneH = landscape ? device.w : device.h;
  const CHROME = 24;
  const scale  = Math.min(
    (containerSz.w - 40) / (phoneW + CHROME * 2),
    (containerSz.h - 60) / (phoneH + CHROME * 2),
    1
  );

  const iosDevices     = DEVICE_PRESETS.filter(d => d.os === 'ios');
  const androidDevices = DEVICE_PRESETS.filter(d => d.os === 'android');

  return (
    <div className="flex flex-col h-full bg-[#F5F5F5]" style={{ userSelect: 'none' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-2 h-10 border-b border-gray-200 bg-white flex-shrink-0">

        {/* Mode switcher */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
          {(['phone', 'desktop'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)} title={m === 'phone' ? 'Mobile' : 'Desktop'}
              className={`px-2 py-1 rounded-md transition-all flex items-center gap-1 text-[11px] font-medium
                ${mode === m ? 'bg-white shadow text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
              <span className="material-symbols-outlined text-[14px]">
                {m === 'phone' ? 'smartphone' : 'desktop_windows'}
              </span>
            </button>
          ))}
        </div>

        {/* Device picker (phone) */}
        {mode === 'phone' && (
          <div ref={deviceMenuRef} className="relative flex-shrink-0">
            <button onClick={() => setDeviceMenu(v => !v)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 bg-white text-[11.5px] text-gray-700 hover:bg-gray-50 transition-colors">
              <span className="material-symbols-outlined text-[13px] text-gray-500">
                {device.os === 'ios' ? 'phone_iphone' : 'phone_android'}
              </span>
              {device.label}
              <span className="material-symbols-outlined text-[12px] text-gray-400">expand_more</span>
            </button>
            {deviceMenu && (
              <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 min-w-[180px]">
                {[{ label: 'iOS', items: iosDevices }, { label: 'Android', items: androidDevices }].map(group => (
                  <div key={group.label}>
                    <div className="px-3 py-1 text-[9.5px] font-bold uppercase tracking-widest text-gray-400">{group.label}</div>
                    {group.items.map(d => (
                      <button key={d.id} onClick={() => { setDeviceId(d.id); setDeviceMenu(false); }}
                        className={`w-full flex items-center justify-between px-3 py-[5px] text-[12px] hover:bg-gray-50 transition-colors
                          ${deviceId === d.id ? 'text-orange-500 font-semibold' : 'text-gray-700'}`}>
                        <span>{d.label}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{d.w}×{d.h}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rotate */}
        {mode === 'phone' && (
          <button onClick={() => setLandscape(l => !l)} title={landscape ? 'Portrait' : 'Landscape'}
            className="p-1.5 border border-gray-200 bg-white rounded-lg text-gray-500 hover:bg-gray-50 transition-colors flex-shrink-0">
            <span className="material-symbols-outlined text-[14px]"
              style={{ transform: landscape ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s', display: 'block' }}>
              screen_rotation
            </span>
          </button>
        )}

        {/* Desktop width */}
        {mode === 'desktop' && (
          <div className="flex gap-1 flex-shrink-0">
            {DESKTOP_WIDTHS.map(p => (
              <button key={p.label} onClick={() => setDeskW(p.value)}
                className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors
                  ${deskW === p.value ? 'border-orange-400 bg-orange-50 text-orange-600 font-semibold' : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'}`}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Dimension badge */}
        <span className="text-[10px] text-gray-400 font-mono flex-shrink-0">
          {mode === 'phone'
            ? `${phoneW}×${phoneH}`
            : deskW ? `${deskW}px` : 'Full'}
        </span>

        {/* URL bar — editable */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 bg-gray-100 rounded-lg px-2.5 py-1">
          <span className="material-symbols-outlined text-[12px] text-gray-400 flex-shrink-0">
            {loading ? 'autorenew' : 'lock'}
          </span>
          <input
            ref={urlRef}
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={handleUrlKey}
            onFocus={e => e.target.select()}
            className="flex-1 bg-transparent text-[11.5px] text-gray-700 outline-none min-w-0"
            spellCheck={false}
          />
          {urlInput !== currentUrl && (
            <button onClick={() => navigate(urlInput)} title="Navigate"
              className="text-gray-400 hover:text-gray-700 flex-shrink-0">
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </button>
          )}
        </div>

        <button onClick={refresh} title="Refresh"
          className="p-1.5 text-gray-400 hover:text-gray-600 flex-shrink-0 rounded-lg hover:bg-gray-100 transition-colors">
          <span className={`material-symbols-outlined text-[15px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </button>

        <button onClick={onClose} title="Close preview"
          className="p-1.5 text-gray-400 hover:text-gray-600 flex-shrink-0 rounded-lg hover:bg-gray-100 transition-colors">
          <span className="material-symbols-outlined text-[15px]">close</span>
        </button>
      </div>

      {/* ── Preview area ─────────────────────────────────────────────────────── */}
      <div ref={containerRef}
        className="flex-1 overflow-hidden flex items-start justify-center"
        style={{
          padding: mode === 'phone' ? '16px 8px' : 0,
          background: mode === 'phone' ? '#E0E0E0' : 'white',
        }}>

        {mode === 'phone' ? (
          /* Phone shell */
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top center', flexShrink: 0, width: phoneW + CHROME * 2 }}>
            <div style={{
              width: phoneW + CHROME * 2, height: phoneH + CHROME * 2,
              background: device.os === 'ios' ? '#111' : '#0d0d0d',
              borderRadius: 48,
              padding: CHROME,
              boxShadow: '0 0 0 1.5px #2a2a2a, 0 24px 60px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
              position: 'relative',
            }}>
              {/* Volume buttons */}
              {[0, 44].map(t => <div key={t} style={{ position:'absolute', left:-3, top: 120+t, width:3, height:32, background:'#2a2a2a', borderRadius:2 }} />)}
              <div style={{ position:'absolute', right:-3, top:140, width:3, height:56, background:'#2a2a2a', borderRadius:2 }} />

              {/* Screen */}
              <div style={{ width:'100%', height:'100%', borderRadius: 48-CHROME, overflow:'hidden', background:'#000', position:'relative' }}>
                {/* Dynamic island / camera */}
                {device.hasIsland && !landscape && (
                  <div style={{ position:'absolute', top:10, left:'50%', transform:'translateX(-50%)',
                    width:120, height:34, background:'#000', borderRadius:20, zIndex:10,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    <div style={{ width:12, height:12, borderRadius:'50%', background:'#161616', border:'1px solid #222' }} />
                    <div style={{ width:6, height:6, borderRadius:'50%', background:'#1a1a1a' }} />
                  </div>
                )}
                <iframe key={iframeKey} ref={iframeRef} src={currentUrl}
                  style={{ width:'100%', height:'100%', border:'none', background:'white' }}
                  onLoad={() => setLoading(false)} title="Preview" />
                {/* Home bar */}
                {device.hasHomeBar && !landscape && (
                  <div style={{ position:'absolute', bottom:8, left:'50%', transform:'translateX(-50%)',
                    width:120, height:5, borderRadius:3, background:'rgba(255,255,255,0.3)', zIndex:10 }} />
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Desktop */
          <div style={{
            width: deskW ? Math.min(deskW, containerSz.w) : '100%',
            height: '100%', overflow: 'hidden', background: 'white',
            boxShadow: deskW ? '0 0 0 1px #E2E8F0' : 'none',
          }}>
            <iframe key={iframeKey} ref={iframeRef} src={currentUrl}
              style={{ width: deskW || '100%', height: '100%', border: 'none', background: 'white', maxWidth: '100%' }}
              onLoad={() => setLoading(false)} title="Preview" />
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none"
            style={{ background: 'rgba(245,245,245,0.7)' }}>
            <span className="material-symbols-outlined animate-spin text-[24px] text-gray-400">autorenew</span>
            <span className="text-[12px] text-gray-400">Connecting to {currentUrl}</span>
          </div>
        )}
      </div>
    </div>
  );
};

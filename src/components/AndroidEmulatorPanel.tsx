import React, { useState, useEffect, useRef, useCallback } from 'react';

const Cordex = (window as any).Cordex;

// ── Types ─────────────────────────────────────────────────────────────────────
interface EmulatorDevice {
  id: string;
  label: string;
  avdName: string;
  api: number;
  arch: 'x86_64' | 'arm64-v8a';
}

const PRESET_DEVICES: EmulatorDevice[] = [
  { id: 'pixel8',       label: 'Pixel 8',           avdName: 'Pixel_8_API_34',      api: 34, arch: 'x86_64' },
  { id: 'pixel7pro',    label: 'Pixel 7 Pro',        avdName: 'Pixel_7_Pro_API_33',  api: 33, arch: 'x86_64' },
  { id: 'pixel_fold',   label: 'Pixel Fold',         avdName: 'Pixel_Fold_API_34',   api: 34, arch: 'x86_64' },
  { id: 'nexus5x',      label: 'Nexus 5X (arm64)',   avdName: 'Nexus_5X_API_30',     api: 30, arch: 'arm64-v8a' },
  { id: 'tablet_10',    label: 'Pixel Tablet',       avdName: 'Pixel_Tablet_API_34', api: 34, arch: 'x86_64' },
];

type EmulatorState = 'idle' | 'starting' | 'running' | 'error';

interface AndroidEmulatorPanelProps {
  visible: boolean;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const AndroidEmulatorPanel: React.FC<AndroidEmulatorPanelProps> = ({ visible, onClose }) => {
  const [emulatorState, setEmulatorState] = useState<EmulatorState>('idle');
  const [selectedDevice, setSelectedDevice] = useState<EmulatorDevice>(PRESET_DEVICES[0]);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>(['Android Emulator panel ready.', 'Select a device and press Launch.']);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [expoUrl, setExpoUrl] = useState('exp://localhost:8081');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const logsRef = useRef<HTMLDivElement>(null);
  const deviceMenuRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((msg: string) => setLogs(l => [...l, msg]), []);

  // ── Auto-scroll logs ────────────────────────────────────────────────────────
  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight;
  }, [logs]);

  // ── Close device menu on outside click ─────────────────────────────────────
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node))
        setDeviceMenuOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // ── Listen for emulator IPC events ────────────────────────────────────────
  useEffect(() => {
    const handleLog  = (_: any, msg: string) => addLog(msg);
    const handleReady = (_: any, { url }: { url: string }) => {
      setStreamUrl(url);
      setEmulatorState('running');
      addLog(`✓ Emulator ready — streaming at ${url}`);
    };
    const handleError = (_: any, { message }: { message: string }) => {
      setEmulatorState('error');
      addLog(`✗ Error: ${message}`);
    };
    (window as any).Cordex?.emulator?.onLog?.(handleLog);
    (window as any).Cordex?.emulator?.onReady?.(handleReady);
    (window as any).Cordex?.emulator?.onError?.(handleError);
    return () => {
      (window as any).Cordex?.emulator?.removeLog?.(handleLog);
      (window as any).Cordex?.emulator?.removeReady?.(handleReady);
      (window as any).Cordex?.emulator?.removeError?.(handleError);
    };
  }, [addLog]);

  const handleLaunch = async () => {
    setEmulatorState('starting');
    setStreamUrl(null);
    addLog(`Launching ${selectedDevice.label} (AVD: ${selectedDevice.avdName})…`);
    addLog(`API ${selectedDevice.api} · ${selectedDevice.arch}`);
    addLog('Starting emulator process (this may take 30–60 seconds)…');

    // Call Electron IPC — main process will spawn emulator + scrcpy/websocket stream
    const res = await (window as any).Cordex?.emulator?.launch?.({
      avdName: selectedDevice.avdName,
      arch: selectedDevice.arch,
    }).catch((e: any) => ({ ok: false, error: e.message }));

    if (!res) {
      // No IPC handler yet — show setup instructions
      setEmulatorState('error');
      addLog('');
      addLog('⚠  No emulator backend found. To enable Android Emulator:');
      addLog('   1. Install Android Studio + AVD Manager');
      addLog('   2. Create an AVD matching the name above');
      addLog('   3. Install scrcpy: https://github.com/Genymobile/scrcpy');
      addLog('   4. The main process emulator:launch handler streams via WebSocket');
      addLog('');
      addLog('   For Expo projects, use: npx expo start --android');
    } else if (!res.ok) {
      setEmulatorState('error');
      addLog(`✗ ${res.error}`);
    }
  };

  const handleStop = async () => {
    await (window as any).Cordex?.emulator?.stop?.();
    setEmulatorState('idle');
    setStreamUrl(null);
    addLog('Emulator stopped.');
  };

  const handleSendToEmulator = async () => {
    addLog(`Opening URL in emulator: ${expoUrl}`);
    await (window as any).Cordex?.emulator?.openUrl?.({ url: expoUrl }).catch(() => {
      addLog('  adb shell am start -a android.intent.action.VIEW -d ' + expoUrl);
    });
  };

  const handleExpoAndroid = () => {
    // Dispatch a run-in-terminal event — BottomPanel opens a named tab and runs the command
    window.dispatchEvent(new CustomEvent('cordex:run-in-terminal', {
      detail: {
        label: 'Expo Android',
        command: 'npx expo start --android',
      },
    }));
    addLog('▶ Running: npx expo start --android (see terminal tab "Expo Android")');
  };

  if (!visible) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0f172a', color: '#e2e8f0', fontSize: 12 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', display: 'flex',
        alignItems: 'center', gap: 8, flexShrink: 0, background: '#1e293b' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#22c55e' }}>android</span>
        <span style={{ fontWeight: 700, fontSize: 11, color: '#f1f5f9', flex: 1,
          textTransform: 'uppercase', letterSpacing: '0.5px' }}>Android Emulator</span>

        {/* Status badge */}
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, fontWeight: 600,
          background: emulatorState === 'running' ? '#14532d' : emulatorState === 'starting' ? '#1e3a5f' :
            emulatorState === 'error' ? '#450a0a' : '#1e293b',
          color: emulatorState === 'running' ? '#22c55e' : emulatorState === 'starting' ? '#60a5fa' :
            emulatorState === 'error' ? '#f87171' : '#64748b',
          border: `1px solid ${emulatorState === 'running' ? '#166534' : emulatorState === 'starting' ? '#1d4ed8' :
            emulatorState === 'error' ? '#7f1d1d' : '#334155'}`,
        }}>
          {emulatorState === 'running' ? '● Running' : emulatorState === 'starting' ? '⟳ Starting' :
            emulatorState === 'error' ? '✗ Error' : '○ Idle'}
        </span>

        <button onClick={onClose} style={{ padding: '3px', borderRadius: 4, border: 'none',
          background: 'transparent', cursor: 'pointer', color: '#64748b', display: 'flex' }}
          className="hover:bg-slate-700">
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>close</span>
        </button>
      </div>

      {/* ── Controls ──────────────────────────────────────────────────────────── */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>

        {/* Device selector */}
        <div ref={deviceMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDeviceMenuOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px',
              borderRadius: 5, border: '1px solid #334155', background: '#1e293b',
              color: '#e2e8f0', cursor: 'pointer', fontSize: 11 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#22c55e' }}>smartphone</span>
            {selectedDevice.label}
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>expand_more</span>
          </button>
          {deviceMenuOpen && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
              background: '#1e293b', border: '1px solid #334155', borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 200, overflow: 'hidden' }}>
              {PRESET_DEVICES.map(d => (
                <div key={d.id}
                  onClick={() => { setSelectedDevice(d); setDeviceMenuOpen(false); }}
                  style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 11,
                    background: d.id === selectedDevice.id ? '#0f172a' : 'transparent',
                    color: d.id === selectedDevice.id ? '#22c55e' : '#cbd5e1',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={e => { if (d.id !== selectedDevice.id) e.currentTarget.style.background = '#0f172a'; }}
                  onMouseLeave={e => { if (d.id !== selectedDevice.id) e.currentTarget.style.background = 'transparent'; }}>
                  <span>{d.label}</span>
                  <span style={{ fontSize: 9, color: '#475569' }}>API {d.api}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Launch / Stop */}
        {emulatorState === 'idle' || emulatorState === 'error' ? (
          <button onClick={handleLaunch}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              borderRadius: 5, border: 'none', background: '#22c55e', color: '#0f172a',
              cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>play_arrow</span>
            Launch
          </button>
        ) : emulatorState === 'starting' ? (
          <button disabled style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
            borderRadius: 5, border: 'none', background: '#1d4ed8', color: 'white',
            cursor: 'not-allowed', fontSize: 11, fontWeight: 700, opacity: 0.8 }}>
            <span className="material-symbols-outlined animate-spin" style={{ fontSize: 13 }}>autorenew</span>
            Starting…
          </button>
        ) : (
          <button onClick={handleStop}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              borderRadius: 5, border: 'none', background: '#ef4444', color: 'white',
              cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 13 }}>stop</span>
            Stop
          </button>
        )}

        {/* Expo quick-actions */}
        {emulatorState === 'running' && (
          <>
            <button onClick={handleExpoAndroid} title="Run npx expo start --android"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px',
                borderRadius: 5, border: '1px solid #334155', background: '#1e293b',
                color: '#a78bfa', cursor: 'pointer', fontSize: 11 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13 }}>open_in_app</span>
              Open Expo
            </button>
          </>
        )}
      </div>

      {/* ── URL bar for Expo ────────────────────────────────────────────── */}
      {emulatorState === 'running' && (
        <div style={{ padding: '6px 12px', borderBottom: '1px solid #1e293b', flexShrink: 0,
          display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 13, color: '#64748b' }}>link</span>
          <input value={expoUrl} onChange={e => setExpoUrl(e.target.value)}
            placeholder="exp://localhost:8081 or http://..."
            style={{ flex: 1, fontSize: 11, padding: '3px 6px', borderRadius: 4,
              border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', outline: 'none' }} />
          <button onClick={handleSendToEmulator}
            style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: '#1d4ed8',
              color: 'white', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
            Send
          </button>
        </div>
      )}

      {/* ── Stream view / idle ──────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        {streamUrl ? (
          <iframe
            ref={iframeRef}
            src={streamUrl}
            style={{ flex: 1, border: 'none', background: '#000' }}
            title="Android Emulator Stream"
          />
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 8, padding: 24 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#334155' }}>
              {emulatorState === 'starting' ? 'hourglass_top' : 'android'}
            </span>
            {emulatorState === 'idle' && (
              <>
                <p style={{ color: '#64748b', fontSize: 12, textAlign: 'center', margin: 0 }}>
                  Select a device and press Launch
                </p>
                <p style={{ color: '#475569', fontSize: 11, textAlign: 'center', margin: 0, maxWidth: 260, lineHeight: 1.6 }}>
                  Requires Android Studio AVD Manager and scrcpy for screen streaming.
                </p>
              </>
            )}
            {emulatorState === 'starting' && (
              <p style={{ color: '#60a5fa', fontSize: 12, textAlign: 'center', margin: 0 }}>
                Starting emulator… (30–60s)
              </p>
            )}
            {emulatorState === 'error' && (
              <p style={{ color: '#f87171', fontSize: 12, textAlign: 'center', margin: 0 }}>
                Launch failed — see logs below
              </p>
            )}
          </div>
        )}

        {/* ── Log console ──────────────────────────────────────────── */}
        <div ref={logsRef} style={{ height: streamUrl ? 120 : 180, overflowY: 'auto', background: '#0a0f1a',
          borderTop: '1px solid #1e293b', padding: '6px 12px', flexShrink: 0 }}>
          {logs.map((l, i) => (
            <div key={i} style={{ fontFamily: 'monospace', fontSize: 10, lineHeight: 1.6,
              color: l.startsWith('✓') ? '#22c55e' : l.startsWith('✗') || l.startsWith('⚠') ? '#f87171' :
                l.startsWith('  ') ? '#64748b' : '#94a3b8' }}>
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

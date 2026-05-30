import React, { useState, useRef, useCallback, useEffect } from 'react';

// ── Device presets (unchanged) ─────────────────────────────────────────────
interface Device {
  id: string;
  label: string;
  width: number;
  height: number;
  type: 'phone' | 'tablet' | 'desktop';
  os?: 'ios' | 'android';
  hasNotch?: boolean;
  hasHomeBar?: boolean;
  hasCameraHole?: boolean;
}

const PHONE_DEVICES: Device[] = [
  { id: 'iphone-15-pro',  label: 'iPhone 15 Pro',     width: 393,  height: 852,  type: 'phone',   os: 'ios',     hasNotch: false, hasHomeBar: true, hasCameraHole: true },
  { id: 'iphone-se',      label: 'iPhone SE',          width: 375,  height: 667,  type: 'phone',   os: 'ios',     hasNotch: false, hasHomeBar: false },
  { id: 'iphone-14',      label: 'iPhone 14',          width: 390,  height: 844,  type: 'phone',   os: 'ios',     hasNotch: false, hasHomeBar: true, hasCameraHole: true },
  { id: 'pixel-8',        label: 'Pixel 8',            width: 412,  height: 915,  type: 'phone',   os: 'android', hasCameraHole: true },
  { id: 'galaxy-s24',     label: 'Galaxy S24',         width: 360,  height: 780,  type: 'phone',   os: 'android', hasCameraHole: true },
  { id: 'galaxy-fold',    label: 'Galaxy Z Fold',      width: 344,  height: 882,  type: 'phone',   os: 'android' },
  { id: 'ipad-mini',      label: 'iPad Mini',          width: 768,  height: 1024, type: 'tablet',  os: 'ios' },
  { id: 'ipad-pro',       label: 'iPad Pro 11"',       width: 834,  height: 1194, type: 'tablet',  os: 'ios' },
];

const DESKTOP_PRESETS = [
  { id: 'full',  label: 'Full',   width: 0    },
  { id: '1440',  label: '1440',   width: 1440 },
  { id: '1280',  label: '1280',   width: 1280 },
  { id: '1024',  label: '1024',   width: 1024 },
];

const DEFAULT_URL = 'http://localhost:8081';
const PROXY_BASE = 'http://localhost:8081/proxy?';

// ── Phone chrome (unchanged) ───────────────────────────────────────────────
const SideButtons: React.FC<{ landscape: boolean; isIos: boolean }> = ({ landscape, isIos }) => (
  <>
    <div style={{
      position: 'absolute',
      ...(landscape ? { top: -3, left: 100, width: 44, height: 3 } : { left: -3, top: 120, width: 3, height: 34 }),
      background: isIos ? '#2a2a2a' : '#222',
      borderRadius: 2,
    }} />
    <div style={{
      position: 'absolute',
      ...(landscape ? { top: -3, left: 160, width: 44, height: 3 } : { left: -3, top: 168, width: 3, height: 34 }),
      background: isIos ? '#2a2a2a' : '#222',
      borderRadius: 2,
    }} />
    <div style={{
      position: 'absolute',
      ...(landscape ? { bottom: -3, left: 120, width: 60, height: 3 } : { right: -3, top: 140, width: 3, height: 60 }),
      background: isIos ? '#2a2a2a' : '#222',
      borderRadius: 2,
    }} />
  </>
);

const PhoneFrame: React.FC<{
  device: Device;
  landscape: boolean;
  scale: number;
  children: React.ReactNode;
}> = ({ device, landscape, scale, children }) => {
  const w = landscape ? device.height : device.width;
  const h = landscape ? device.width  : device.height;
  const isIos = device.os === 'ios';
  const borderR = landscape ? 44 : 48;

  return (
    <div style={{
      transform: `scale(${scale})`,
      transformOrigin: 'top center',
      width: w,
      flexShrink: 0,
    }}>
      <div style={{
        width: w,
        height: h,
        borderRadius: borderR,
        background: isIos ? '#1a1a1a' : '#111',
        padding: '10px',
        boxShadow: '0 0 0 1px #333, 0 0 0 2px #1a1a1a, 0 24px 64px rgba(0,0,0,0.55), 0 8px 20px rgba(0,0,0,0.4)',
        position: 'relative',
      }}>
        <SideButtons landscape={landscape} isIos={isIos} />
        <div style={{
          width: '100%', height: '100%',
          borderRadius: borderR - 10,
          overflow: 'hidden',
          background: '#000',
          position: 'relative',
        }}>
          {!landscape && device.hasCameraHole && (
            <div style={{
              position: 'absolute', top: isIos ? 12 : 10,
              left: '50%', transform: 'translateX(-50%)',
              width: isIos ? 120 : 14,
              height: isIos ? 34 : 14,
              background: '#000',
              borderRadius: isIos ? 20 : '50%',
              zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              {isIos && (
                <>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#111', border: '1px solid #222' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#1a1a1a' }} />
                </>
              )}
            </div>
          )}
          <div style={{ position: 'absolute', inset: 0 }}>
            {children}
          </div>
          {!landscape && device.hasHomeBar && (
            <div style={{
              position: 'absolute', bottom: 8, left: '50%',
              transform: 'translateX(-50%)',
              width: 130, height: 5,
              borderRadius: 3,
              background: 'rgba(255,255,255,0.3)',
              zIndex: 10,
            }} />
          )}
        </div>
      </div>
    </div>
  );
};

// ── Editable URL bar ───────────────────────────────────────────────────────
const EditableUrlBar: React.FC<{
  url: string;
  onNavigate: (newUrl: string) => void;
  onRefresh: () => void;
  loading: boolean;
}> = ({ url, onNavigate, onRefresh, loading }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditValue(url);
  }, [url]);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== url) onNavigate(trimmed);
    else setEditValue(url);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commit();
    else if (e.key === 'Escape') { setEditValue(url); setIsEditing(false); }
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: 'var(--bg-muted)',
      border: '1px solid var(--border-default)',
      borderRadius: 8, padding: '4px 8px', flex: 1, minWidth: 0,
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
        {loading ? 'autorenew' : 'lock'}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1, border: 'none', outline: 'none', background: 'transparent',
            fontSize: 11.5, color: 'var(--text-primary)', fontFamily: 'monospace', padding: 0, minWidth: 0,
          }}
          autoFocus
        />
      ) : (
        <span
          onClick={() => setIsEditing(true)}
          title="Click to edit URL"
          style={{
            fontSize: 11.5, color: 'var(--text-secondary)', flex: 1,
            textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', cursor: 'text',
          }}
        >
          {url}
        </span>
      )}
      <button onClick={onRefresh} title="Refresh"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
        <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`} style={{ fontSize: 13 }}>refresh</span>
      </button>
    </div>
  );
};

// ── Main BrowserPanel ───────────────────────────────────────────────────────
interface BrowserPanelProps {
  mode: 'phone' | 'desktop';
  onModeChange: (mode: 'phone' | 'desktop') => void;
  visible: boolean;
  onClose: () => void;
}

export const BrowserPanel: React.FC<BrowserPanelProps> = ({
  mode,
  onModeChange,
  visible,
  onClose,
}) => {
  const [selectedDevice, setSelectedDevice] = useState<Device>(PHONE_DEVICES[0]);
  const [landscape, setLandscape] = useState(false);
  const [desktopWidth, setDesktopWidth] = useState(0);
  const [isDraggingWidth, setIsDraggingWidth] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [hasError, setHasError] = useState(false);
  const [useProxy, setUseProxy] = useState(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const deviceMenuRef = useRef<HTMLDivElement>(null);

  const isLocalUrl = useCallback((url: string) => {
    try {
      const { hostname } = new URL(url);
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
    } catch { return false; }
  }, []);

  const iframeSrc = (() => {
    if (!useProxy || isLocalUrl(currentUrl)) return currentUrl;
    return `${PROXY_BASE}${encodeURIComponent(currentUrl)}`;
  })();

  const refresh = () => {
    setIframeKey(k => k + 1);
    setLoading(true);
    setHasError(false);
  };

  const handleNavigate = useCallback((newUrl: string) => {
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    setCurrentUrl(url);
    setLoading(true);
    setHasError(false);
    setIframeKey(k => k + 1);
  }, []);

  const openInNewTab = () => {
    window.open(currentUrl, '_blank', 'noopener,noreferrer');
  };

  const openInRightPanel = () => {
    if (!visible) {
      (window as any).__cordexToggleBrowser?.();
    }
  };

  const switchMode = (m: 'phone' | 'desktop') => {
    onModeChange(m);
    setLandscape(false);
  };

  // Dragging logic
  const dragStartWidthRef = useRef(0);
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragStartWidthRef.current = desktopWidth || 800;
    setIsDraggingWidth(true);
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDraggingWidth) return;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const dragDelta = e.clientX - (containerRect.left + containerRect.width);
      const newWidth = Math.max(320, dragStartWidthRef.current - dragDelta);
      setDesktopWidth(Math.min(containerRect.width - 50, newWidth));
    };
    const onMouseUp = () => setIsDraggingWidth(false);
    if (isDraggingWidth) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDraggingWidth]);

  // Close device menu on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target as Node)) {
        setDeviceMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  // Observe container size
  const [containerSize, setContainerSize] = useState({ w: 600, h: 700 });
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const phoneW = landscape ? selectedDevice.height : selectedDevice.width;
  const phoneH = landscape ? selectedDevice.width  : selectedDevice.height;
  const CHROME_H = 20;
  const scale = Math.min(
    (containerSize.w - 48) / (phoneW + CHROME_H * 2),
    (containerSize.h - 72) / (phoneH + CHROME_H * 2),
    1
  );

  const iosDevices   = PHONE_DEVICES.filter(d => d.os === 'ios');
  const androidDevices = PHONE_DEVICES.filter(d => d.os === 'android');
  const tabletDevices  = PHONE_DEVICES.filter(d => d.type === 'tablet');

  const iframeStyle: React.CSSProperties =
    mode === 'phone'
      ? { width: '100%', height: '100%', border: 'none', background: 'white' }
      : {
          width: desktopWidth || '100%',
          height: '100%',
          border: 'none',
          background: 'white',
          maxWidth: '100%',
          transition: isDraggingWidth ? 'none' : 'width 0.1s ease-out',
        };

  const showLoading = visible && loading && !hasError;

  const renderErrorFallback = () => (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-app)', gap: 12, padding: 24, textAlign: 'center',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--text-muted)' }}>error_outline</span>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>This page cannot be embedded</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', maxWidth: 280, lineHeight: 1.5 }}>
        The website may have blocked iframe embedding. Try enabling the proxy or open in a new tab.
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={openInNewTab}
          style={{
            padding: '6px 14px', borderRadius: 8,
            border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
          Open in new tab
        </button>
        {!isLocalUrl(currentUrl) && (
          <button onClick={() => setUseProxy(v => !v)}
            style={{
              padding: '6px 14px', borderRadius: 8,
              border: '1px solid var(--border-default)',
              background: useProxy ? '#2d4a2d' : 'var(--bg-elevated)',   // hardcoded green proxy indicator, adjust if needed
              color: useProxy ? '#aad94c' : 'var(--text-secondary)',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {useProxy ? 'toggle_on' : 'toggle_off'}
            </span>
            Proxy {useProxy ? 'ON' : 'OFF'}
          </button>
        )}
      </div>
    </div>
  );

  if (!visible) return null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg-app)',
      userSelect: 'none',
    }}>
      {/* Toolbar */}
      <div style={{
        height: 40, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        {/* Mode switcher */}
        <div style={{
          display: 'flex', background: 'var(--bg-muted)', borderRadius: 8, padding: 2, flexShrink: 0,
        }}>
          {(['phone', 'desktop'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)}
              title={m === 'phone' ? 'Mobile preview' : 'Desktop preview'}
              style={{
                padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                background: mode === m ? 'var(--bg-subtle)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                transition: 'all 0.15s',
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                {m === 'phone' ? 'smartphone' : 'desktop_windows'}
              </span>
            </button>
          ))}
        </div>

        {/* Device picker (phone mode) */}
        {mode === 'phone' && (
          <div ref={deviceMenuRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setDeviceMenuOpen(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 8px 3px 6px', borderRadius: 7,
                border: '1px solid var(--border-default)',
                background: deviceMenuOpen ? 'var(--bg-muted)' : 'var(--bg-elevated)',
                cursor: 'pointer', fontSize: 11.5,
                color: 'var(--text-primary)', fontWeight: 500,
              }}>
              <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {selectedDevice.os === 'ios' ? 'phone_iphone' : selectedDevice.type === 'tablet' ? 'tablet_mac' : 'phone_android'}
              </span>
              {selectedDevice.label}
              <span className="material-symbols-outlined" style={{ fontSize: 12, color: 'var(--text-muted)' }}>expand_more</span>
            </button>
            {deviceMenuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', left: 0,
                background: 'var(--bg-elevated)',      /* solid, never transparent */
                border: '1px solid var(--border-default)',
                borderRadius: 10,
                boxShadow: '0 8px 24px rgba(0,0,0,0.3)', zIndex: 100, minWidth: 180, padding: 4,
              }}>
                {[
                  { label: 'iOS', devices: iosDevices },
                  { label: 'Android', devices: androidDevices },
                  { label: 'Tablet', devices: tabletDevices },
                ].map(group => (
                  <div key={group.label}>
                    <div style={{
                      fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.6px', color: 'var(--text-muted)',
                      padding: '6px 10px 2px',
                    }}>{group.label}</div>
                    {group.devices.map(d => (
                      <button key={d.id} onClick={() => { setSelectedDevice(d); setDeviceMenuOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '5px 10px', border: 'none',
                          background: selectedDevice.id === d.id ? 'var(--bg-muted)' : 'transparent',
                          cursor: 'pointer', borderRadius: 6, fontSize: 12,
                          color: selectedDevice.id === d.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontWeight: selectedDevice.id === d.id ? 600 : 400,
                        }}>
                        <span>{d.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.width}×{d.height}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Width picker (desktop mode) */}
        {mode === 'desktop' && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
            {DESKTOP_PRESETS.map(p => (
              <button key={p.id} onClick={() => setDesktopWidth(p.width)}
                style={{
                  padding: '3px 8px', borderRadius: 6, border: '1px solid',
                  borderColor: desktopWidth === p.width ? '#f97316' : 'var(--border-default)',
                  background: desktopWidth === p.width ? '#3a2c1a' : 'var(--bg-elevated)',
                  color: desktopWidth === p.width ? '#f97316' : 'var(--text-secondary)',
                  fontSize: 11, fontWeight: desktopWidth === p.width ? 600 : 400,
                  cursor: 'pointer',
                }}>
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* Rotate (phone only) */}
        {mode === 'phone' && (
          <button onClick={() => setLandscape(l => !l)} title={landscape ? 'Portrait' : 'Landscape'}
            style={{
              padding: '4px', borderRadius: 7, border: '1px solid var(--border-default)',
              background: landscape ? 'var(--bg-muted)' : 'var(--bg-elevated)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              color: 'var(--text-secondary)', flexShrink: 0,
            }}>
            <span className="material-symbols-outlined" style={{
              fontSize: 15,
              transform: landscape ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}>screen_rotation</span>
          </button>
        )}

        {/* Dimensions badge */}
        <div style={{
          fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0,
          fontFamily: 'monospace',
        }}>
          {mode === 'phone'
            ? `${landscape ? selectedDevice.height : selectedDevice.width} × ${landscape ? selectedDevice.width : selectedDevice.height}`
            : desktopWidth ? `${desktopWidth}px` : 'Full width'
          }
        </div>

        <EditableUrlBar url={currentUrl} onNavigate={handleNavigate} onRefresh={refresh} loading={loading} />

        <button onClick={() => setUseProxy(v => !v)}
          title={useProxy ? 'Proxy ON – click to disable' : 'Proxy OFF – click to enable'}
          style={{
            padding: 4, borderRadius: 7, border: '1px solid var(--border-default)',
            background: useProxy ? '#2d4a2d' : 'var(--bg-elevated)',
            color: useProxy ? '#aad94c' : 'var(--text-secondary)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0,
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            {useProxy ? 'cloud' : 'cloud_off'}
          </span>
        </button>

        <button onClick={openInNewTab} title="Open in new tab"
          style={{
            padding: 4, borderRadius: 7, border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)', cursor: 'pointer', display: 'flex',
            alignItems: 'center', color: 'var(--text-secondary)', flexShrink: 0,
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span>
        </button>

        <button onClick={openInRightPanel} title="Focus right panel"
          style={{
            padding: 4, borderRadius: 7, border: '1px solid var(--border-default)',
            background: 'var(--bg-elevated)', cursor: 'pointer', display: 'flex',
            alignItems: 'center', color: 'var(--text-secondary)', flexShrink: 0,
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_in_picture_alt</span>
        </button>

        <button onClick={onClose} title="Close preview"
          style={{
            padding: 4, borderRadius: 7, border: 'none', background: 'none',
            cursor: 'pointer', color: 'var(--text-muted)',
            flexShrink: 0, display: 'flex',
          }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      {/* Preview area */}
      <div ref={containerRef} style={{
        flex: 1, overflow: mode === 'phone' ? 'hidden' : 'visible',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: mode === 'phone' ? '16px 0' : 0,
        background: mode === 'phone' ? 'var(--bg-subtle)' : 'var(--bg-app)',
        position: 'relative',
      }}>
        {hasError ? (
          renderErrorFallback()
        ) : (
          <>
            {mode === 'phone' ? (
              <PhoneFrame device={selectedDevice} landscape={landscape} scale={scale}>
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  src={iframeSrc}
                  style={iframeStyle}
                  onLoad={() => setLoading(false)}
                  onError={() => { setLoading(false); setHasError(true); }}
                  title="Preview"
                />
              </PhoneFrame>
            ) : (
              <div style={{
                position: 'relative',
                width: desktopWidth ? Math.min(desktopWidth, containerSize.w) : '100%',
                height: '100%',
                flexShrink: 0,
              }}>
                <iframe
                  key={iframeKey}
                  ref={iframeRef}
                  src={iframeSrc}
                  style={iframeStyle}
                  onLoad={() => setLoading(false)}
                  onError={() => { setLoading(false); setHasError(true); }}
                  title="Preview"
                />
                {/* Draggable resize handle */}
                <div
                  onMouseDown={onMouseDown}
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 8,
                    cursor: 'ew-resize',
                    zIndex: 20,
                    background: isDraggingWidth ? 'rgba(249,115,22,0.6)' : 'transparent',
                    transition: isDraggingWidth ? 'none' : 'background 0.2s',
                  }}
                  onMouseEnter={e => { if (!isDraggingWidth) e.currentTarget.style.background = 'rgba(249,115,22,0.3)'; }}
                  onMouseLeave={e => { if (!isDraggingWidth) e.currentTarget.style.background = 'transparent'; }}
                />
              </div>
            )}
          </>
        )}
        {showLoading && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10, 14, 20, 0.7)',  // based on --bg-app with opacity
            pointerEvents: 'none',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined animate-spin" style={{ fontSize: 24, color: 'var(--text-muted)' }}>autorenew</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading {currentUrl}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
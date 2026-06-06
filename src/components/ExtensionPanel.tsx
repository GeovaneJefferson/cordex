import React, { useState } from 'react';
import type { Extension } from '../extensions/types';
import { getExtensions, setExtensionState } from '../extensions/registry';

// Bundle categories — these are the only category shown now
const BUNDLE_IDS = ['bundle-python', 'bundle-typescript', 'bundle-java', 'bundle-gdscript', 'bundle-rust'];

const LANG_ICONS: Record<string, { color: string; icon: string }> = {
  'bundle-python':     { color: '#3b82f6', icon: 'code' },
  'bundle-typescript': { color: '#3178c6', icon: 'code' },
  'bundle-java':       { color: '#f89820', icon: 'coffee' },
  'bundle-gdscript':   { color: '#478cbf', icon: 'videogame_asset' },
  'bundle-rust':       { color: '#f97316', icon: 'settings_applications' },
  'bundle-sql':        { color: '#0ea5e9', icon: 'storage' },
  'android-emulator':  { color: '#22c55e', icon: 'android' },
};

export const ExtensionPanel: React.FC = () => {
  const [extensions, setExtensions] = useState<Extension[]>(getExtensions);
  const [installing, setInstalling] = useState<string | null>(null);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const refresh = () => setExtensions(getExtensions());

  const handleInstall = async (ext: Extension) => {
    setInstalling(ext.id);
    if (ext.installCommands?.length) {
      for (const cmd of ext.installCommands) {
        (window as any).Cordex?.terminal?.writeActive?.(cmd + '\n');
      }
      await new Promise(r => setTimeout(r, 600));
    } else {
      await new Promise(r => setTimeout(r, 900));
    }
    setExtensionState(ext.id, { status: 'installed', enabled: true });
    setInstalling(null);
    refresh();
    if (ext.panelType === 'android-emulator') {
      setTimeout(() => (window as any).__cordexOpenEmulator?.(), 300);
    }
  };

  const handleToggle = (ext: Extension) => {
    setExtensionState(ext.id, { enabled: !ext.enabled });
    refresh();
  };

  const handleUninstall = (ext: Extension) => {
    setExtensionState(ext.id, { status: 'available', enabled: false });
    refresh();
  };

  // Split into language bundles and tools
  const bundles = extensions.filter(e => e.id.startsWith('bundle-'));
  const tools   = extensions.filter(e => !e.id.startsWith('bundle-'));
  const installedCount = extensions.filter(e => e.status === 'installed').length;

  const renderBundle = (ext: Extension) => {
    const isInstalled  = ext.status === 'installed';
    const isInstalling = installing === ext.id;
    const isExpanded   = expanded === ext.id;
    const meta = LANG_ICONS[ext.id] ?? { color: 'var(--accent)', icon: 'extension' };

    return (
      <div
        key={ext.id}
        style={{
          margin: '6px 8px',
          border: `1.5px solid ${isInstalled ? meta.color + '44' : 'var(--border-default)'}`,
          borderRadius: 10,
          overflow: 'hidden',
          background: isInstalled ? meta.color + '08' : 'var(--bg-app)',
          transition: 'all 0.15s',
        }}
      >
        {/* Main row */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer' }}
          onClick={() => setExpanded(isExpanded ? null : ext.id)}
        >
          {/* Language icon badge */}
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: meta.color + '18',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: meta.color }}>
              {meta.icon}
            </span>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{ext.name}</span>
              {isInstalled && ext.enabled && (
                <span style={{ fontSize: 9, background: meta.color + '22', color: meta.color, padding: '1px 6px', borderRadius: 8, fontWeight: 700 }}>ACTIVE</span>
              )}
              {isInstalled && !ext.enabled && (
                <span style={{ fontSize: 9, background: 'var(--bg-muted)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 8, fontWeight: 600 }}>OFF</span>
              )}
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ext.description}
            </p>
          </div>

          {/* Chevron */}
          <span className="material-symbols-outlined" style={{
            fontSize: 16, color: 'var(--text-muted)',
            transform: isExpanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 0.15s', flexShrink: 0,
          }}>chevron_right</span>
        </div>

        {/* Expanded detail */}
        {isExpanded && (
          <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--border-subtle)' }}>
            {/* Capabilities chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '8px 0' }}>
              {ext.capabilities?.map(cap => (
                <span
                  key={cap.id}
                  title={cap.description}
                  style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 12,
                    background: meta.color + '14', color: meta.color,
                    border: `1px solid ${meta.color}30`, fontWeight: 600,
                  }}
                >
                  {cap.label}
                </span>
              ))}
            </div>

            {/* Install note */}
            {ext.installNote && (
              <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                {ext.installNote}
              </p>
            )}

            {/* Install commands preview */}
            {ext.installCommands && ext.installCommands.length > 0 && !isInstalled && (
              <div style={{
                background: 'var(--bg-elevated)', borderRadius: 6, padding: '6px 8px',
                marginBottom: 10, maxHeight: 80, overflowY: 'auto',
              }}>
                {ext.installCommands.map((cmd, i) => (
                  <p key={i} style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
                    {cmd}
                  </p>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 6 }}>
              {!isInstalled ? (
                <button
                  onClick={() => handleInstall(ext)}
                  disabled={isInstalling}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '7px 12px', borderRadius: 8,
                    background: meta.color, color: '#fff',
                    border: 'none', cursor: isInstalling ? 'not-allowed' : 'pointer',
                    fontSize: 12, fontWeight: 700,
                    opacity: isInstalling ? 0.6 : 1, transition: 'opacity 0.15s',
                  }}
                >
                  <span className={`material-symbols-outlined text-[14px] ${isInstalling ? 'animate-spin' : ''}`}>
                    {isInstalling ? 'autorenew' : 'download'}
                  </span>
                  {isInstalling ? 'Installing…' : `Install ${ext.name}`}
                </button>
              ) : (
                <>
                  <button
                    onClick={() => handleToggle(ext)}
                    style={{
                      flex: 1, padding: '6px 10px', borderRadius: 8,
                      background: ext.enabled ? 'var(--bg-muted)' : meta.color + '22',
                      border: `1px solid ${ext.enabled ? 'var(--border-default)' : meta.color + '44'}`,
                      color: ext.enabled ? 'var(--text-secondary)' : meta.color,
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {ext.enabled ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => handleUninstall(ext)}
                    style={{
                      padding: '6px 10px', borderRadius: 8,
                      background: 'transparent', border: '1px solid #ef444440',
                      color: '#ef4444', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-app)' }}>
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
          Extensions
          <span style={{
            fontSize: 9, background: 'var(--bg-elevated)', color: 'var(--text-muted)',
            padding: '1px 6px', borderRadius: 10, fontWeight: 600,
          }}>
            {installedCount} installed
          </span>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
          One click installs everything for your language.
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }} className="sidebar-scroll">
        {/* Language Bundles */}
        <div style={{ padding: '8px 0 2px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>
          Language Bundles
        </div>
        {bundles.map(renderBundle)}

        {/* Tools */}
        {tools.length > 0 && (
          <>
            <div style={{ padding: '12px 0 2px 12px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-muted)' }}>
              Tools
            </div>
            {tools.map(renderBundle)}
          </>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import type { Extension, ExtensionCapability, ExtensionCategory } from '../extensions/types';
import { getExtensions, setExtensionState } from '../extensions/registry';

const CAT_LABELS: Record<ExtensionCategory, string> = {
  language: 'Language Support', formatter: 'Formatters', linter: 'Linters',
  theme: 'Themes', tool: 'Tools', ai: 'AI',
};
const CAT_ORDER: ExtensionCategory[] = ['language', 'ai', 'formatter', 'linter', 'tool', 'theme'];

export const ExtensionPanel: React.FC = () => {
  const [extensions, setExtensions] = useState<Extension[]>(getExtensions);
  const [search, setSearch]         = useState('');
  const [installing, setInstalling] = useState<string | null>(null);

  const refresh = () => setExtensions(getExtensions());

  const filtered = extensions.filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.description.toLowerCase().includes(search.toLowerCase()) ||
    e.category.includes(search.toLowerCase())
  );

  const grouped = CAT_ORDER.reduce((acc, cat) => {
    const list = filtered.filter(e => e.category === cat);
    if (list.length) acc.push({ cat, list });
    return acc;
  }, [] as { cat: ExtensionCategory; list: Extension[] }[]);

  const handleInstall = async (ext: Extension) => {
    setInstalling(ext.id);

    // For extensions with real installCommands, print them to the terminal
    if (ext.installCommands?.length) {
      for (const cmd of ext.installCommands) {
        (window as any).Cordex?.terminal?.writeActive?.(cmd + '\n');
      }
      // Give IPC a moment, then mark installed
      await new Promise(r => setTimeout(r, 600));
    } else {
      await new Promise(r => setTimeout(r, 900));
    }

    setExtensionState(ext.id, { status: 'installed', enabled: true });
    setInstalling(null);
    refresh();

    // If this extension opens a panel, trigger it immediately after install
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

  const installedCount = extensions.filter(e => e.status === 'installed').length;

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'white' }}>
      {/* Header */}
      <div style={{ padding:'10px 12px 8px', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#0f172a', marginBottom:6 }}>
          Extensions
          <span style={{ marginLeft:6, fontSize:9, background:'#f1f5f9', color:'#64748b',
            padding:'1px 6px', borderRadius:10, fontWeight:600 }}>
            {installedCount} installed
          </span>
        </div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search extensions…"
          style={{ width:'100%', fontSize:11, padding:'5px 8px', borderRadius:6,
            border:'1px solid #e2e8f0', outline:'none', background:'#f8fafc', color:'#374151' }}
        />
      </div>

      {/* List */}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', minHeight:0, padding:'4px 0' }}
        className="sidebar-scroll">
        {grouped.map(({ cat, list }) => (
          <div key={cat}>
            <div style={{ padding:'8px 12px 3px', fontSize:9, fontWeight:700,
              textTransform:'uppercase', letterSpacing:'0.6px', color:'#94a3b8' }}>
              {CAT_LABELS[cat]}
            </div>
            {list.map(ext => (
              <ExtensionRow
                key={ext.id} ext={ext}
                isInstalling={installing === ext.id}
                onInstall={() => handleInstall(ext)}
                onToggle={() => handleToggle(ext)}
                onUninstall={() => handleUninstall(ext)}
              />
            ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding:'24px 12px', textAlign:'center', color:'#94a3b8', fontSize:12 }}>
            No extensions match "{search}"
          </div>
        )}
      </div>
    </div>
  );
};

// ── Individual extension row ────────────────────────────────────────────────
const ExtensionRow: React.FC<{
  ext: Extension; isInstalling: boolean;
  onInstall: () => void; onToggle: () => void; onUninstall: () => void;
}> = ({ ext, isInstalling, onInstall, onToggle, onUninstall }) => {
  const [expanded, setExpanded] = useState(false);
  const isInstalled = ext.status === 'installed';

  return (
    <div style={{ borderBottom:'1px solid #f1f5f9' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 12px',
          cursor:'pointer', transition:'background 0.1s' }}
        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Icon */}
        <div style={{ width:30, height:30, borderRadius:7, background:`${ext.iconColor}18`,
          display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span className="material-symbols-outlined" style={{ fontSize:16, color:ext.iconColor }}>
            {ext.icon}
          </span>
        </div>

        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:1 }}>
            <span style={{ fontSize:12, fontWeight:600, color:'#0f172a' }}>{ext.name}</span>
            <span style={{ fontSize:9, color:'#94a3b8' }}>v{ext.version}</span>
            {isInstalled && ext.enabled && (
              <span style={{ fontSize:9, background:'#dcfce7', color:'#15803d',
                padding:'1px 5px', borderRadius:8, fontWeight:600 }}>ON</span>
            )}
            {isInstalled && !ext.enabled && (
              <span style={{ fontSize:9, background:'#f1f5f9', color:'#64748b',
                padding:'1px 5px', borderRadius:8, fontWeight:600 }}>OFF</span>
            )}
          </div>
          <div style={{ fontSize:10, color:'#64748b', lineHeight:1.5,
            overflow:'hidden', display:'-webkit-box',
            WebkitLineClamp: expanded ? 999 : 3,
            WebkitBoxOrient:'vertical' }}>
            {ext.description}
          </div>
          <div style={{ fontSize:9, color:'#94a3b8', marginTop:1 }}>by {ext.author}</div>
        </div>

        {/* Action */}
        <div onClick={e => e.stopPropagation()} style={{ flexShrink:0 }}>
          {isInstalled ? (
            <div style={{ display:'flex', gap:4 }}>
              <button onClick={onToggle} style={{
                fontSize:10, padding:'3px 8px', borderRadius:5, cursor:'pointer', fontWeight:600,
                background: ext.enabled ? '#fee2e2' : '#dcfce7',
                color:      ext.enabled ? '#dc2626' : '#16a34a',
                border: `1px solid ${ext.enabled ? '#fca5a5' : '#86efac'}`,
              }}>
                {ext.enabled ? 'Disable' : 'Enable'}
              </button>
            </div>
          ) : (
            <button onClick={onInstall} disabled={isInstalling} style={{
              fontSize:10, padding:'3px 10px', borderRadius:5, cursor:'pointer', fontWeight:600,
              background: isInstalling ? '#f1f5f9' : '#f97316',
              color:      isInstalling ? '#94a3b8'  : 'white',
              border: 'none', display:'flex', alignItems:'center', gap:4,
              opacity: isInstalling ? 0.8 : 1,
            }}>
              {isInstalling && (
                <span className="material-symbols-outlined" style={{ fontSize:12, animation:'spin 1s linear infinite' }}>
                  autorenew
                </span>
              )}
              {isInstalling ? 'Installing…' : 'Install'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding:'0 12px 10px 52px' }}>
          {ext.capabilities.length > 0 && (
            <div style={{ marginBottom:6 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', marginBottom:4 }}>
                Features
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {ext.capabilities.map(cap => (
                  <span key={cap.id} title={cap.description} style={{
                    fontSize:10, padding:'2px 7px', borderRadius:10,
                    background:`${ext.iconColor}12`, color:ext.iconColor,
                    border:`1px solid ${ext.iconColor}30`, cursor:'help',
                  }}>
                    {cap.label}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ext.installCommands && ext.installCommands.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', marginBottom:4 }}>
                Install Commands
              </div>
              <div style={{ background:'#0f172a', borderRadius:6, padding:'7px 10px', fontFamily:'monospace', fontSize:10, lineHeight:1.7 }}>
                {ext.installCommands.map((cmd, i) => (
                  <div key={i} style={{ color: cmd.startsWith('#') ? '#64748b' : '#86efac' }}>{cmd}</div>
                ))}
              </div>
            </div>
          )}
          {ext.installNote && !ext.installCommands?.length && (
            <div style={{ fontSize:10, color:'#64748b', background:'#f8fafc',
              borderRadius:5, padding:'5px 8px', fontFamily:'monospace' }}>
              ℹ {ext.installNote}
            </div>
          )}
          {ext.panelType && isInstalled && ext.enabled && (
            <button
              onClick={() => {
                if (ext.panelType === 'android-emulator') (window as any).__cordexOpenEmulator?.();
              }}
              style={{ marginTop:4, fontSize:10, padding:'3px 10px', borderRadius:5, border:'none',
                background:'#22c55e', color:'white', cursor:'pointer', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
              <span className="material-symbols-outlined" style={{ fontSize:12 }}>open_in_new</span>
              Open Panel
            </button>
          )}
          {isInstalled && (
            <button onClick={onUninstall} style={{
              marginTop:6, fontSize:10, color:'#dc2626', background:'none',
              border:'none', cursor:'pointer', padding:0,
            }}>
              Uninstall
            </button>
          )}
        </div>
      )}
    </div>
  );
};

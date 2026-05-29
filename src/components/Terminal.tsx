import React, { useEffect, useState, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { useTerminal } from '../hooks/useTerminal';

interface TerminalProps {
  id: string;
  isVisible: boolean;
}

export const Terminal: React.FC<TerminalProps> = ({ id, isVisible }) => {
  const { state } = useAppState();
  const { containerRef, fitTerminal, termRef } = useTerminal({
    id,
    cwd: state.projectRoot ?? undefined,
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0,
  });

  // ── Fit on visibility change ──────────────────────────────
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => fitTerminal(), 30);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fitTerminal]);

  // ── Copy helpers ─────────────────────────────────────────
  const copySelection = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).catch(() => {
        // fallback for older Electron
        const textarea = document.createElement('textarea');
        textarea.value = selection;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      });
    }
  }, [termRef]);

  // ── Keyboard copy shortcut ───────────────────────────────
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // Attach custom key handler
    term.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
      // Ctrl+Shift+C (standard terminal copy)
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        copySelection();
        return false; // prevent default
      }
      // Optional: Ctrl+C when text is selected (like many terminals)
      if (e.ctrlKey && e.code === 'KeyC' && term.hasSelection()) {
        copySelection();
        return false;
      }
      return true;
    });

    return () => {
      // cleanup if necessary – but attachCustomKeyEventHandler replaces previous handler;
      // we can't remove it, but it's fine since the terminal will be disposed.
    };
  }, [termRef, copySelection]);

  // ── Focus the terminal when it becomes visible ─────────────────────────────
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        termRef.current?.focus();
      }, 80); // short delay to let the DOM update
      return () => clearTimeout(timer);
    }
  }, [isVisible, termRef]);

  // ── Right‑click context menu ─────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextMenu = (e: MouseEvent) => {
      const term = termRef.current;
      if (!term || !term.hasSelection()) return;
      e.preventDefault();
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    };

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [containerRef, termRef]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    if (!contextMenu.visible) return;
    const close = () => setContextMenu({ visible: false, x: 0, y: 0 });
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu.visible]);

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        style={{ padding: '4px 8px', backgroundColor: 'var(--bg-app)' }}
      />
      {contextMenu.visible && (
        <div
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 100,
          }}
          className="border border-gray-200 rounded shadow-lg py-1 text-xs"
          style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-secondary)' }}
        >
          <button
            onClick={() => {
              copySelection();
              setContextMenu({ visible: false, x: 0, y: 0 });
            }}
            className="w-full text-left px-3 py-1 hover:bg-gray-100 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[14px]">content_copy</span>
            Copy
          </button>
        </div>
      )}
    </div>
  );
};
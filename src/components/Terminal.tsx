import React, { useEffect, useState, useCallback } from 'react';
import { useAppState } from '../store/AppContext';
import { useTerminal } from '../hooks/useTerminal';
// Assuming Xterm is imported here from 'xterm'
import { Terminal as XTermInstance } from 'xterm';

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

  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0,
  });

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => fitTerminal(), 30);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fitTerminal]);

  const copySelection = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    
    // Correct way to get selection length in xterm.js
    const selection = term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).catch(async () => {
        // Fallback
        await navigator.clipboard.writeText(selection);
      });
    }
  }, [termRef]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    // Use proper xterm typing
    const disposable = term.attachCustomKeyEventHandler((e: KeyboardEvent): boolean => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
        copySelection();
        return false;
      }
      // Check selection existence using selection string length
      if (e.ctrlKey && e.code === 'KeyC' && term.getSelection().length > 0) {
        copySelection();
        return false;
      }
      return true;
    });

    return () => {
      disposable.dispose(); // IMPORTANT: xterm returns a disposable
    };
  }, [termRef, copySelection]);

  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        termRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isVisible, termRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContextMenu = (e: MouseEvent) => {
      const term = termRef.current;
      // Fixed: hasSelection is not a method, check length of selection
      if (!term || term.getSelection().length === 0) return;
      e.preventDefault();
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    };

    container.addEventListener('contextmenu', handleContextMenu);
    return () => container.removeEventListener('contextmenu', handleContextMenu);
  }, [containerRef, termRef]);

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
            backgroundColor: 'var(--bg-app)',
          }}
          className="border border-gray-200 rounded shadow-lg py-1 text-xs"
        >
          <button
            onClick={() => {
              copySelection();
              setContextMenu({ visible: false, x: 0, y: 0 });
            }}
            className="w-full text-left px-3 py-1 hover:bg-gray-100"
          >
            Copy
          </button>
        </div>
      )}
    </div>
  );
};
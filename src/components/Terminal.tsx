import React, { useEffect } from 'react';
import { useAppState } from '../store/AppContext';
import { useTerminal } from '../hooks/useTerminal';

interface TerminalProps {
  id: string;
  isVisible: boolean;
}

export const Terminal: React.FC<TerminalProps> = ({ id, isVisible }) => {
  const { state } = useAppState();

  const { containerRef, fitTerminal } = useTerminal({
    id: id, // Pass unique instance id (e.g. 'terminal-1', 'terminal-2')
    cwd: state.projectRoot ?? undefined,
  });

  // Hot-Fixing layout constraints: Whenever the terminal is flipped from hidden to visible state, 
  // trigger fit calculations so the layout lines adjust to the dimensions seamlessly.
  useEffect(() => {
    if (isVisible) {
      // Small deferred timeout macro-task to let display: none paint complete
      const timer = setTimeout(() => {
        fitTerminal();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isVisible, fitTerminal]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden bg-white"
      style={{ padding: '4px 8px' }}
    />
  );
};
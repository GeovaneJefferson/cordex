import React from 'react';
import { useAppState } from '../store/AppContext';
import { useTerminal } from '../hooks/useTerminal';

export const Terminal: React.FC = () => {
  const { state } = useAppState();

  const { containerRef } = useTerminal({
    id: 'main-terminal',
    cwd: state.projectRoot ?? undefined,
  });

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full overflow-hidden bg-white"
      style={{ padding: '4px 8px' }}
    />
  );
};
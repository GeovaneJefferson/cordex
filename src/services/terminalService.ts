const api = window.Cordex?.terminal;

export const terminalService = {
  create: (id: string, cwd: string, cols: number, rows: number) =>
    api?.create(id, cwd, cols, rows),

  write: (id: string, data: string) =>
    api?.write(id, data),

  resize: (id: string, cols: number, rows: number) =>
    api?.resize(id, cols, rows),

  destroy: (id: string) =>
    api?.destroy(id),

  /** Returns a cleanup function that removes the listener. */
  onData: (id: string, cb: (data: string) => void): (() => void) =>
    api?.onData(id, cb) ?? (() => {}),

  /** Returns a cleanup function that removes the listener. */
  onExit: (id: string, cb: (details: { exitCode: number; killed: boolean }) => void): (() => void) =>
    api?.onExit(id, cb) ?? (() => {}),
};

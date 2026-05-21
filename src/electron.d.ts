interface CordexAPI {
  ai: {
    complete:  (payload: { prompt: string; model?: string; temperature?: number }) => Promise<{ ok: boolean; text?: string; aborted?: boolean; error?: string }>;
    analyze:   (payload: { code: string; model?: string }) => Promise<{ ok: boolean; text?: string; aborted?: boolean; error?: string }>;
    abort:     (key: string) => void;
    ping:      () => Promise<{ ok: boolean; models: string[] }>;
    onChunk:   (callback: (chunk: string) => void) => void;
    docstring: (payload: { code: string; model?: string }) => Promise<{ ok: boolean; docstring?: string; error?: string }>;
    fixError:  (params: { errorMessage: string; filePath: string; line: number; column?: number; codeSnippet: string }) => Promise<{ ok: boolean; explanation?: string; fixedCode?: string; error?: string }>;
  };
  fs: {
    openProject:  () => Promise<string | null>;
    readDir:      (dir: string) => Promise<{ ok: boolean; tree?: any[]; root?: string; error?: string }>;
    readFile:     (path: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
    writeFile:    (path: string, content: string) => Promise<{ ok: boolean; error?: string }>;
    createFile:   (dir: string, name: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    createFolder: (dir: string, name: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    rename:       (oldPath: string, newName: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    delete:       (path: string) => Promise<{ ok: boolean; error?: string }>;
    move:         (src: string, destDir: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    watch:        (dir: string) => Promise<{ ok: boolean; error?: string }>;
    stopWatch:    () => Promise<{ ok: boolean }>;
    onChange:     (callback: (ev: any) => void) => () => void;
  };
  terminal: {
    create:  (id: string, cwd: string, cols: number, rows: number) => Promise<{ ok: boolean; error?: string }>;
    write:   (id: string, data: string) => void;
    resize:  (id: string, cols: number, rows: number) => Promise<{ ok: boolean }>;
    destroy: (id: string) => Promise<{ ok: boolean }>;
    onData:  (id: string, callback: (data: string) => void) => () => void;
    onExit:  (id: string, callback: (details: any) => void) => () => void;
  };
  hardware: {
    info:        () => Promise<any>;
    checkModels: () => Promise<any>;
    onDetected:  (callback: (hw: any) => void) => void;
  };
  settings: {
    get: () => Promise<any>;
    set: (updates: Record<string, any>) => Promise<any>;
  };
  window: {
    minimize: () => void;
    maximize: () => void;
    close:    () => void;
  };
  llama: {
    start:      (opts?: any) => Promise<{ ok: boolean; error?: string }>;
    stop:       () => Promise<void>;
    status:     () => Promise<{ status: string; error?: string | null; binary?: string | null; model?: string | null; models?: any[] }>;
    saveConfig: (cfg: any) => Promise<any>;
    onStatus:   (callback: (d: { status: string; error?: string }) => void) => () => void;
  };
  session: {
    save: (data: any) => Promise<{ ok: boolean }>;
    load: () => Promise<any>;
  };
}

interface ElectronAPI {
  saveFlow:    (fileHash: string, flowData: any) => Promise<any>;
  loadFlow:    (fileHash: string) => Promise<any>;
  analyzeFlow: (payload: { code: string; filePath?: string | null; projectRoot?: string | null }) => Promise<any>;
  deleteFlow:  (fileHash: string) => Promise<any>;
  systemMemory: () => Promise<any>;
  execCommand:  (cmd: string, cwd?: string) => Promise<any>;
}

interface Window {
  Cordex: CordexAPI;
  electronAPI: ElectronAPI;
}

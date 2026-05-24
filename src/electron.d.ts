// ── Snapshot type for local history ───────────────────────────────────
interface HistorySnapshot {
  id: number;
  timestamp: number;
  size: number;
}

interface CordexAPI {
  ai: {
    // ── Legacy / existing ─────────────────────────────────────────────
    complete:  (payload: { prompt: string; model?: string; temperature?: number }) => Promise<{ ok: boolean; text?: string; aborted?: boolean; error?: string }>;
    analyze:   (payload: { code: string; model?: string }) => Promise<{ ok: boolean; text?: string; aborted?: boolean; error?: string }>;
    abort:     (key: string) => void;
    ping:      () => Promise<{ ok: boolean; models: string[] }>;
    onChunk:   (callback: (chunk: string) => void) => void;
    docstring: (payload: { code: string; model?: string }) => Promise<{ ok: boolean; docstring?: string; error?: string }>;
    fixError:  (params: { errorMessage: string; filePath: string; line: number; column?: number; codeSnippet: string }) => Promise<{ ok: boolean; explanation?: string; fixedCode?: string; error?: string }>;
    documentProject: (root: string, model?: string) => Promise<{ ok: boolean; error?: string }>;
    chatStream: (payload: any, callbacks: { onChunk?: (t: string) => void; onDone?: () => void; onError?: (e: string) => void }) => () => void;

    // ── AI Router — autocomplete (ghost) ──────────────────────────────
    autocomplete:      (p: { before: string; after: string; language: string; model?: string }) => Promise<{ ok: boolean; text: string; aborted?: boolean; error?: string }>;
    autocompleteAbort: () => void;

    // ── AI Router — reasoning agent (streaming) ───────────────────────
    reason: (
      payload: {
        mode: 'bugfix' | 'refactor' | 'explain' | 'generate' | 'architecture' | 'chat';
        code?: string; instruction?: string; errorMessage?: string;
        filePath?: string; language?: string; fileContent?: string;
        fileTree?: string; projectRoot?: string; model?: string; skipRetrieval?: boolean;
      },
      callbacks: { onChunk?: (t: string) => void; onDone?: (r: any) => void; onError?: (e: string) => void }
    ) => () => void;
    reasonAbort: () => void;

    // ── Embedding / retrieval ─────────────────────────────────────────
    embedProject:    (projectRoot: string) => Promise<{ ok: boolean; indexed?: number; skipped?: number; total?: number; error?: string }>;
    embedUpdateFile: (filePath: string, content: string) => Promise<{ ok: boolean; error?: string }>;
    embedAbort:      () => void;
    retrievalStatus: () => Promise<{ ok: boolean; chunks: number; files: number; indexing: boolean }>;
    retrievalSearch: (query: string, topK?: number) => Promise<{ ok: boolean; hits: any[]; error?: string }>;

    // ── Event listeners ────────────────────────────────────────────────
    onEmbedProgress: (cb: (d: { phase: string; total: number; indexed: number; current?: string }) => void) => () => void;
    onEmbedDone:     (cb: (d: { ok: boolean; indexed: number; skipped: number; total: number }) => void) => () => void;
    onReasonChunk:   (cb: (t: string) => void) => () => void;
  };

  // ── Local history ─────────────────────────────────────────────────────
  history: {
    save:    (args: { filePath: string; content: string }) => Promise<{ ok: boolean; saved?: boolean; error?: string }>;
    list:    (filePath: string) => Promise<{ ok: boolean; snapshots: HistorySnapshot[]; error?: string }>;
    restore: (snapshotId: number) => Promise<{ ok: boolean; content?: string; error?: string }>;
    delete:  (args: { snapshotId?: number; filePath?: string; all?: boolean }) => Promise<{ ok: boolean; error?: string }>;
  };

  fs: {
    openProject:      () => Promise<string | null>;
    openFileDialog:   () => Promise<string | null>;
    readDir:          (dir: string) => Promise<{ ok: boolean; tree?: any[]; root?: string; error?: string }>;
    readFile:         (path: string) => Promise<{ ok: boolean; content?: string; error?: string }>;
    writeFile:        (path: string, content: string) => Promise<{ ok: boolean; error?: string }>;
    saveAs:           (name: string) => Promise<string | null>;
    createFile:       (dir: string, name: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    createFolder:     (dir: string, name: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    rename:           (oldPath: string, newName: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    delete:           (path: string) => Promise<{ ok: boolean; error?: string }>;
    move:             (src: string, destDir: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    search:           (params: any) => Promise<any>;
    watch:            (dir: string) => Promise<{ ok: boolean; error?: string }>;
    stopWatch:        () => Promise<{ ok: boolean }>;
    revealInExplorer: (path: string) => Promise<{ ok: boolean }>;
    generateProjectDocs: (root: string) => Promise<{ ok: boolean; path?: string; error?: string }>;
    onChange:         (callback: (ev: any) => void) => () => void;
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
    redetect:    () => Promise<any>;
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

  git: {
    status:       (cwd: string) => Promise<any>;
    diff:         (cwd: string, path: string, staged?: boolean) => Promise<any>;
    stage:        (cwd: string, path: string) => Promise<any>;
    unstage:      (cwd: string, path: string) => Promise<any>;
    stageAll:     (cwd: string) => Promise<any>;
    discard:      (cwd: string, path: string) => Promise<any>;
    commit:       (cwd: string, msg: string) => Promise<any>;
    push:         (cwd: string) => Promise<any>;
    pull:         (cwd: string) => Promise<any>;
    log:          (cwd: string, limit?: number) => Promise<any>;
    init:         (cwd: string) => Promise<any>;
    branchList:   (cwd: string) => Promise<any>;
    createBranch: (cwd: string, name: string) => Promise<any>;
    checkout:     (cwd: string, name: string) => Promise<any>;
    merge:        (cwd: string, branch: string) => Promise<any>;
    untrack:      (cwd: string, path: string) => Promise<any>;
  };

  lsp: {
    connect:     (language: string, projectRoot: string) => Promise<any>;
    sendRequest: (language: string, method: string, params: any) => Promise<any>;
  };

  ollama: {
    list: () => Promise<any>;
    ping: () => Promise<any>;
  };

  session: {
    save: (data: any) => Promise<{ ok: boolean }>;
    load: () => Promise<any>;
  };
}

interface ElectronAPI {
  saveFlow:    (fileHash: string, flowData: any) => Promise<any>;
  loadFlow:    (fileHash: string) => Promise<any>;
  analyzeFlow: (code: string) => Promise<any>;
  deleteFlow:  (fileHash: string) => Promise<any>;
  ollamaStatus: () => Promise<any>;
  systemMemory: () => Promise<any>;
  execCommand:  (cmd: string, cwd?: string) => Promise<any>;
}

interface Window {
  Cordex: CordexAPI;
  electronAPI: ElectronAPI;
}

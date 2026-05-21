export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
}

export interface Tab {
  id: string;
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  tabType?: 'file' | 'flow';
  flowSourceTabId?: string;
}

export interface HardwareInfo {
  total_ram_gb: number;
  free_ram_gb?: number;
  cpu_model?: string;
  cpu_cores?: number;
  platform?: string;
  has_gpu: boolean;
  gpu_vendor: string;
  gpu_name?: string;
  vram_mb?: number;
  gpu_backend?: 'cuda' | 'rocm' | 'metal' | 'vulkan' | 'cpu';
  gpu_layers?: number;
  gpu_reason?: string;
  cuda_version?: string | null;
  rocm_version?: string | null;
  llama_flags?: string[];
  capability: 'PRO' | 'MID' | 'LITE';
  canThink?: boolean;
  canFlow?: boolean;
  recommended_models?: { autocomplete: string; analysis: string };
  modelMap?: Record<string, string>;
}

export interface BugFixModalState {
  open: boolean;
  explanation?: string;
  fixedCode?: string;
  loading: boolean;
}

export interface AISettings {
  autocomplete: string;
  analyze: string;
  bugfix: string;
  docstring: string;
  flow: string;
}

export interface AppState {
  projectRoot: string | null;
  fileTree: FileNode[];
  tabs: Tab[];
  activeTabId: string | null;
  splitTabId: string | null;
  terminalVisible: boolean;
  hardware: HardwareInfo | null;
  settings: Record<string, any>;
  analysisResult: string;
  bugFixModal: BugFixModalState;
  sidebarVisible: boolean;
  sidebarPanel: 'explorer' | 'search' | 'git';
  cursorLine: number;
  cursorCol: number;
  aiSettings: AISettings;
  aiSettingsOpen: boolean;
  llamaStatus: 'stopped' | 'starting' | 'running' | 'error';
  llamaError: string | null;
  contextMenu: { x: number; y: number; node: FileNode } | null;
  // ── New state ──────────────────────────────────────────────────
  browserVisible: boolean;
  commandPaletteOpen: boolean;
}

export type AppAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_PANEL'; panel: 'explorer' | 'search' | 'git' }
  | { type: 'SET_PROJECT'; root: string; tree: FileNode[] }
  | { type: 'SET_FILE_TREE'; tree: FileNode[] }
  | { type: 'ADD_TAB'; tab: Tab }
  | { type: 'REMOVE_TAB'; id: string }
  | { type: 'SET_ACTIVE_TAB'; id: string }
  | { type: 'UPDATE_TAB_CONTENT'; id: string; content: string }
  | { type: 'MARK_TAB_SAVED'; id: string }
  | { type: 'TOGGLE_TERMINAL' }
  | { type: 'SET_HARDWARE'; hw: HardwareInfo }
  | { type: 'SET_SETTINGS'; settings: Record<string, any> }
  | { type: 'SET_ANALYSIS'; text: string }
  | { type: 'SET_CURSOR'; line: number; col: number }
  | { type: 'OPEN_BUG_FIX_MODAL'; explanation?: string; fixedCode?: string }
  | { type: 'SET_BUG_FIX_LOADING'; loading: boolean }
  | { type: 'SET_BUG_FIX_RESULT'; explanation: string; fixedCode: string }
  | { type: 'CLOSE_BUG_FIX_MODAL' }
  | { type: 'TOGGLE_AI_SETTINGS' }
  | { type: 'SET_AI_SETTINGS'; settings: Partial<AISettings> }
  | { type: 'SET_SPLIT_TAB'; tabId: string | null }
  | { type: 'SET_LLAMA_STATUS'; status: string; error?: string | null }
  | { type: 'SET_CONTEXT_MENU'; menu: AppState['contextMenu'] }
  // ── New actions ─────────────────────────────────────────────────
  | { type: 'TOGGLE_BROWSER' }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'NEXT_TAB' }
  | { type: 'PREVIOUS_TAB' }
  | { type: 'CLOSE_TAB' }
  | { type: 'TOGGLE_SPLIT' };
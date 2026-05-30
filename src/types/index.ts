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
  savedContent?: string;
  tabType?: 'file' | 'flow';   // 'untitled' is not allowed – untitled files are still 'file'
  flowSourceTabId?: string;
  projectRoot?: string | null;
  fileHash?: string;
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

export interface SelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

export type TodoStatus = 'pending' | 'running' | 'done' | 'error';

export interface TodoItem {
  id: string;
  label: string;
  description: string;
  status: TodoStatus;
}

export type BugFixPhase = 'planning' | 'review' | 'executing' | 'done';

export interface BugFixModalState {
  open: boolean;
  phase: BugFixPhase;
  todos: TodoItem[];
  explanation?: string;
  fixedCode?: string;
  loading: boolean;
  error?: string;
  isSelection?: boolean;
  selectionRange?: SelectionRange;
  selectionText?: string;
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
  sidebarPanel: 'explorer' | 'search' | 'git' | 'extensions';
  cursorLine: number;
  gotoLine: number;
  cursorCol: number;
  aiSettings: AISettings;
  aiSettingsOpen: boolean;
  llamaStatus: 'stopped' | 'starting' | 'running' | 'error';
  llamaError: string | null;
  contextMenu: { x: number; y: number; node: FileNode } | null;
  browserVisible: boolean;
  commandPaletteOpen: boolean;
  chatVisible: boolean;
  historyPanelVisible: boolean;
}

export type AppAction =
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'SET_SIDEBAR_PANEL'; panel: 'explorer' | 'search' | 'git' | 'extensions' }
  | { type: 'SET_PROJECT'; root: string; tree: FileNode[] }
  | { type: 'SET_FILE_TREE'; tree: FileNode[] }
  | { type: 'ADD_TAB'; tab: Tab }
  | { type: 'REMOVE_TAB'; id: string }
  | { type: 'SET_ACTIVE_TAB'; id: string }
  | { type: 'UPDATE_TAB_CONTENT'; id: string; content: string }
  | { type: 'MARK_TAB_SAVED'; id: string }
  | { type: 'REORDER_TABS'; srcId: string; targetId: string }
  | { type: 'TOGGLE_TERMINAL' }
  | { type: 'SET_HARDWARE'; hw: HardwareInfo }
  | { type: 'SET_SETTINGS'; settings: Record<string, any> }
  | { type: 'SET_ANALYSIS'; text: string }
  | { type: 'SET_CURSOR'; line: number; col: number }
  | { type: 'GOTO_LINE'; line: number }
  | { type: 'OPEN_BUG_FIX_MODAL'; explanation?: string; fixedCode?: string; isSelection?: boolean; selectionRange?: SelectionRange; selectionText?: string }
  | { type: 'SET_BUG_FIX_LOADING'; loading: boolean }
  | { type: 'SET_BUG_FIX_TODOS'; todos: TodoItem[] }
  | { type: 'SET_TODO_STATUS'; id: string; status: TodoStatus }
  | { type: 'SET_BUG_FIX_PHASE'; phase: BugFixPhase }
  | { type: 'SET_BUG_FIX_RESULT'; explanation: string; fixedCode: string }
  | { type: 'SET_BUG_FIX_ERROR'; error: string }
  | { type: 'CLOSE_BUG_FIX_MODAL' }
  | { type: 'TOGGLE_AI_SETTINGS' }
  | { type: 'SET_AI_SETTINGS'; settings: Partial<AISettings> }
  | { type: 'SET_SPLIT_TAB'; tabId: string | null }
  | { type: 'SET_LLAMA_STATUS'; status: 'stopped' | 'starting' | 'running' | 'error'; error?: string | null }
  | { type: 'SET_CONTEXT_MENU'; menu: AppState['contextMenu'] }
  | { type: 'TOGGLE_BROWSER' }
  | { type: 'TOGGLE_COMMAND_PALETTE' }
  | { type: 'NEXT_TAB' }
  | { type: 'PREVIOUS_TAB' }
  | { type: 'CLOSE_TAB' }
  | { type: 'TOGGLE_SPLIT' }
  | { type: 'NEW_FILE' }
  | { type: 'OPEN_FILE'; payload: { path: string; content: string; language: string } }
  | { type: 'UPDATE_TAB_PATH'; id: string; path: string; name?: string }
  | { type: 'UPDATE_TAB_LANGUAGE'; id: string; language: string }
  | { type: 'TOGGLE_CHAT_PANEL' }
  | { type: 'TOGGLE_HISTORY_PANEL' }
;
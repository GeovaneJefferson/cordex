import { FileNode, Tab, HardwareInfo } from '../types';

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
  | { type: 'SET_CONTEXT_MENU'; menu: AppState['contextMenu'] };

export const initialState: AppState = {
  projectRoot: null,
  fileTree: [],
  tabs: [],
  activeTabId: null,
  splitTabId: null,
  terminalVisible: false,
  hardware: null,
  settings: { theme: 'atom-one-light' },
  analysisResult: '',
  bugFixModal: { open: false, explanation: '', fixedCode: '', loading: false },
  sidebarVisible: true,
  sidebarPanel: 'explorer',
  cursorLine: 1,
  cursorCol: 1,
  aiSettings: {
    autocomplete: '',
    analyze: '',
    bugfix: '',
    docstring: '',
    flow: '',
  },
  aiSettingsOpen: false,
  llamaStatus: 'stopped',
  llamaError: null,
  contextMenu: null,
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, projectRoot: action.root, fileTree: action.tree };
    case 'SET_FILE_TREE':
      return { ...state, fileTree: action.tree };
    case 'ADD_TAB': {
      const exists = state.tabs.find(t => t.id === action.tab.id);
      if (exists) return { ...state, activeTabId: action.tab.id };
      return { ...state, tabs: [...state.tabs, action.tab], activeTabId: action.tab.id };
    }
    case 'REMOVE_TAB': {
      const tabs = state.tabs.filter(t => t.id !== action.id);
      let active = state.activeTabId;
      if (state.activeTabId === action.id) active = tabs[tabs.length - 1]?.id ?? null;
      const splitTabId = state.splitTabId === action.id ? null : state.splitTabId;
      return { ...state, tabs, activeTabId: active, splitTabId };
    }
    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.id };
    case 'UPDATE_TAB_CONTENT':
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === action.id ? { ...t, content: action.content, isDirty: true } : t
        ),
      };
    case 'MARK_TAB_SAVED':
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === action.id ? { ...t, isDirty: false } : t),
      };
    case 'TOGGLE_TERMINAL':
      return { ...state, terminalVisible: !state.terminalVisible };
    case 'SET_HARDWARE':
      return { ...state, hardware: action.hw };
    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };
    case 'SET_ANALYSIS':
      return { ...state, analysisResult: action.text };
    case 'SET_CURSOR':
      return { ...state, cursorLine: action.line, cursorCol: action.col };
    case 'OPEN_BUG_FIX_MODAL':
      return {
        ...state,
        bugFixModal: {
          open: true,
          explanation: action.explanation || '',
          fixedCode: action.fixedCode || '',
          loading: !action.explanation,
        },
      };
    case 'SET_BUG_FIX_LOADING':
      return { ...state, bugFixModal: { ...state.bugFixModal, loading: action.loading } };
    case 'SET_BUG_FIX_RESULT':
      return {
        ...state,
        bugFixModal: { ...state.bugFixModal, loading: false, explanation: action.explanation, fixedCode: action.fixedCode },
      };
    case 'CLOSE_BUG_FIX_MODAL':
      return { ...state, bugFixModal: { ...state.bugFixModal, open: false } };
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible };
    case 'SET_SIDEBAR_PANEL':
      return { ...state, sidebarPanel: action.panel, sidebarVisible: true };
    case 'TOGGLE_AI_SETTINGS':
      return { ...state, aiSettingsOpen: !state.aiSettingsOpen };
    case 'SET_AI_SETTINGS':
      return { ...state, aiSettings: { ...state.aiSettings, ...action.settings } };
    case 'SET_SPLIT_TAB':
      return { ...state, splitTabId: action.tabId };
    case 'SET_LLAMA_STATUS':
      return { ...state, llamaStatus: action.status as any, llamaError: action.error ?? null };
    case 'SET_CONTEXT_MENU':
      return { ...state, contextMenu: action.menu };
    default:
      return state;
  }
}

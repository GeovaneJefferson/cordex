import { AppState, AppAction, Tab, SplitMode } from '../types';

export const initialState: AppState = {
  projectRoot: null,
  fileTree: [],
  tabs: [],
  activeTabId: null,
  splitTabId: null,
  splitTabId2: null,
  splitTabId3: null,
  splitMode: 'none',
  terminalVisible: false,
  chatVisible: false,
  hardware: null,
  settings: { theme: 'atom-one-light' },
  analysisResult: '',
  bugFixModal: {
    open: false,
    phase: 'planning',
    todos: [],
    explanation: '',
    fixedCode: '',
    loading: false,
    error: '',
  },
  sidebarVisible: false,
  sidebarPanel: 'explorer',
  cursorLine: 1,
  gotoLine: 0,
  cursorCol: 1,
  aiSettings: {
    autocomplete: '',
    analyze: '',
    bugfix: '',
    docstring: '',
    flow: '',
    agentModels: { document: '', fixCode: '' },
  },
  aiSettingsOpen: false,
  llamaStatus: 'stopped',
  llamaError: null,
  contextMenu: null,
  browserVisible: false,
  commandPaletteOpen: false,
  historyPanelVisible: false,
  backgroundAgents: {
    'fix-code': false,
    'document': false,
  },
};

export function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarVisible: !state.sidebarVisible };

    case 'SET_SIDEBAR_PANEL':
      return { ...state, sidebarPanel: action.panel, sidebarVisible: true };

    case 'TOGGLE_TERMINAL':
      return { ...state, terminalVisible: !state.terminalVisible };

    case 'TOGGLE_BROWSER':
      return { ...state, browserVisible: !state.browserVisible };

    case 'TOGGLE_COMMAND_PALETTE':
      return { ...state, commandPaletteOpen: !state.commandPaletteOpen };

    case 'TOGGLE_AI_SETTINGS':
      return { ...state, aiSettingsOpen: !state.aiSettingsOpen };

    case 'TOGGLE_CHAT_PANEL':
      return { ...state, chatVisible: !state.chatVisible };

    case 'TOGGLE_HISTORY_PANEL':
      return { ...state, historyPanelVisible: !state.historyPanelVisible };

    // ─────────────────────── SPLIT EDITOR ──────────────────────────────
    case 'SET_SPLIT_TAB':
      return { ...state, splitTabId: action.tabId, splitMode: action.tabId ? 'horizontal' : 'none' };

    case 'SET_SPLIT_MODE': {
      const [t1, t2, t3] = action.tabIds ?? [null, null, null];
      return {
        ...state,
        splitMode: action.mode,
        splitTabId:  t1 ?? state.splitTabId,
        splitTabId2: t2 ?? null,
        splitTabId3: t3 ?? null,
      };
    }

    case 'TOGGLE_SPLIT': {
      if (state.splitMode !== 'none') {
        return { ...state, splitTabId: null, splitTabId2: null, splitTabId3: null, splitMode: 'none' };
      }
      const other = state.tabs.find(t => t.id !== state.activeTabId);
      return { ...state, splitTabId: other?.id ?? null, splitMode: other ? 'horizontal' : 'none' };
    }

    // ─────────────────────── TAB MANAGEMENT ────────────────────────────
    case 'ADD_TAB': {
      const exists = state.tabs.find(t => t.id === action.tab.id);
      if (exists) return { ...state, activeTabId: action.tab.id };
      return { ...state, tabs: [...state.tabs, { ...action.tab, savedContent: action.tab.savedContent ?? action.tab.content }], activeTabId: action.tab.id };
    }

    case 'OPEN_FILE': {
      const existing = state.tabs.find(t => t.path === action.payload.path);
      if (existing) return { ...state, activeTabId: existing.id };
      const newTab: Tab = {
        id: action.payload.path,
        path: action.payload.path,
        name: action.payload.path.split('/').pop() ?? action.payload.path,
        content: action.payload.content,
        language: action.payload.language,
        isDirty: false,
        savedContent: action.payload.content,
        tabType: 'file',
      };
      return { ...state, tabs: [...state.tabs, newTab], activeTabId: newTab.id };
    }

    case 'REMOVE_TAB': {
      const tabs = state.tabs.filter(t => t.id !== action.id);
      let active = state.activeTabId;
      if (state.activeTabId === action.id) active = tabs[tabs.length - 1]?.id ?? null;
      const splitTabId  = state.splitTabId  === action.id ? null : state.splitTabId;
      const splitTabId2 = state.splitTabId2 === action.id ? null : state.splitTabId2;
      const splitTabId3 = state.splitTabId3 === action.id ? null : state.splitTabId3;
      const allSplitsGone = !splitTabId && !splitTabId2 && !splitTabId3;
      return { ...state, tabs, activeTabId: active, splitTabId, splitTabId2, splitTabId3, splitMode: allSplitsGone ? 'none' : state.splitMode };
    }

    case 'SET_ACTIVE_TAB':
      return { ...state, activeTabId: action.id };

    case 'UPDATE_TAB_CONTENT':
      return {
        ...state,
        tabs: state.tabs.map(t =>
          t.id === action.id ? {
            ...t,
            content: action.content,
            isDirty: action.content !== (t.savedContent ?? t.content),
          } : t
        ),
      };

    case 'MARK_TAB_SAVED':
      return {
        ...state,
        tabs: state.tabs.map(t => t.id === action.id ? { ...t, isDirty: false, savedContent: t.content } : t),
      };

    case 'REORDER_TABS': {
      const srcIndex = state.tabs.findIndex(t => t.id === action.srcId);
      const destIndex = state.tabs.findIndex(t => t.id === action.targetId);
      if (srcIndex === -1 || destIndex === -1 || srcIndex === destIndex) return state;
      const tabs = [...state.tabs];
      const [moved] = tabs.splice(srcIndex, 1);
      tabs.splice(destIndex, 0, moved);
      return { ...state, tabs };
    }

    case 'NEXT_TAB': {
      const idx = state.tabs.findIndex(t => t.id === state.activeTabId);
      if (idx === -1 || state.tabs.length === 0) return state;
      return { ...state, activeTabId: state.tabs[(idx + 1) % state.tabs.length].id };
    }

    case 'PREVIOUS_TAB': {
      const idx = state.tabs.findIndex(t => t.id === state.activeTabId);
      if (idx === -1 || state.tabs.length === 0) return state;
      return { ...state, activeTabId: state.tabs[(idx - 1 + state.tabs.length) % state.tabs.length].id };
    }

    case 'CLOSE_TAB': {
      if (!state.activeTabId) return state;
      return reducer(state, { type: 'REMOVE_TAB', id: state.activeTabId });
    }

    case 'SET_PROJECT':
      return { ...state, projectRoot: action.root, fileTree: action.tree };

    case 'SET_FILE_TREE':
      return { ...state, fileTree: action.tree };

    case 'SET_ANALYSIS':
      return { ...state, analysisResult: action.text };

    case 'SET_AI_SETTINGS':
      return { ...state, aiSettings: { ...state.aiSettings, ...action.settings } };

    case 'SET_LLAMA_STATUS':
      return { ...state, llamaStatus: action.status as any, llamaError: action.error ?? null };

    case 'OPEN_BUG_FIX_MODAL':
      return {
        ...state,
        bugFixModal: {
          open: true, phase: 'planning', todos: [],
          explanation: '', fixedCode: '', loading: true, error: '',
          isSelection: action.isSelection ?? false,
          selectionRange: action.selectionRange,
          selectionText: action.selectionText,
        },
      };

    case 'SET_BUG_FIX_TODOS':
      return { ...state, bugFixModal: { ...state.bugFixModal, todos: action.todos, phase: 'review', loading: false } };

    case 'SET_TODO_STATUS':
      return {
        ...state,
        bugFixModal: {
          ...state.bugFixModal,
          todos: state.bugFixModal.todos.map(todo =>
            todo.id === action.id ? { ...todo, status: action.status } : todo
          ),
        },
      };

    case 'SET_BUG_FIX_PHASE':
      return { ...state, bugFixModal: { ...state.bugFixModal, phase: action.phase } };

    case 'SET_BUG_FIX_LOADING':
      return { ...state, bugFixModal: { ...state.bugFixModal, loading: action.loading } };

    case 'SET_BUG_FIX_RESULT':
      return { ...state, bugFixModal: { ...state.bugFixModal, loading: false, error: '', explanation: action.explanation, fixedCode: action.fixedCode, phase: 'done' } };

    case 'SET_BUG_FIX_ERROR':
      return { ...state, bugFixModal: { ...state.bugFixModal, loading: false, error: action.error, phase: 'planning' } };

    case 'CLOSE_BUG_FIX_MODAL':
      return { ...state, bugFixModal: { ...state.bugFixModal, open: false } };

    case 'SET_HARDWARE':
      return { ...state, hardware: action.hw };

    case 'SET_SETTINGS':
      return { ...state, settings: { ...state.settings, ...action.settings } };

    case 'SET_CURSOR':
      return { ...state, cursorLine: action.line, cursorCol: action.col };

    case 'GOTO_LINE':
      return { ...state, gotoLine: action.line };

    case 'SET_CONTEXT_MENU':
      return { ...state, contextMenu: action.menu };

    case 'NEW_FILE': {
      const id = `untitled::${Date.now()}`;
      const name = `Untitled-${state.tabs.filter(t => t.id.startsWith('untitled::')).length + 1}`;
      const newTab: Tab = { id, path: id, name, content: '', language: 'plaintext', isDirty: false, tabType: 'file' };
      return { ...state, tabs: [...state.tabs, newTab], activeTabId: id };
    }

    case 'UPDATE_TAB_PATH':
      return { ...state, tabs: state.tabs.map(tab => tab.id === action.id ? { ...tab, path: action.path, name: action.name ?? tab.name } : tab) };

    case 'UPDATE_TAB_LANGUAGE':
      return { ...state, tabs: state.tabs.map(tab => tab.id === action.id ? { ...tab, language: action.language } : tab) };

    case 'TOGGLE_BACKGROUND_AGENT':
      return { ...state, backgroundAgents: { ...state.backgroundAgents, [action.payload.type]: action.payload.enabled } };

    default:
      return state;
  }
}

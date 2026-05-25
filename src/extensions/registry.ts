import { Extension } from './types';

// ── Built-in extension catalogue ─────────────────────────────────────────────
// Add new extensions here. They automatically appear in the Extensions panel.

export const EXTENSIONS: Extension[] = [
  {
    id: 'pylance',
    name: 'Pylance',
    description: 'Fast, feature-rich language support for Python. Provides type checking, auto-imports, docstring tooltips, and IntelliSense powered by Pyright.',
    version: '2024.12.1',
    author: 'Microsoft',
    icon: 'code',
    iconColor: '#3b82f6',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'typecheck',   label: 'Type Checking',   description: 'Static type analysis with Pyright' },
      { id: 'autoimport',  label: 'Auto Import',     description: 'Automatic import suggestions' },
      { id: 'hover',       label: 'Hover Docs',      description: 'Inline documentation on hover' },
      { id: 'completion',  label: 'IntelliSense',    description: 'Smart code completions' },
      { id: 'rename',      label: 'Rename Symbol',   description: 'Safe refactoring across files' },
    ],
    installNote: 'Requires pyright: npm install -g pyright',
    configSchema: {
      pythonPath:    { type: 'string',  default: 'python3',  label: 'Python interpreter path' },
      typeCheckMode: { type: 'select',  default: 'basic',    label: 'Type check mode (off / basic / standard / strict)' },
    },
  },
  {
    id: 'prettier',
    name: 'Prettier',
    description: 'Opinionated code formatter for JS, TS, CSS, HTML, JSON, Markdown and more. Formats on save.',
    version: '3.3.3',
    author: 'Prettier Team',
    icon: 'auto_fix_high',
    iconColor: '#f59e0b',
    category: 'formatter',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'format_save',   label: 'Format on Save',   description: 'Auto-format when Ctrl+S is pressed' },
      { id: 'format_paste',  label: 'Format on Paste',  description: 'Format code when pasted' },
    ],
    installNote: 'Requires prettier: npm install -g prettier',
    configSchema: {
      tabWidth:    { type: 'number',  default: 2,      label: 'Tab width' },
      singleQuote: { type: 'boolean', default: true,   label: 'Single quotes' },
      semi:        { type: 'boolean', default: false,  label: 'Semicolons' },
    },
  },
  {
    id: 'rust-analyzer',
    name: 'Rust Analyzer',
    description: 'Powerful Rust language support: completions, type hints, error detection, and refactoring tools.',
    version: '0.4.2158',
    author: 'rust-analyzer Team',
    icon: 'settings_applications',
    iconColor: '#f97316',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'completion',  label: 'Completions',    description: 'Context-aware Rust completions' },
      { id: 'inlayhints',  label: 'Inlay Hints',    description: 'Type and parameter hints inline' },
      { id: 'diagnostics', label: 'Diagnostics',    description: 'Real-time error and warning detection' },
    ],
    installNote: 'Requires rust-analyzer binary in PATH',
  },
  {
    id: 'eslint',
    name: 'ESLint',
    description: 'Integrates ESLint into Cordex for JavaScript and TypeScript linting. Shows errors and warnings inline.',
    version: '8.57.0',
    author: 'ESLint Team',
    icon: 'check_circle',
    iconColor: '#7c3aed',
    category: 'linter',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'inline',    label: 'Inline Errors',    description: 'Show lint errors in the editor gutter' },
      { id: 'fix_save',  label: 'Fix on Save',      description: 'Auto-fix fixable issues on save' },
    ],
    installNote: 'Requires eslint in your project: npm install -D eslint',
  },
  {
    id: 'ai-docstring',
    name: 'AI Docstrings',
    description: 'Automatically generates docstrings for functions and classes using the local Ollama AI model.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'auto_awesome',
    iconColor: '#8b5cf6',
    category: 'ai',
    status: 'installed',
    enabled: true,
    capabilities: [
      { id: 'docgen',   label: 'Generate Docstring', description: 'Right-click → Generate docstring' },
      { id: 'hover',    label: 'Hover Summary',      description: 'AI summary on function hover' },
    ],
  },
  {
    id: 'gdscript',
    name: 'GDScript',
    description: 'Full GDScript (Godot 4) language support: syntax highlighting, completion, and Godot API hints.',
    version: '1.2.0',
    author: 'Cordex',
    icon: 'videogame_asset',
    iconColor: '#478cbf',
    category: 'language',
    status: 'installed',
    enabled: true,
    capabilities: [
      { id: 'highlight',  label: 'Syntax Highlighting', description: 'GDScript tokenizer and theme' },
      { id: 'completion', label: 'Basic Completions',   description: 'Godot built-in API completions' },
    ],
  },
];

// Persistent installed/enabled state — stored in localStorage
const STORAGE_KEY = 'cordex:extensions';

function loadState(): Record<string, { status: Extension['status']; enabled: boolean }> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}
function saveState(state: Record<string, { status: Extension['status']; enabled: boolean }>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
}

export function getExtensions(): Extension[] {
  const saved = loadState();
  return EXTENSIONS.map(ext => ({
    ...ext,
    ...(saved[ext.id] ?? {}),
  }));
}

export function setExtensionState(id: string, patch: Partial<Pick<Extension, 'status' | 'enabled'>>) {
  const state = loadState();
  state[id] = { ...(state[id] ?? {}), ...patch } as any;
  saveState(state);
}

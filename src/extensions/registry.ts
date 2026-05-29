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
  // ── Language Servers ─────────────────────────────────────────────────────
  {
    id: 'typescript-lsp',
    name: 'TypeScript Language Server',
    description: 'Full TypeScript & JavaScript IntelliSense powered by typescript-language-server (the same engine as VS Code). Provides completions, go-to-definition, find references, rename, hover types, and real-time diagnostics for .ts, .tsx, .js, and .jsx files.',
    version: '4.3.3',
    author: 'TypeFox',
    icon: 'code',
    iconColor: '#3178c6',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'completion',   label: 'IntelliSense',      description: 'Type-aware completions' },
      { id: 'diagnostics',  label: 'Diagnostics',       description: 'Real-time TypeScript errors' },
      { id: 'hover',        label: 'Hover Types',       description: 'Type info on hover' },
      { id: 'goto',         label: 'Go to Definition',  description: 'Jump to symbol definition' },
      { id: 'references',   label: 'Find References',   description: 'Find all usages' },
      { id: 'rename',       label: 'Rename Symbol',     description: 'Safe cross-file rename' },
      { id: 'format',       label: 'Format Document',   description: 'Built-in formatter' },
    ],
    installNote: 'npm install -g typescript typescript-language-server',
    installCommands: ['npm install -g typescript typescript-language-server'],
    configSchema: {
      tsdk: { type: 'string', default: '', label: 'TypeScript SDK path (leave blank to auto-detect)' },
    },
  },
  {
    id: 'java-lsp',
    name: 'Java Language Server (Eclipse JDT)',
    description: 'Java IntelliSense via Eclipse JDT Language Server (eclipse.jdt.ls) — the same backend used by VS Code Java. Supports Java 8–21, Maven, Gradle, completions, diagnostics, refactoring, and import organisation.',
    version: '1.35.0',
    author: 'Eclipse Foundation',
    icon: 'coffee',
    iconColor: '#f89820',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'completion',   label: 'Completions',       description: 'Context-aware Java completions' },
      { id: 'diagnostics',  label: 'Diagnostics',       description: 'Real-time compile errors' },
      { id: 'hover',        label: 'Hover Docs',        description: 'Javadoc on hover' },
      { id: 'goto',         label: 'Go to Definition',  description: 'Navigate to class / method' },
      { id: 'organize',     label: 'Organize Imports',  description: 'Auto-manage imports' },
      { id: 'rename',       label: 'Rename Symbol',     description: 'Safe refactoring' },
    ],
    installNote: 'Requires JDK 17+. Install eclipse.jdt.ls: https://github.com/eclipse-jdtls/eclipse.jdt.ls',
    installCommands: [
      '# Requires JDK 17+',
      'curl -fsSL https://www.eclipse.org/downloads/download.php?file=/jdtls/snapshots/jdt-language-server-latest.tar.gz -o /tmp/jdtls.tar.gz',
      'mkdir -p ~/.local/jdtls && tar -xzf /tmp/jdtls.tar.gz -C ~/.local/jdtls',
    ],
  },
  {
    id: 'gdscript-lsp',
    name: 'GDScript Language Server (Godot 4)',
    description: 'Connects to the Godot 4 built-in language server for full GDScript IntelliSense, diagnostics, go-to-definition, and hover docs. Godot 4 must be running with the LSP enabled (Editor → Editor Settings → Language Server → Remote Port 6005).',
    version: '4.0.0',
    author: 'Godot Engine',
    icon: 'videogame_asset',
    iconColor: '#478cbf',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'completion',   label: 'Completions',       description: 'Godot API + user script completions' },
      { id: 'diagnostics',  label: 'Diagnostics',       description: 'GDScript parse errors' },
      { id: 'hover',        label: 'Hover Docs',        description: 'Godot API docs on hover' },
      { id: 'goto',         label: 'Go to Definition',  description: 'Jump to function / class' },
      { id: 'signals',      label: 'Signal Hints',      description: 'Signal completion and docs' },
    ],
    installNote: 'Open Godot 4 → Editor Settings → Language Server → enable. Default port: 6005.',
    installCommands: [
      '# No install needed — Godot 4 ships a built-in LSP server.',
      '# Enable: Godot → Editor → Editor Settings → Language Server → Remote Port 6005',
    ],
  },
  // ── Emulator ──────────────────────────────────────────────────────────────
  {
    id: 'android-emulator',
    name: 'Android Emulator',
    description: 'Runs an Android virtual device directly inside Cordex using the Android Studio AVD Manager and scrcpy screen streaming. Launch a Pixel device, send Expo deep-links, and test your React Native app without leaving the editor.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'android',
    iconColor: '#22c55e',
    category: 'tool',
    status: 'available',
    enabled: false,
    panelType: 'android-emulator',
    capabilities: [
      { id: 'launch',    label: 'Launch AVD',        description: 'Start any AVD via emulator CLI' },
      { id: 'stream',    label: 'Screen Streaming',  description: 'Live view via scrcpy WebSocket' },
      { id: 'expo',      label: 'Expo Integration',  description: 'Send exp:// URLs directly to device' },
      { id: 'adb',       label: 'ADB Commands',      description: 'Run adb commands from the panel' },
    ],
    installNote: 'Requires: Android Studio (for AVD), Android SDK platform-tools (adb), and scrcpy for streaming.',
    installCommands: [
      '# 1. Install Android Studio → https://developer.android.com/studio',
      '# 2. Install scrcpy → https://github.com/Genymobile/scrcpy',
      '# 3. Add platform-tools to PATH: export PATH=$PATH:~/Android/Sdk/platform-tools',
      '# 4. Create an AVD in Android Studio → Device Manager',
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

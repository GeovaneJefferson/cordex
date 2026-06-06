import { Extension } from './types';

// ── Language Bundle Catalogue ──────────────────────────────────────────────────
// Each bundle installs everything a developer needs for that language in one click.

export const EXTENSIONS: Extension[] = [
  // ── LANGUAGE BUNDLES ────────────────────────────────────────────────────────
  {
    id: 'bundle-python',
    name: 'Python',
    description: 'Full Python IDE experience: Pyright type-checking, Pylsp LSP server, Black formatter, Pylint linter, and debugpy for debugging. One click installs everything.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'code',
    iconColor: '#3b82f6',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'lsp',        label: 'Language Server',    description: 'pylsp — completions, go-to-def, hover' },
      { id: 'typecheck',  label: 'Type Checking',      description: 'Pyright static analysis' },
      { id: 'format',     label: 'Black Formatter',    description: 'Format on save with Black' },
      { id: 'lint',       label: 'Pylint',             description: 'Inline lint warnings & errors' },
      { id: 'debug',      label: 'Debugpy',            description: 'Python debug adapter' },
    ],
    installNote: 'Installs: python-lsp-server, pyright, black, pylint, debugpy',
    installCommands: [
      'pip install python-lsp-server pyright black pylint debugpy --break-system-packages',
      'pip install python-lsp-black pylsp-mypy --break-system-packages',
    ],
  },
  {
    id: 'bundle-typescript',
    name: 'TypeScript / JavaScript',
    description: 'Full TS/JS IDE: typescript-language-server for IntelliSense, ESLint for linting, Prettier for formatting, and Node.js debugger. Prettier and ESLint are auto-configured.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'code',
    iconColor: '#3178c6',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'lsp',        label: 'Language Server',    description: 'typescript-language-server' },
      { id: 'diagnostics',label: 'Diagnostics',        description: 'Real-time TypeScript errors' },
      { id: 'eslint',     label: 'ESLint',             description: 'Inline linting for JS/TS' },
      { id: 'prettier',   label: 'Prettier',           description: 'Format on save' },
      { id: 'goto',       label: 'Go to Definition',   description: 'Jump to symbol' },
      { id: 'rename',     label: 'Rename Symbol',      description: 'Cross-file safe rename' },
    ],
    installNote: 'Installs: typescript-language-server, eslint, prettier (auto-configured)',
    installCommands: [
      'npm install -g typescript typescript-language-server',
      'npm install -g eslint prettier',
      'npm install -g @typescript-eslint/parser @typescript-eslint/eslint-plugin eslint-config-prettier',
    ],
  },
  {
    id: 'bundle-java',
    name: 'Java',
    description: 'Full Java IDE: Eclipse JDT Language Server for completions and diagnostics, google-java-format for code formatting, and Checkstyle for linting. Requires JDK 17+.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'coffee',
    iconColor: '#f89820',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'lsp',        label: 'Eclipse JDT LSP',    description: 'Completions, diagnostics, hover' },
      { id: 'format',     label: 'google-java-format', description: 'Format on save' },
      { id: 'lint',       label: 'Checkstyle',         description: 'Code style linting' },
      { id: 'goto',       label: 'Go to Definition',   description: 'Navigate to class/method' },
      { id: 'organize',   label: 'Organize Imports',   description: 'Auto-manage imports' },
    ],
    installNote: 'Requires JDK 17+. Downloads eclipse.jdt.ls and google-java-format.',
    installCommands: [
      '# Requires JDK 17+ (check: java -version)',
      'mkdir -p ~/.local/jdtls',
      'curl -fsSL "https://www.eclipse.org/downloads/download.php?file=/jdtls/snapshots/jdt-language-server-latest.tar.gz" -o /tmp/jdtls.tar.gz',
      'tar -xzf /tmp/jdtls.tar.gz -C ~/.local/jdtls',
      'curl -fsSL "https://github.com/google/google-java-format/releases/latest/download/google-java-format-all-deps.jar" -o ~/.local/google-java-format.jar',
      '# Add to PATH: export JDTLS_HOME=~/.local/jdtls',
    ],
  },
  {
    id: 'bundle-gdscript',
    name: 'GDScript (Godot 4)',
    description: 'Full GDScript support: syntax highlighting, Godot 4 built-in LSP for completions and diagnostics, signal hints, and go-to-definition. Godot 4 must be open with LSP enabled.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'videogame_asset',
    iconColor: '#478cbf',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'highlight',  label: 'Syntax Highlighting', description: 'GDScript tokenizer & theme' },
      { id: 'lsp',        label: 'Godot 4 LSP',         description: 'Completions, diagnostics, hover' },
      { id: 'signals',    label: 'Signal Hints',         description: 'Signal completion & docs' },
      { id: 'goto',       label: 'Go to Definition',     description: 'Jump to function/class' },
    ],
    installNote: 'No install needed — uses Godot 4\'s built-in LSP server (port 6005). Enable: Editor → Editor Settings → Language Server.',
    installCommands: [
      '# No install required.',
      '# In Godot 4: Editor → Editor Settings → Language Server → Enable (port 6005)',
    ],
  },
  {
    id: 'bundle-rust',
    name: 'Rust',
    description: 'Full Rust IDE: rust-analyzer for IntelliSense, type hints, diagnostics and refactoring. Requires rustup and the rust-analyzer binary in PATH.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'settings_applications',
    iconColor: '#f97316',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'lsp',        label: 'rust-analyzer',     description: 'Full IntelliSense & diagnostics' },
      { id: 'inlayhints', label: 'Inlay Hints',        description: 'Type & parameter hints inline' },
      { id: 'format',     label: 'rustfmt',            description: 'Format on save' },
      { id: 'clippy',     label: 'Clippy',             description: 'Advanced linting via rust-analyzer' },
    ],
    installNote: 'Installs rust-analyzer via rustup.',
    installCommands: [
      '# Install rustup if not present: curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
      'rustup component add rust-analyzer',
      'rustup component add rustfmt clippy',
    ],
  },
  // ── TOOLS ────────────────────────────────────────────────────────────────────
  {
    id: 'bundle-sql',
    name: 'SQL',
    description: 'Full SQL IDE experience: syntax highlighting for SQL/SQLite/PostgreSQL/MySQL, sqls language server for completions and diagnostics, and a built-in query runner to execute SQL directly against SQLite files.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'storage',
    iconColor: '#0ea5e9',
    category: 'language',
    status: 'available',
    enabled: false,
    capabilities: [
      { id: 'highlight',  label: 'Syntax Highlighting',  description: 'SQL, SQLite, PostgreSQL, MySQL dialects' },
      { id: 'lsp',        label: 'sqls Language Server', description: 'Completions, go-to-table, hover docs' },
      { id: 'lint',       label: 'Diagnostics',          description: 'Inline syntax errors and warnings' },
      { id: 'format',     label: 'sql-formatter',        description: 'Format queries on save' },
      { id: 'runner',     label: 'Query Runner',         description: 'Run queries on SQLite files from the editor' },
    ],
    installNote: 'Installs sqls (Go binary) and sql-formatter (npm). Go 1.18+ required for sqls.',
    installCommands: [
      '# Install sqls LSP (requires Go): go install github.com/sqls-server/sqls@latest',
      '# Or download binary: https://github.com/sqls-server/sqls/releases',
      'npm install -g sql-formatter',
      '# Add Go bin to PATH: export PATH=$PATH:$(go env GOPATH)/bin',
    ],
  },
  {
    id: 'android-emulator',
    name: 'Android Emulator',
    description: 'Runs an Android virtual device inside Cordex using AVD Manager and scrcpy screen streaming. Test React Native/Expo apps without leaving the editor.',
    version: '1.0.0',
    author: 'Cordex',
    icon: 'android',
    iconColor: '#22c55e',
    category: 'tool',
    status: 'available',
    enabled: false,
    panelType: 'android-emulator',
    capabilities: [
      { id: 'launch',  label: 'Launch AVD',       description: 'Start any AVD via emulator CLI' },
      { id: 'stream',  label: 'Screen Streaming', description: 'Live view via scrcpy WebSocket' },
      { id: 'expo',    label: 'Expo Integration', description: 'Send exp:// URLs to device' },
      { id: 'adb',     label: 'ADB Commands',     description: 'Run adb commands from the panel' },
    ],
    installNote: 'Requires: Android Studio (for AVD), platform-tools (adb), and scrcpy.',
    installCommands: [
      '# 1. Install Android Studio → https://developer.android.com/studio',
      '# 2. Install scrcpy → https://github.com/Genymobile/scrcpy',
      '# 3. Add platform-tools to PATH: export PATH=$PATH:~/Android/Sdk/platform-tools',
      '# 4. Create an AVD in Android Studio → Device Manager',
    ],
  },
];

const STORAGE_KEY = 'cordex:extensions';

function loadState(): Record<string, { status: Extension['status']; enabled: boolean }> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

function saveState(state: Record<string, { status: Extension['status']; enabled: boolean }>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

export function getExtensions(): Extension[] {
  const saved = loadState();
  return EXTENSIONS.map(ext => ({ ...ext, ...(saved[ext.id] ?? {}) }));
}

export function setExtensionState(id: string, patch: Partial<Pick<Extension, 'status' | 'enabled'>>) {
  const state = loadState();
  state[id] = { ...(state[id] ?? {}), ...patch } as any;
  saveState(state);
}

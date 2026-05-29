// electron/utils/lspManager.cjs
const { spawn } = require('child_process');
const { createConnection, createServerProcess } = require('monaco-languageclient');

const servers = new Map();

function startServer(language, projectRoot) {
  if (servers.has(language)) return servers.get(language);
  let serverProcess;
  // Example for Python (pyright), C/C++ (clangd), Go (gopls)
  switch (language) {
    case 'python': serverProcess = spawn('pyright-langserver', ['--stdio']); break;
    case 'cpp': serverProcess = spawn('clangd', ['--background-index']); break;
    case 'go': serverProcess = spawn('gopls', []); break;
    case 'typescript':
    case 'typescriptreact':
    case 'javascript': serverProcess = spawn('typescript-language-server', ['--stdio']); break;
    default: return null;
  }
  const connection = createConnection(serverProcess.stdout, serverProcess.stdin);
  servers.set(language, connection);
  return connection;
}

function stopServer(language) {
  const conn = servers.get(language);
  if (conn) { conn.dispose(); servers.delete(language); }
}

module.exports = { startServer, stopServer };
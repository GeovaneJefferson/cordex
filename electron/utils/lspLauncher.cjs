// electron/utils/lspLauncher.cjs
const { spawn } = require('child_process')
const { MessageReader, MessageWriter } = require('vscode-jsonrpc')

const servers = new Map()

function launch(language, projectRoot) {
  if (servers.has(language)) return servers.get(language)
  let proc
  const options = { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
  switch (language) {
    case 'python': proc = spawn('pyright-langserver', ['--stdio'], options); break
    case 'cpp':    proc = spawn('clangd', [], options); break
    case 'go':     proc = spawn('gopls', [], options); break
    default: return null
  }
  const reader = new MessageReader(proc.stdout)
  const writer = new MessageWriter(proc.stdin)
  const connection = { reader, writer, proc, sendRequest: (method, params) => { /* simplified */ } }
  servers.set(language, connection)
  return connection
}

module.exports = { launch }
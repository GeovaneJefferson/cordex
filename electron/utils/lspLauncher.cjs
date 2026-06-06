// electron/utils/lspLauncher.cjs
const { spawn } = require('child_process')
const { MessageReader, MessageWriter } = require('vscode-jsonrpc')

const servers = new Map()

function launch(language, projectRoot) {
  if (servers.has(language)) return servers.get(language)
  let proc
  const options = { cwd: projectRoot, stdio: ['pipe', 'pipe', 'pipe'] }
  switch (language) {
    case 'python':
      proc = spawn('pylsp', ['--tcp', '--ws'], options); break
    case 'cpp':
      proc = spawn('clangd', [], options); break
    case 'go':
      proc = spawn('gopls', [], options); break
    case 'typescript':
    case 'typescriptreact':
    case 'javascript':
    case 'javascriptreact':
      proc = spawn('typescript-language-server', ['--stdio'], options); break
    case 'java':
      // eclipse.jdt.ls — installed at ~/.local/jdtls
      try {
        const os   = require('os')
        const path = require('path')
        const jdtls = path.join(os.homedir(), '.local', 'jdtls', 'bin', 'jdtls')
        proc = spawn(jdtls, [], options)
      } catch {
        console.warn('[lsp] eclipse.jdt.ls not found at ~/.local/jdtls')
        return null
      }
      break
    case 'gdscript':
      // Connect to Godot 4's built-in LSP — it's a TCP server, not a stdio process
      // We wrap it with a tiny stdio bridge on port 6005
      try {
        const net  = require('net')
        const { EventEmitter } = require('events')
        const emitter = new EventEmitter()
        const socket  = net.createConnection({ port: 6005, host: '127.0.0.1' })
        socket.on('connect', () => console.log('[lsp] GDScript LSP connected on :6005'))
        socket.on('error',   (e) => console.warn('[lsp] GDScript LSP error:', e.message))
        // Minimal connection shim
        const conn = {
          reader: { onError: () => {}, onClose: () => {}, listen: (cb) => {
            let buf = Buffer.alloc(0)
            socket.on('data', (chunk) => {
              buf = Buffer.concat([buf, chunk])
              // naive LSP framing
              const header = 'Content-Length: '
              while (true) {
                const str = buf.toString('utf8')
                const hi = str.indexOf(header)
                if (hi < 0) break
                const ni = str.indexOf('', hi)
                if (ni < 0) break
                const len = parseInt(str.slice(hi + header.length, ni))
                const start = ni + 4
                if (buf.length < start + len) break
                try { cb(JSON.parse(buf.slice(start, start + len).toString('utf8'))) } catch {}
                buf = buf.slice(start + len)
              }
            })
          }},
          writer: { write: (msg) => {
            const body = JSON.stringify(msg)
            socket.write(`Content-Length: ${Buffer.byteLength(body)}

${body}`)
          }},
          proc: null,
          socket,
        }
        servers.set(language, conn)
        return conn
      } catch (e) {
        console.warn('[lsp] GDScript LSP bridge error:', e.message)
        return null
      }
    default: return null
  }
  const reader = new MessageReader(proc.stdout)
  const writer = new MessageWriter(proc.stdin)
  const connection = { reader, writer, proc, sendRequest: (method, params) => { /* simplified */ } }
  servers.set(language, connection)
  return connection
}

module.exports = { launch }
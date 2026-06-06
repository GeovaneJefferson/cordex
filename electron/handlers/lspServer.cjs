// electron/handlers/lspServer.cjs
// stdio ↔ WebSocket bridge for pylsp and typescript-language-server.
// Python port:     6007   (pylsp via python3 -m pylsp --stdio)
// TypeScript port: 6008   (typescript-language-server --stdio)
'use strict'
const { spawn, execFileSync } = require('child_process')
const WebSocket = require('ws')
const path      = require('path')
const fs        = require('fs')

const srvState = {
  python:     { proc: null, wss: null, port: 6007 },
  typescript: { proc: null, wss: null, port: 6008 },
}

// ── Build a PATH that covers common install locations ─────────────────────────
function buildEnv() {
  const extra = [
    path.join(process.env.HOME || '', '.local', 'bin'),
    path.join(process.env.HOME || '', '.npm-global', 'bin'),
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ].join(':')
  return {
    ...process.env,
    PATH: extra + ':' + (process.env.PATH || ''),
  }
}

// ── Resolve how to launch pylsp ───────────────────────────────────────────────
// Prefer:  python3 -m pylsp --stdio   (works regardless of PATH)
// Fallback: pylsp --stdio             (if somehow on PATH)
let _pylspResolved = undefined  // cache: undefined=unchecked, null=not found, object=found

function resolvePylsp() {
  if (_pylspResolved !== undefined) return _pylspResolved  // use cached result
  // Check module is importable — runs only ONCE, result cached forever
  try {
    execFileSync('python3', ['-c', 'import pylsp'], { timeout: 4000, env: buildEnv() })
    _pylspResolved = { cmd: 'python3', args: ['-m', 'pylsp', '--stdio'] }
    return _pylspResolved
  } catch {}
  // Direct binary fallback
  const bins = [
    path.join(process.env.HOME || '', '.local', 'bin', 'pylsp'),
    '/usr/local/bin/pylsp',
    '/usr/bin/pylsp',
  ]
  for (const b of bins) {
    try { if (fs.existsSync(b)) return { cmd: b, args: ['--stdio'] } } catch {}
  }
  _pylspResolved = null  // not installed — cache so we don't check again
  return null
}

// ── Resolve typescript-language-server ───────────────────────────────────────
function resolveTSLS() {
  const env = buildEnv()
  // Try which first
  try {
    const p = execFileSync('which', ['typescript-language-server'], { timeout: 3000, env, encoding: 'utf8' }).trim()
    if (p) return { cmd: p, args: ['--stdio'] }
  } catch {}
  // npm global
  try {
    const root = execFileSync('npm', ['root', '-g'], { timeout: 5000, env, encoding: 'utf8' }).trim()
    const bin  = path.join(root, '..', '.bin', 'typescript-language-server')
    if (fs.existsSync(bin)) return { cmd: bin, args: ['--stdio'] }
  } catch {}
  return null
}

// ── Generic stdio LSP ↔ WebSocket bridge ─────────────────────────────────────
function startBridge(lang, projectRoot) {
  const srv = srvState[lang]
  if (!srv || srv.wss) return   // already running

  let resolved
  if      (lang === 'python')     resolved = resolvePylsp()
  else if (lang === 'typescript') resolved = resolveTSLS()

  if (!resolved) {
    const hint = lang === 'python'
      ? 'pip install python-lsp-server --break-system-packages'
      : 'npm install -g typescript typescript-language-server'
    console.error(`[lsp/${lang}] Not installed. Run: ${hint}`)
    return
  }

  const env = buildEnv()
  console.log(`[lsp/${lang}] spawning: ${resolved.cmd} ${resolved.args.join(' ')}`)

  let lspProc
  try {
    lspProc = spawn(resolved.cmd, resolved.args, {
      cwd: projectRoot || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
    })
  } catch (err) {
    console.error(`[lsp/${lang}] spawn failed:`, err.message)
    return
  }
  srv.proc = lspProc

  // MUST attach error handler immediately or ENOENT crashes Electron
  lspProc.on('error', err => {
    console.error(`[lsp/${lang}] process error (${err.code}):`, err.message)
    srv.proc = null
    if (srv.wss) { try { srv.wss.close() } catch {} srv.wss = null }
  })
  lspProc.on('close', code => {
    console.log(`[lsp/${lang}] exited (${code})`)
    srv.proc = null
    if (srv.wss) { try { srv.wss.close() } catch {} srv.wss = null }
  })
  lspProc.stderr.on('data', d => {
    const txt = d.toString().slice(0, 200)
    if (!txt.includes('INFO') && !txt.includes('WARNING')) console.error(`[lsp/${lang}]`, txt)
  })

  // WebSocket server — buffers messages until renderer connects
  const wss = new WebSocket.Server({ port: srv.port })
  srv.wss = wss

  let activeSocket = null
  const pending    = []

  lspProc.stdout.on('data', chunk => {
    const msg = chunk.toString()
    if (activeSocket?.readyState === WebSocket.OPEN) activeSocket.send(msg)
    else pending.push(msg)
  })

  wss.on('connection', socket => {
    console.log(`[lsp/${lang}] renderer connected on :${srv.port}`)
    activeSocket = socket
    // Flush buffered output
    while (pending.length) {
      const m = pending.shift()
      if (socket.readyState === WebSocket.OPEN) socket.send(m)
    }
    socket.on('message', data => {
      if (lspProc?.stdin?.writable) lspProc.stdin.write(data.toString())
    })
    socket.on('close',  () => { if (activeSocket === socket) activeSocket = null })
    socket.on('error', err => console.error(`[lsp/${lang}] socket:`, err.message))
  })
  wss.on('error', err => console.error(`[lsp/${lang}] WSS error:`, err.message))
  console.log(`[lsp/${lang}] bridge ready on ws://localhost:${srv.port}`)
}

function stopBridge(lang) {
  const srv = srvState[lang]
  if (!srv) return
  if (srv.proc) { try { srv.proc.kill() } catch {} srv.proc = null }
  if (srv.wss)  { try { srv.wss.close() } catch {} srv.wss = null }
}

// Legacy compat names used by lspHandler.cjs
const startLspForProject = (root) => startBridge('python', root)
const stopLspForProject  = ()     => stopBridge('python')

module.exports = { startLspForProject, stopLspForProject, startBridge, stopBridge }

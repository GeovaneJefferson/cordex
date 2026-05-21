'use strict'
const { spawn } = require('child_process')
const path      = require('path')
const os        = require('os')
const fs        = require('fs')
const { loadSettings, saveSettings } = require('./settings.cjs')

let serverProcess = null
let serverStatus  = 'stopped'
let serverError   = null
let statusListeners = []

function onStatusChange(fn) {
  statusListeners.push(fn)
  return () => { statusListeners = statusListeners.filter(l => l !== fn) }
}
function emit(status, error = null) {
  serverStatus = status; serverError = error
  statusListeners.forEach(fn => fn({ status, error }))
  console.log(`[llamaServer] → ${status}${error ? ': ' + String(error).slice(0,120) : ''}`)
}

function findBinary() {
  const s = loadSettings()
  if (s.llamaServerPath && fs.existsSync(s.llamaServerPath)) return s.llamaServerPath
  const home = os.homedir()
  const candidates = [
    path.join(home, 'llama.cpp', 'build', 'bin', 'llama-server'),
    path.join(home, 'llama.cpp', 'build', 'bin', 'server'),
    '/usr/local/bin/llama-server',
    '/usr/bin/llama-server',
    path.join(home, '.local', 'bin', 'llama-server'),
  ]
  return candidates.find(p => { try { return fs.existsSync(p) } catch { return false } }) ?? null
}

// ── Real model scanner — vocab files are always tiny, real models ≥ 100MB ────
function scanModels() {
  const home = os.homedir()
  const dirs = [
    path.join(home, 'llama.cpp', 'models'),
    path.join(home, 'models'),
    path.join(home, '.local', 'share', 'models'),
    '/opt/models',
  ]
  const found = []
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(dir)) continue
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.gguf')) continue
        const lower = f.toLowerCase()
        // Skip vocab / tokenizer files by name
        if (lower.startsWith('ggml-vocab') ||
            lower.includes('vocab')        ||
            lower.includes('tokenizer')    ||
            lower.endsWith('.inp')         ||
            lower.endsWith('.out'))        continue

        const fullPath = path.join(dir, f)
        let size = 0
        try { size = fs.statSync(fullPath).size } catch { continue }

        // ← FIX: use !(size >= threshold) to correctly reject NaN and 0
        if (!(size >= 100 * 1024 * 1024)) {
          console.log(`[llamaServer] skip small/invalid: ${f} (${Math.round(size/1024/1024)}MB)`)
          continue
        }
        found.push({ name: f, path: fullPath, sizeBytes: size,
          sizeLabel: size >= 1e9 ? `${(size/1e9).toFixed(1)}GB` : `${Math.round(size/1e6)}MB` })
      }
    } catch {}
  }
  // Largest first — bigger = more capable, prefer as default
  return found.sort((a, b) => b.sizeBytes - a.sizeBytes)
}

function findBestModel() {
  const s = loadSettings()
  const availableModels = scanModels()

  const userChoice = s.analysisModel || s.flowModel || s.llamaModelPath

  if (userChoice) {
    console.log(`[llamaServer] UI requested: ${userChoice}`)
    
    // Clean the string: extract the base name (ignores the ":3b" from Ollama tags)
    const searchTag = userChoice.toLowerCase().split(':')[0]

    // Match exactly OR match by the base name (fuzzy match)
    const matchedModel = availableModels.find(m => 
      m.name === userChoice || 
      m.path === userChoice ||
      m.name.toLowerCase().includes(searchTag)
    )
    
    if (matchedModel) {
      console.log(`[llamaServer] Matched and overriding with: ${matchedModel.name}`)
      return matchedModel.path
    } else {
      console.log(`[llamaServer] Warning: Could not find any local file matching "${userChoice}"`)
    }
  }

  // Fallback: Pick the largest available model
  return availableModels[0]?.path ?? null
}
// function findBestModel() {
//   const s = loadSettings()
//   // User-pinned model — validate it's real
//   if (s.llamaModelPath && fs.existsSync(s.llamaModelPath)) {
//     let size = 0
//     try { size = fs.statSync(s.llamaModelPath).size } catch {}
//     if (size >= 100 * 1024 * 1024) return s.llamaModelPath
//   }
//   return scanModels()[0]?.path ?? null
// }

function buildEnv(gpu) {
  const overrides = {}
  if (gpu?.envOverrides) Object.assign(overrides, gpu.envOverrides)
  if (!overrides['HSA_OVERRIDE_GFX_VERSION'] && process.platform === 'linux') {
    try {
      const { detectAMDArch } = require('./gpuDetect.cjs')
      const arch = detectAMDArch()
      if (arch.needsHsaOverride) overrides['HSA_OVERRIDE_GFX_VERSION'] = arch.hsaOverride
    } catch {}
  }
  const s = loadSettings()
  if (s.hsaOverride) overrides['HSA_OVERRIDE_GFX_VERSION'] = s.hsaOverride
  return {
    ...process.env, ...overrides,
    LD_LIBRARY_PATH: [process.env.LD_LIBRARY_PATH, '/opt/rocm/lib', '/opt/rocm/hip/lib'].filter(Boolean).join(':'),
  }
}

async function startServer(opts = {}) {
  if (serverProcess && serverStatus === 'running') return { ok: true, already: true }
  if (serverStatus === 'starting') return { ok: false, error: 'Already starting' }

  const binary = findBinary()
  const model  = findBestModel()

  if (!binary) {
    const msg = 'llama-server binary not found. Build: cmake -B build -DGGML_HIPBLAS=ON -DAMDGPU_TARGETS=gfx1010 && cmake --build build -j$(nproc)'
    emit('error', msg); return { ok: false, error: msg }
  }
  if (!model) {
    const msg = 'No runnable model (≥100MB .gguf) found. Place models in ~/llama.cpp/models/'
    emit('error', msg); return { ok: false, error: msg }
  }

  emit('starting')
  const ngl  = opts.ngl  ?? (opts.gpu?.layers ?? 33)
  const port = opts.port ?? 8080
  const ctx  = opts.ctx  ?? 4096
  const env  = buildEnv(opts.gpu)
  const modelName = path.basename(model)

  console.log('[llamaServer] ─────────────────────')
  console.log('[llamaServer] Binary:', binary)
  console.log('[llamaServer] Model: ', modelName)
  console.log('[llamaServer] GPU layers:', ngl)
  if (env.HSA_OVERRIDE_GFX_VERSION) console.log('[llamaServer] HSA_OVERRIDE_GFX_VERSION =', env.HSA_OVERRIDE_GFX_VERSION)

  const args = ['-m', model, '-ngl', String(ngl), '--port', String(port), '-c', String(ctx), '--host', '127.0.0.1', '-np', '1']
  serverProcess = spawn(binary, args, { env, stdio: ['ignore','pipe','pipe'], detached: false })

  serverProcess.stdout.on('data', d => {
    const t = d.toString()
    if (t.includes('listening')) emit('running')
  })
  serverProcess.stderr.on('data', d => {
    const t = d.toString()
    process.stdout.write('[llama] ' + t)
    // if (serverStatus === 'starting') process.stdout.write('[llama] ' + t)
    if (t.includes('listening')) emit('running')
    if ((t.includes('error') || t.includes('GGML_ASSERT')) && serverStatus === 'starting') {
      emit('error', t.slice(0,300).trim())
    }
  })
  serverProcess.on('exit', code => { serverProcess = null; if (serverStatus !== 'stopped') emit(code === 0 ? 'stopped' : 'error', `Exit ${code}`) })
  serverProcess.on('error', err => { serverProcess = null; emit('error', err.message) })

  return waitReady(port, 90000)
}

async function waitReady(port, ms) {
  const t0 = Date.now()
  let ticks = 0
  while (Date.now() - t0 < ms) {
    if (serverStatus === 'error') return { ok: false, error: serverError }
    try {
      const r = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2000) })
      if (r.ok || r.status === 200) {
        emit('running')
        console.log(`[llamaServer] ✓ Ready in ${Math.round((Date.now()-t0)/1000)}s`)
        return { ok: true }
      }
    } catch {}
    if (++ticks % 20 === 0) console.log(`[llamaServer] Loading… ${Math.round((Date.now()-t0)/1000)}s`)
    await new Promise(r => setTimeout(r, 500))
  }
  emit('error', 'Not ready after 90s')
  return { ok: false, error: 'Timeout' }
}

function stopServer() {
  if (!serverProcess) return
  emit('stopped')
  try { serverProcess.kill('SIGTERM') } catch {}
  setTimeout(() => { try { serverProcess?.kill('SIGKILL') } catch {} }, 3000)
  serverProcess = null
}

function getStatus() {
  const models = scanModels()
  return { status: serverStatus, error: serverError, binary: findBinary(), model: findBestModel(), models }
}

module.exports = { startServer, stopServer, getStatus, findBinary, findBestModel, scanModels, buildEnv, onStatusChange }

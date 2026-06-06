// electron/utils/ollamaSetup.cjs
// Auto-installs Ollama and pulls a default model on first run.
// Sends progress events to the renderer via win.webContents.send.
'use strict'
const { exec, spawn, execSync } = require('child_process')
const https   = require('https')
const fs      = require('fs')
const os      = require('os')
const path    = require('path')
const { loadSettings, saveSettings } = require('./settings.cjs')

const DEFAULT_MODEL   = 'qwen2.5-coder:1.5b-base'
const OLLAMA_PING_URL = 'http://127.0.0.1:11434/api/tags'

function send(win, event, data) {
  if (win && !win.isDestroyed()) win.webContents.send(event, data)
}

function isOllamaInstalled() {
  try { execSync('which ollama', { stdio: 'ignore', timeout: 3000 }); return true } catch { return false }
}

async function isOllamaRunning() {
  return new Promise(resolve => {
    const req = require('http').get(OLLAMA_PING_URL, res => {
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })
}

async function getInstalledModels() {
  return new Promise(resolve => {
    const req = require('http').get(OLLAMA_PING_URL, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try { resolve(JSON.parse(body).models ?? []) } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
  })
}

async function startOllama() {
  return new Promise(resolve => {
    const p = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' })
    p.unref()
    // Wait up to 8 seconds for it to be ready
    let tries = 0
    const check = setInterval(async () => {
      tries++
      if (await isOllamaRunning()) { clearInterval(check); resolve(true) }
      else if (tries > 16) { clearInterval(check); resolve(false) }
    }, 500)
  })
}

function pullModel(win, model) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ name: model, stream: true })
    const options = {
      hostname: '127.0.0.1', port: 11434,
      path: '/api/pull', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    let totalSize = 0
    let doneSize  = 0
    const req = require('http').request(options, res => {
      res.on('data', chunk => {
        const lines = chunk.toString().split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const j = JSON.parse(line)
            if (j.total) totalSize = j.total
            if (j.completed) doneSize = j.completed
            const pct = totalSize > 0 ? Math.round((doneSize / totalSize) * 100) : 0
            const status = j.status ?? ''
            send(win, 'setup:progress', { phase: 'pulling', model, status, pct, total: totalSize, done: doneSize })
          } catch {}
        }
      })
      res.on('end', () => resolve(true))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function installOllama(win) {
  // Linux only — use the official install script
  send(win, 'setup:progress', { phase: 'installing-ollama', status: 'Downloading Ollama installer…', pct: 5 })
  return new Promise((resolve, reject) => {
    exec('curl -fsSL https://ollama.com/install.sh | sh', { timeout: 120000 }, (err, stdout, stderr) => {
      if (err) { reject(new Error(stderr || err.message)); return }
      resolve(true)
    })
  })
}

/**
 * Main entry — call this once on app ready.
 * win: the BrowserWindow to send progress events to.
 */
async function ensureOllamaReady(win) {
  const settings = loadSettings()

  // Already set up in a previous run?
  if (settings.ollamaSetupDone) {
    // Just make sure ollama is running
    if (!await isOllamaRunning()) {
      send(win, 'setup:progress', { phase: 'starting', status: 'Starting Ollama…', pct: 10 })
      const ok = await startOllama()
      send(win, 'setup:progress', { phase: ok ? 'ready' : 'error', status: ok ? 'Ollama ready' : 'Could not start Ollama', pct: ok ? 100 : 0 })
    }
    return
  }

  send(win, 'setup:progress', { phase: 'checking', status: 'Checking Ollama…', pct: 2 })

  // 1. Install ollama if missing
  if (!isOllamaInstalled()) {
    send(win, 'setup:progress', { phase: 'installing-ollama', status: 'Installing Ollama (this takes ~30s)…', pct: 5 })
    try {
      await installOllama(win)
      send(win, 'setup:progress', { phase: 'installed-ollama', status: 'Ollama installed ✓', pct: 20 })
    } catch (err) {
      send(win, 'setup:progress', { phase: 'error', status: `Failed to install Ollama: ${err.message}`, pct: 0 })
      return
    }
  } else {
    send(win, 'setup:progress', { phase: 'ollama-found', status: 'Ollama found ✓', pct: 20 })
  }

  // 2. Start ollama serve if not running
  if (!await isOllamaRunning()) {
    send(win, 'setup:progress', { phase: 'starting', status: 'Starting Ollama server…', pct: 25 })
    const ok = await startOllama()
    if (!ok) {
      send(win, 'setup:progress', { phase: 'error', status: 'Could not start Ollama server', pct: 0 })
      return
    }
    send(win, 'setup:progress', { phase: 'started', status: 'Ollama server started ✓', pct: 35 })
  } else {
    send(win, 'setup:progress', { phase: 'running', status: 'Ollama already running ✓', pct: 35 })
  }

  // 3. Check if default model is already pulled
  const models = await getInstalledModels()
  const hasDefault = models.some(m => m.name === DEFAULT_MODEL || (m.name ?? '').startsWith(DEFAULT_MODEL.split(':')[0]))

  if (!hasDefault) {
    send(win, 'setup:progress', { phase: 'pulling', model: DEFAULT_MODEL, status: `Pulling ${DEFAULT_MODEL}…`, pct: 40 })
    try {
      await pullModel(win, DEFAULT_MODEL)
      send(win, 'setup:progress', { phase: 'pulled', status: `${DEFAULT_MODEL} ready ✓`, pct: 95 })
    } catch (err) {
      send(win, 'setup:progress', { phase: 'error', status: `Pull failed: ${err.message}`, pct: 0 })
      return
    }
  } else {
    send(win, 'setup:progress', { phase: 'model-exists', status: `Default model ready ✓`, pct: 95 })
  }

  // 4. Done — save flag so we skip this next time
  saveSettings({ ...settings, ollamaSetupDone: true })
  send(win, 'setup:progress', { phase: 'done', status: 'Setup complete ✓', pct: 100 })
}

module.exports = { ensureOllamaReady }

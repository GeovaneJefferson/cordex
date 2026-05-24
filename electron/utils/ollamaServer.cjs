'use strict'

/**
 * Ollama model manager — replaces llama-server lifecycle management.
 * Ollama runs as a background service; we only query and list its models.
 */

const OLLAMA_BASE = 'http://127.0.0.1:11434'

let statusListeners = []
let serverStatus    = 'unknown'

function onStatusChange(fn) {
  statusListeners.push(fn)
  return () => { statusListeners = statusListeners.filter(l => l !== fn) }
}

function emit(status, error = null) {
  serverStatus = status
  statusListeners.forEach(fn => fn({ status, error }))
  console.log(`[ollamaServer] → ${status}${error ? ': ' + String(error).slice(0, 120) : ''}`)
}

async function scanModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.models ?? []).map(m => ({
      name:      m.name,
      path:      m.name,
      sizeBytes: m.size ?? 0,
      sizeLabel: m.size >= 1e9
        ? `${(m.size / 1e9).toFixed(1)}GB`
        : `${Math.round((m.size || 0) / 1e6)}MB`,
    }))
  } catch {
    return []
  }
}

async function findBestModel() {
  const { loadSettings } = require('./settings.cjs')
  const s = loadSettings()
  const models = await scanModels()
  if (!models.length) return null

  const userChoice = s.analysisModel || s.flowModel
  if (userChoice) {
    const match = models.find(m => m.name === userChoice || m.name.startsWith(userChoice.split(':')[0]))
    if (match) return match.name
  }
  return models[0].name
}

// No binary to find — Ollama is a system service
function findBinary() {
  return 'ollama'
}

async function startServer() {
  // Ollama manages itself; just verify it's reachable
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (r.ok) {
      emit('running')
      return { ok: true }
    }
    const msg = 'Ollama not reachable. Run: ollama serve'
    emit('error', msg)
    return { ok: false, error: msg }
  } catch (err) {
    const msg = 'Ollama not running. Run: ollama serve'
    emit('error', msg)
    return { ok: false, error: msg }
  }
}

function stopServer() {
  // No-op — Ollama is a system service managed externally
  emit('stopped')
}

async function getStatus() {
  const models = await scanModels()
  const bestModel = models[0]?.name ?? null
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
    const status = r.ok ? 'running' : 'stopped'
    return { status, error: null, binary: 'ollama', model: bestModel, models }
  } catch {
    return { status: 'stopped', error: 'Ollama not running', binary: 'ollama', model: bestModel, models }
  }
}

// No env overrides needed for Ollama
function buildEnv() {
  return { ...process.env }
}

module.exports = { startServer, stopServer, getStatus, findBinary, findBestModel, scanModels, buildEnv, onStatusChange }

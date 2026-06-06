// electron/utils/profileManager.cjs
// Reads ai_profiles.json and resolves REAL traffic-light tiers from hardware.
'use strict'
const path = require('path')
const fs   = require('fs-extra')
const http = require('http')

const PROFILE_PATH = path.join(__dirname, '../../config/ai_profiles.json')
let _profile  = null
let _resolved = null
// Hardware-ready promise — resolves when actual hw data arrives
let _hwResolve = null
let _hwPromise = new Promise(r => { _hwResolve = r })
let _hwData    = null

function loadProfile() {
  if (_profile) return _profile
  try { _profile = fs.readJsonSync(PROFILE_PATH) }
  catch { _profile = { global_configuration: {}, models: {} } }
  return _profile
}

// Called from main.cjs when hardwareHandler emits hardware:info
function setHardware(hw) {
  _hwData = hw
  _hwResolve(hw)
  // Rebuild resolved profile immediately
  _resolved = _buildResolved(hw)
  console.log('[profile] Hardware received, resolving traffic lights...')
  Object.values(_resolved.models).forEach(m => {
    console.log(`  ${m.friendly_name}: ${m.ui_features.traffic_light_tier} (VRAM needed: ${m.hardware_requirements?.minimum_vram_gb}GB, available: ${((hw.vram_mb||0)/1024).toFixed(1)}GB)`)
  })
}

// ── Core traffic light logic ───────────────────────────────────────────────
// Green  = GPU VRAM ≥ model min + 1.5GB overhead (runs fully on GPU)
// Yellow = Not enough VRAM but system RAM can host weights (CPU fallback)
// Red    = Even system RAM is insufficient
function computeTrafficLight(modelEntry, hw) {
  const minGb    = modelEntry.hardware_requirements?.minimum_vram_gb ?? 0
  const OVERHEAD = 1.5   // system overhead buffer per spec
  if (!hw) return { tier: 'Green', reason: 'Hardware unknown — optimistic' }

  const hasGpu = hw.has_gpu === true && (hw.vram_mb ?? 0) > 0
  const vramGb = (hw.vram_mb ?? 0) / 1024        // MB → GB
  const ramGb  = hw.total_ram_gb ?? 0

  if (hasGpu && vramGb >= minGb + OVERHEAD) {
    return { tier: 'Green', reason: `GPU: ${vramGb.toFixed(1)}GB VRAM ≥ ${(minGb + OVERHEAD).toFixed(1)}GB needed` }
  }
  if (ramGb >= minGb + OVERHEAD) {
    return { tier: 'Yellow', reason: `CPU fallback: ${vramGb.toFixed(1)}GB VRAM < needed, using ${ramGb.toFixed(0)}GB RAM` }
  }
  return { tier: 'Red', reason: `Insufficient: ${ramGb.toFixed(0)}GB RAM < ${(minGb + OVERHEAD).toFixed(1)}GB needed` }
}

function _buildResolved(hw) {
  const raw = JSON.parse(JSON.stringify(loadProfile()))
  for (const key of Object.keys(raw.models)) {
    const m  = raw.models[key]
    const { tier, reason } = computeTrafficLight(m, hw)
    m.ui_features = m.ui_features || {}
    m.ui_features.traffic_light_tier   = tier
    m.ui_features.traffic_light_reason = reason
    m.ui_features.on_gpu = hw?.has_gpu === true && (hw?.vram_mb ?? 0) > 0
    m.ui_features.vram_available_gb    = hw ? ((hw.vram_mb ?? 0) / 1024) : null
    m.ui_features.ram_available_gb     = hw?.total_ram_gb ?? null
  }
  return raw
}

// ── Public API ─────────────────────────────────────────────────────────────
async function resolveProfile() {
  // Wait up to 5 seconds for hardware detection before giving up
  const hw = await Promise.race([
    _hwPromise,
    new Promise(r => setTimeout(() => r(global.__cordexHardware || null), 5000)),
  ])
  return _buildResolved(hw)
}

async function getChatModels() {
  const p = await resolveProfile()
  return Object.values(p.models).filter(m =>
    m.role !== 'codebase_vectorization' && m.role !== 'inline_ghost_text_autocomplete'
  )
}

async function ensureBaselineModels(win) {
  const raw    = loadProfile()
  const needed = [
    raw.global_configuration?.default_autocomplete_model,
    raw.global_configuration?.default_embedding_model,
  ].filter(Boolean)

  const installed = await new Promise(resolve => {
    const req = http.get('http://127.0.0.1:11434/api/tags', { timeout: 3000 }, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => {
        try { resolve(JSON.parse(body).models?.map(m => m.name) ?? []) }
        catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(3000, () => { req.destroy(); resolve([]) })
  })

  for (const model of needed) {
    const present = installed.some(n => n === model || n.startsWith(model.split(':')[0]))
    if (present) { console.log('[profile] Baseline model present:', model); continue }

    console.log('[profile] Pulling baseline model:', model)
    if (win && !win.isDestroyed()) win.webContents.send('profile:pulling-baseline', { model, pct: 0 })

    await new Promise(resolve => {
      const body = JSON.stringify({ name: model, stream: true })
      const opts = {
        hostname: '127.0.0.1', port: 11434, path: '/api/pull', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      }
      const req = http.request(opts, res => {
        res.on('data', chunk => {
          try {
            const lines = chunk.toString().split('\n').filter(Boolean)
            const j = JSON.parse(lines[lines.length - 1] || '{}')
            if (win && !win.isDestroyed() && j.status) {
              win.webContents.send('profile:pulling-baseline', {
                model, status: j.status,
                pct: j.total ? Math.round((j.completed / j.total) * 100) : 0,
              })
            }
          } catch {}
        })
        res.on('end', resolve)
        res.on('error', resolve)
      })
      req.on('error', resolve)
      req.setTimeout(120000, resolve)
      req.write(body); req.end()
    })
  }
}

function getGlobalConfig() { return (loadProfile().global_configuration) || {} }
function getModelByIdentifier(id) {
  const p = _resolved || loadProfile()
  return Object.values(p.models).find(m => m.model_identifier === id) || null
}

module.exports = { loadProfile, resolveProfile, getChatModels, ensureBaselineModels, setHardware, getGlobalConfig, getModelByIdentifier }

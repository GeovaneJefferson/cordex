'use strict'
const { ipcMain }      = require('electron')
const os               = require('os')
const { detectGPU }    = require('../utils/gpuDetect.cjs')
const { loadSettings, saveSettings } = require('../utils/settings.cjs')
const ollamaServer     = require('../utils/ollamaServer.cjs')

const OLLAMA_BASE = 'http://127.0.0.1:11434'

let cachedHW = null

module.exports = function(mainWindow) {

  ipcMain.handle('hardware:info', async () => {
    if (cachedHW) {
      mainWindow?.webContents?.send('hw:detected', cachedHW)
      return cachedHW
    }

    const totalRamGB = Math.round(os.totalmem() / (1024**3) * 10) / 10
    const freeRamGB  = Math.round(os.freemem()  / (1024**3) * 10) / 10
    const cpuModel   = os.cpus()[0]?.model ?? 'Unknown'
    const cpuCores   = os.cpus().length

    const gpu = await detectGPU()

    let capability = 'LITE'
    if (gpu.supported && gpu.vramMB >= 4000)             capability = 'PRO'
    else if (gpu.supported && gpu.vramMB >= 2000)        capability = 'MID'
    else if (gpu.vendor === 'apple' && totalRamGB >= 8)  capability = 'PRO'
    else if (totalRamGB >= 14)                           capability = 'MID'

    const modelMap = {
      PRO:  { autocomplete: 'qwen2.5-coder:7b',        analysis: 'qwen2.5-coder:7b' },
      MID:  { autocomplete: 'qwen2.5-coder:3b',        analysis: 'qwen2.5-coder:3b' },
      LITE: { autocomplete: 'qwen2.5-coder:1.5b',      analysis: 'qwen2.5-coder:1.5b' },
    }[capability]

    // Persist first-run settings
    const settings = loadSettings()
    if (!settings._gpuDetected) {
      saveSettings({
        ...settings,
        autocompleteModel: settings.autocompleteModel || modelMap.autocomplete,
        analysisModel:     settings.analysisModel     || modelMap.analysis,
        _gpuDetected:      true,
      })
    }

    const srvInfo = await ollamaServer.getStatus()

    cachedHW = {
      total_ram_gb: totalRamGB, free_ram_gb: freeRamGB,
      cpu_model: cpuModel, cpu_cores: cpuCores,
      platform: process.platform,
      has_gpu: gpu.supported, gpu_vendor: gpu.vendor, gpu_name: gpu.name,
      vram_mb: gpu.vramMB, gpu_backend: gpu.backend, gpu_layers: gpu.layers,
      gpu_reason: gpu.reason, cuda_version: gpu.cudaVersion, rocm_version: gpu.rocmVersion,
      llama_binary: 'ollama', llama_model: srvInfo.model,
      capability, recommended_models: modelMap,
      canThink: capability !== 'LITE', canFlow: true,
      modelMap: { ghost: modelMap.autocomplete, analysis: modelMap.analysis },
    }

    mainWindow?.webContents?.send('hw:detected', cachedHW)
    return cachedHW
  })

  ipcMain.handle('hardware:redetect', async () => {
    cachedHW = null
    const gpu = await detectGPU()
    cachedHW = null
    return { ok: true }
  })

  ipcMain.handle('hardware:checkModels', async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return { valid: false, message: 'Ollama not running. Run: ollama serve' }
      const data = await res.json()
      const models = data.models ?? []
      if (models.length === 0) return { valid: false, message: 'No models installed. Run: ollama pull qwen2.5-coder:7b' }
      return { valid: true, message: '' }
    } catch {
      return { valid: false, message: 'Ollama not running. Run: ollama serve' }
    }
  })

  // ── Ollama IPC (replaces llama:* handlers) ─────────────────────────────────
  ipcMain.handle('llama:start', async () => {
    return ollamaServer.startServer()
  })

  ipcMain.handle('llama:stop', async () => {
    ollamaServer.stopServer()
    return { ok: true }
  })

  ipcMain.handle('llama:status', async () => ollamaServer.getStatus())

  ipcMain.handle('llama:save-config', async (_ev, cfg) => {
    const s = loadSettings()
    saveSettings({ ...s, ...cfg })
    return { ok: true }
  })

  // Forward status changes to renderer
  ollamaServer.onStatusChange(({ status, error }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('llama:status-changed', { status, error })
    }
  })

  // Auto-check Ollama on startup
  setTimeout(async () => {
    const info = await ollamaServer.getStatus()
    if (info.status === 'running') {
      const settings = loadSettings()
      const activeModel = settings.analysisModel || settings.autocompleteModel || info.model || 'none'
      console.log(settings.analysisModel);
      console.log(settings.autocompleteModel);
      console.log(info.model);
      console.log('[hw] Ollama is running ✓  active model:', activeModel, '| available models:', info.models?.length ?? 0)
    } else {
      console.warn('[hw] Ollama not detected. Run: ollama serve')
      if (!info.model) console.log('  No models found. Run: ollama pull qwen2.5-coder:7b')
    }
  }, 2500)
}

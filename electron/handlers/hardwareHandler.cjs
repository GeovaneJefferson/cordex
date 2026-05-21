'use strict'
const { ipcMain }      = require('electron')
const os               = require('os')
const { detectGPU }    = require('../utils/gpuDetect.cjs')
const { loadSettings, saveSettings } = require('../utils/settings.cjs')
const llamaServer      = require('../utils/llamaServer.cjs')

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

    // Capability — GPU with any VRAM beats CPU tiers
    let capability = 'LITE'
    if (gpu.supported && gpu.vramMB >= 4000)             capability = 'PRO'
    else if (gpu.supported && gpu.vramMB >= 2000)        capability = 'MID'
    else if (gpu.vendor === 'apple' && totalRamGB >= 8)  capability = 'PRO'
    else if (totalRamGB >= 14)                           capability = 'MID'

    const modelMap = {
      PRO:  { autocomplete: 'qwen2.5-coder:7b',        analysis: 'qwen2.5-coder:7b' },
      MID:  { autocomplete: 'qwen2.5-coder:3b',        analysis: 'qwen2.5-coder:3b' },
      LITE: { autocomplete: 'qwen2.5-coder:1.5b-base', analysis: 'qwen2.5-coder:1.5b-base' },
    }[capability]

    // llama-server flags
    const llamaFlags = []
    if (gpu.layers > 0) llamaFlags.push('-ngl', String(gpu.layers))
    llamaFlags.push('-c', String(gpu.vramMB >= 8000 ? 4096 : gpu.vramMB >= 4000 ? 2048 : 1024))

    // Persist first-run settings
    const settings = loadSettings()
    if (!settings._gpuDetected) {
      saveSettings({
        ...settings,
        autocompleteModel: settings.autocompleteModel || modelMap.autocomplete,
        analysisModel:     settings.analysisModel     || modelMap.analysis,
        _gpuDetected:      true,
        _llamaFlags:       llamaFlags,
        hsaOverride:       gpu.envOverrides?.['HSA_OVERRIDE_GFX_VERSION'] ?? null,
      })
    }

    const srvInfo = llamaServer.getStatus()

    cachedHW = {
      total_ram_gb: totalRamGB, free_ram_gb: freeRamGB,
      cpu_model: cpuModel, cpu_cores: cpuCores,
      platform: process.platform,
      has_gpu: gpu.supported, gpu_vendor: gpu.vendor, gpu_name: gpu.name,
      vram_mb: gpu.vramMB, gpu_backend: gpu.backend, gpu_layers: gpu.layers,
      gpu_reason: gpu.reason, cuda_version: gpu.cudaVersion, rocm_version: gpu.rocmVersion,
      hsa_override: gpu.envOverrides?.['HSA_OVERRIDE_GFX_VERSION'] ?? null,
      llama_flags: llamaFlags, llama_binary: srvInfo.binary, llama_model: srvInfo.model,
      capability, recommended_models: modelMap,
      canThink: capability !== 'LITE', canFlow: true,
      modelMap: { ghost: modelMap.autocomplete, analysis: modelMap.analysis },
    }

    mainWindow?.webContents?.send('hw:detected', cachedHW)
    return cachedHW
  })

  ipcMain.handle('hardware:redetect', async () => {
    cachedHW = null
    const { ipcMain: ipc } = require('electron')
    // re-invoke via direct call
    const gpu = await detectGPU()
    cachedHW = null
    return ipc.emit('hardware:info')
  })

  ipcMain.handle('hardware:checkModels', async () => ({ valid: true, message: '' }))

  // ── llama-server IPC ───────────────────────────────────────────────────────
  ipcMain.handle('llama:start', async (_ev, opts = {}) => {
    // Pass GPU info so env overrides (HSA_OVERRIDE) are applied
    const gpu = await detectGPU()
    return llamaServer.startServer({ ...opts, gpu })
  })

  ipcMain.handle('llama:stop', async () => {
    llamaServer.stopServer()
    return { ok: true }
  })

  ipcMain.handle('llama:status', async () => llamaServer.getStatus())

  ipcMain.handle('llama:save-config', async (_ev, cfg) => {
    const s = loadSettings()
    saveSettings({ ...s, ...cfg })
    return { ok: true }
  })

  // Forward server status changes to renderer
  llamaServer.onStatusChange(({ status, error }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('llama:status-changed', { status, error })
    }
  })

  // Auto-start llama-server if binary + model are present
  setTimeout(async () => {
    const info = llamaServer.getStatus()
    if (info.binary && info.model) {
      console.log('[hw] Auto-starting llama-server with GPU...')
      const gpu = await detectGPU()
      const r   = await llamaServer.startServer({ ngl: gpu.layers || 99, gpu })
      if (r.ok) console.log('[hw] llama-server started ✓')
      else      console.warn('[hw] Auto-start failed:', r.error)
    } else {
      console.log('[hw] llama-server auto-start skipped')
      if (!info.binary) console.log('  missing: binary (build llama.cpp with -DGGML_HIPBLAS=ON)')
      if (!info.model)  console.log('  missing: model  (place .gguf in ~/llama.cpp/models/)')
    }
  }, 2500)
}

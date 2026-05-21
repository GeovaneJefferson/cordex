'use strict'
const { ipcMain } = require('electron')

const OLLAMA_BASE = 'http://127.0.0.1:11434'

module.exports = function () {
  // List installed Ollama models
  ipcMain.handle('ollama:list', async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
      if (!res.ok) return { ok: false, models: [] }
      const data = await res.json()
      const models = (data.models ?? []).map(m => ({
        name: m.name,
        size: m.size,
        modified: m.modified_at,
        family: m.details?.family ?? '',
        parameterSize: m.details?.parameter_size ?? '',
      }))
      return { ok: true, models }
    } catch {
      return { ok: false, models: [] }
    }
  })

  // Check if Ollama is running
  ipcMain.handle('ollama:ping', async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
      return { ok: res.ok }
    } catch {
      return { ok: false }
    }
  })
}

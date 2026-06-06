// electron/handlers/lspHandler.cjs
'use strict'
const { ipcMain } = require('electron')
const { launch }  = require('../utils/lspLauncher.cjs')
const { startBridge, stopBridge } = require('./lspServer.cjs')

// Track which languages have active bridges
const activeLanguages = new Set()

module.exports = function () {

  // ── lsp:connect (legacy / TypeScript) ─────────────────────────────────────
  ipcMain.handle('lsp:connect', async (event, { language, projectRoot }) => {
    if (!projectRoot) throw new Error('No project root')
    const conn = launch(language, projectRoot)
    if (!conn) throw new Error(`Unsupported language: ${language}`)
    return { ok: true }
  })

  ipcMain.handle('lsp:send', async (event, { language, method, params }) => {
    // legacy — no-op if not used
    return { ok: true }
  })

  // ── lsp:start-python ───────────────────────────────────────────────────────
  // Only spawns if the bundle-python extension is installed & enabled.
  // The check happens renderer-side (usePythonLSP already guards), but
  // we double-guard here too so a crashed renderer can't re-trigger a spawn.
  ipcMain.handle('lsp:start-python', async (event, { projectRoot }) => {
    if (activeLanguages.has('python')) return { ok: true }
    activeLanguages.add('python')
    startBridge('python', projectRoot)
    return { ok: true }
  })

  ipcMain.on('lsp:stop-python', () => {
    activeLanguages.delete('python')
    stopBridge('python')
  })

  // ── lsp:start (generic, for future languages) ─────────────────────────────
  ipcMain.handle('lsp:start', async (event, { language, projectRoot }) => {
    if (activeLanguages.has(language)) return { ok: true }
    activeLanguages.add(language)
    startBridge(language, projectRoot)
    return { ok: true }
  })

  ipcMain.on('lsp:stop', (event, { language }) => {
    activeLanguages.delete(language)
    stopBridge(language)
  })
}

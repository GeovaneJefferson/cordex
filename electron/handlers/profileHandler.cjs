// electron/handlers/profileHandler.cjs
'use strict'
const { ipcMain } = require('electron')
const profileMgr  = require('../utils/profileManager.cjs')
const vectorIdx   = require('../utils/vectorIndexer.cjs')

module.exports = function(mainWindow) {
  let _projectRoot = null
  let _embeddingModel = null

  // ── profile:get — full resolved profile (with traffic lights) ─────────
  ipcMain.handle('profile:get', async () => {
    const hw = global.__cordexHardware || null
    return profileMgr.resolveProfile(hw)
  })

  // ── profile:chat-models — list of chat-eligible models with traffic lights
  ipcMain.handle('profile:chat-models', async () => {
    const hw = global.__cordexHardware || null
    profileMgr.resolveProfile(hw)
    return profileMgr.getChatModels()
  })

  // ── profile:model-params — get params for a specific model identifier ──
  ipcMain.handle('profile:model-params', async (_e, { identifier }) => {
    return profileMgr.getModelByIdentifier(identifier)
  })

  // ── indexer:start — triggered on project open or manual flush ──────────
  ipcMain.on('indexer:start', (_e, { projectRoot, force }) => {
    _projectRoot = projectRoot
    const cfg    = profileMgr.getGlobalConfig()
    _embeddingModel = cfg.default_embedding_model || 'qwen3-embedding:latest'
    if (force) {
      vectorIdx.flushAndReindex(mainWindow, projectRoot, _embeddingModel)
    } else {
      vectorIdx.runIndex(mainWindow, projectRoot, _embeddingModel)
    }
  })

  // Re-trigger indexing when project changes
  ipcMain.on('indexer:set-root', (_e, { projectRoot }) => {
    _projectRoot = projectRoot
    if (projectRoot) {
      const cfg = profileMgr.getGlobalConfig()
      _embeddingModel = cfg.default_embedding_model || 'qwen3-embedding:latest'
      vectorIdx.runIndex(mainWindow, projectRoot, _embeddingModel)
    }
  })
}

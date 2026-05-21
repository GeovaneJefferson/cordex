'use strict'
const { ipcMain, app } = require('electron')
const path = require('path')
const fs   = require('fs-extra')
const { loadSettings, saveSettings } = require('../utils/settings.cjs')

const SESSION_PATH = path.join(app.getPath('userData'), 'session.json')

module.exports = function() {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_ev, updates) => {
    const cur = loadSettings()
    saveSettings({ ...cur, ...updates })
    return { ok: true }
  })

  // Session: persist last opened folder + tabs
  ipcMain.handle('session:save', async (_ev, data) => {
    try {
      await fs.outputJson(SESSION_PATH, data, { spaces: 2 })
      return { ok: true }
    } catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('session:load', async () => {
    try {
      if (await fs.pathExists(SESSION_PATH)) {
        return await fs.readJson(SESSION_PATH)
      }
      return null
    } catch { return null }
  })
}

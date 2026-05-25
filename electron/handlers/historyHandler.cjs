'use strict'
const { ipcMain } = require('electron')
const { saveSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, deleteAllForFile } = require('../utils/historyDb.cjs')

module.exports = function () {
  ipcMain.handle('history:save', async (_ev, { filePath, content }) => {
    try { return { ok: true, saved: await saveSnapshot(filePath, content) } }
    catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('history:list', async (_ev, filePath) => {
    try { return { ok: true, snapshots: await listSnapshots(filePath) } }
    catch (err) { return { ok: false, error: err.message, snapshots: [] } }
  })

  // filePath is now required — pure JSON storage needs it to find the right file
  ipcMain.handle('history:restore', async (_ev, { id, filePath }) => {
    try {
      const content = await restoreSnapshot(id, filePath)
      if (content === null) return { ok: false, error: 'Snapshot not found' }
      return { ok: true, content }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('history:delete', async (_ev, { snapshotId, filePath, all }) => {
    try {
      if (all && filePath) await deleteAllForFile(filePath)
      else if (snapshotId != null && filePath) await deleteSnapshot(snapshotId, filePath)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  console.log('[historyHandler] ✓ registered (JSON storage)')
}

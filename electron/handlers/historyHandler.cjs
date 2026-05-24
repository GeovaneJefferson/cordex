'use strict'
const { ipcMain } = require('electron')
const {
  saveSnapshot,
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  deleteAllForFile,
} = require('../utils/historyDb.cjs')

module.exports = function () {
  // ── history:save ──────────────────────────────────────────────────────
  // Called after every successful file write.
  // payload: { filePath: string, content: string }
  ipcMain.handle('history:save', async (_ev, { filePath, content }) => {
    try {
      const saved = saveSnapshot(filePath, content)
      return { ok: true, saved }
    } catch (err) {
      console.error('[historyHandler] save error:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // ── history:list ─────────────────────────────────────────────────────
  // payload: filePath string
  // returns: { ok, snapshots: Array<{ id, timestamp, size }> }
  ipcMain.handle('history:list', async (_ev, filePath) => {
    try {
      const snapshots = listSnapshots(filePath)
      return { ok: true, snapshots }
    } catch (err) {
      console.error('[historyHandler] list error:', err.message)
      return { ok: false, error: err.message, snapshots: [] }
    }
  })

  // ── history:restore ──────────────────────────────────────────────────
  // payload: snapshotId (number)
  // returns: { ok, content: string }
  ipcMain.handle('history:restore', async (_ev, snapshotId) => {
    try {
      const content = restoreSnapshot(snapshotId)
      if (content === null) return { ok: false, error: 'Snapshot not found' }
      return { ok: true, content }
    } catch (err) {
      console.error('[historyHandler] restore error:', err.message)
      return { ok: false, error: err.message }
    }
  })

  // ── history:delete ───────────────────────────────────────────────────
  // payload: { snapshotId?: number, filePath?: string, all?: boolean }
  ipcMain.handle('history:delete', async (_ev, { snapshotId, filePath, all } = {}) => {
    try {
      if (all && filePath) {
        deleteAllForFile(filePath)
      } else if (snapshotId != null) {
        deleteSnapshot(snapshotId)
      }
      return { ok: true }
    } catch (err) {
      console.error('[historyHandler] delete error:', err.message)
      return { ok: false, error: err.message }
    }
  })

  console.log('[historyHandler] ✓ registered')
}

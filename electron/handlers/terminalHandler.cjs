'use strict'
const { ipcMain } = require('electron')
const os   = require('os')
const path = require('path')
const fs   = require('fs-extra')
let nodePty = null
try {
  nodePty = require('node-pty')
  console.log('[terminal] node-pty loaded OK')
} catch (e) {
  console.error('[terminal] node-pty failed to load:', e.message)
}

// Make global map accessible to main.cjs
global.ptyInstances = global.ptyInstances || new Map()

module.exports = function(mainWindow) {
  ipcMain.handle('terminal:create', async (ev, { id, cwd, cols, rows }) => {
    if (!nodePty) return { ok: false, error: 'node-pty not available' }
    if (global.ptyInstances.has(id)) {
      try { global.ptyInstances.get(id).kill(); } catch (_) {}
      global.ptyInstances.delete(id);
    }
    const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/bash')
    const workDir = cwd && fs.existsSync(cwd) ? cwd : os.homedir()

    const env = {
      ...process.env,
      TERM: 'xterm-256color',
      LANG: 'en_US.UTF-8',
      LC_ALL: 'en_US.UTF-8',
      COLORTERM: 'truecolor',
    }

    try {
      const ptyProc = nodePty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: Math.max(cols || 80, 40),
        rows: Math.max(rows || 24, 10),
        cwd: workDir,
        env,
      })

      global.ptyInstances.set(id, ptyProc)   // store in global map

      ptyProc.onData(data => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`terminal:data:${id}`, data)
        }
      })

      ptyProc.onExit(({ exitCode, signal }) => {
        global.ptyInstances.delete(id)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`terminal:exit:${id}`, {
            exitCode,
            killed: signal === 'SIGKILL' || exitCode === null,
          })
        }
      })

      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.on('terminal:write', (_ev, { id, data }) => {
    const ptyProc = global.ptyInstances.get(id)
    if (ptyProc) ptyProc.write(data)
  })
  
  ipcMain.handle('terminal:resize', (_ev, { id, cols, rows }) => {
    const ptyProc = global.ptyInstances.get(id)
    if (ptyProc) ptyProc.resize(cols, rows)
    return { ok: true }
  })

  ipcMain.handle('terminal:destroy', (_ev, { id }) => {
    const ptyProc = global.ptyInstances.get(id)
    if (ptyProc) { ptyProc.kill(); global.ptyInstances.delete(id) }
    return { ok: true }
  })
}
// electron/handlers/lspHandler.cjs
'use strict'
const { ipcMain } = require('electron')
const { launch } = require('../utils/lspLauncher.cjs')

const activeServers = new Map()

module.exports = function() {
  ipcMain.handle('lsp:connect', async (event, { language, projectRoot }) => {
    if (!projectRoot) throw new Error('No project root')
    const conn = launch(language, projectRoot)
    if (!conn) throw new Error(`Unsupported language: ${language}`)
    activeServers.set(language, conn)
    return { ok: true }
  })

  ipcMain.handle('lsp:send', async (event, { language, method, params }) => {
    const connection = activeServers.get(language)
    if (!connection) throw new Error('Not connected')
    return connection.sendRequest(method, params)
  })
}
'use strict'
const { ipcMain, dialog } = require('electron')
const path = require('path')
const fs   = require('fs-extra')
const os   = require('os')
const { exec } = require('child_process')
const { loadSettings, saveSettings } = require('../utils/settings.cjs')

function detectLang(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase()
  const map = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', cpp: 'cpp', c: 'c', h: 'cpp', hpp: 'cpp',
    go: 'go', java: 'java', json: 'json', md: 'markdown', html: 'html',
    css: 'css', sh: 'shell', yaml: 'yaml', yml: 'yaml', toml: 'toml', lua: 'lua',
  }
  return map[ext] ?? 'plaintext'
}

async function _buildTree(dir, depth = 0) {
  if (depth > 8) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nodes = []
  for (const ent of entries) {
    if (ent.name.startsWith('.') || ent.name === 'node_modules') continue
    const fullPath = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      nodes.push({ id: fullPath, name: ent.name, type: 'folder', path: fullPath, isOpen: false, children: await _buildTree(fullPath, depth + 1) })
    } else {
      nodes.push({ id: fullPath, name: ent.name, type: 'file', path: fullPath, language: detectLang(ent.name) })
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

module.exports = function(mainWindow) {
  ipcMain.handle('open-folder-dialog', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Open Project', properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths.length) return { success: false }
    const dir = result.filePaths[0]
    const tree = await _buildTree(dir)
    mainWindow?.webContents.send('folder-opened', dir, tree)
    return { success: true, path: dir, tree }
  })

  ipcMain.handle('open-file', async (_ev, filePath) => {
    try { const content = await fs.readFile(filePath, 'utf8'); return { success: true, content, filePath } }
    catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('save-file', async (_ev, { filePath, content }) => {
    try { await fs.outputFile(filePath, content, 'utf8'); return { success: true } }
    catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('rename-file', async (_ev, { oldPath, newPath }) => {
    try { await fs.rename(oldPath, newPath); return { success: true } }
    catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('create-file', async (_ev, { dirPath, fileName }) => {
    try { const fp = path.join(dirPath, fileName); await fs.outputFile(fp, '', 'utf8'); return { success: true, filePath: fp } }
    catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('refresh-folder', async () => ({ success: true, tree: [] }))

  ipcMain.handle('exec-command', async (_ev, cmd, cwd) =>
    new Promise(resolve => exec(cmd, { cwd: cwd || os.homedir() }, (error, stdout, stderr) =>
      resolve({ success: !error, output: error ? stderr : stdout })
    ))
  )

  ipcMain.handle('ai-status', async () => ({ ready: true }))
  ipcMain.handle('ai-transform', async () => '')
  ipcMain.handle('generate-comment', async () => '')

  ipcMain.handle('ollama-status', async () => {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2000) })
      const data = await res.json()
      return { connected: true, models: data.models ?? [], hasModel: true, latency: 0 }
    } catch { return { connected: false, models: [], hasModel: false, latency: null } }
  })

  ipcMain.handle('system-memory', async () => ({ used: Math.round(process.memoryUsage().rss / 1024 / 1024) }))
  ipcMain.handle('get-selected-model', async () => ({ model: loadSettings().analysisModel }))
  ipcMain.handle('set-selected-model', async (_ev, model) => { const s = loadSettings(); saveSettings({ ...s, analysisModel: model }); return { success: true } })
  ipcMain.handle('complete-code', async (_ev, code) => {
    try {
      const settings = loadSettings()
      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: settings.autocompleteModel, prompt: code, stream: false, options: { num_predict: 128, temperature: 0.2 } }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json(); return data.response?.trim() ?? ''
    } catch { return '' }
  })
}
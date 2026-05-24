'use strict'
const { ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs-extra')
let chokidar = null
try { chokidar = require('chokidar') } catch {}

let fsWatcher = null
let watchRoot = null

// ── Language detection ──────────────────────────────────────────────────
function detectLang(filename) {
  const ext = path.extname(filename).slice(1).toLowerCase()
  const map = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    cjs: 'javascript',
    py: 'python', rs: 'rust', cpp: 'cpp', c: 'c', h: 'cpp', hpp: 'cpp',
    go: 'go', java: 'java', json: 'json', md: 'markdown', html: 'html',
    css: 'css', scss: 'scss', sh: 'shell', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', lua: 'lua',
    gd: 'gdscript',
  }
  return map[ext] ?? 'plaintext'
}

// ── Fast file tree builder ──────────────────────────────────────────────
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', 'env',
  '.next', '.nuxt', 'coverage', '.cache',
  '.idea', '.vscode',
])

async function buildTree(dir, depth = 0) {
  if (depth > 4) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const nodes = []
  for (const ent of entries) {
    if (ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) continue
    const fullPath = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      nodes.push({
        id: fullPath, name: ent.name, type: 'folder',
        path: fullPath, isOpen: false,
        children: await buildTree(fullPath, depth + 1),
      })
    } else {
      nodes.push({
        id: fullPath, name: ent.name, type: 'file',
        path: fullPath, language: detectLang(ent.name),
      })
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ── Project docs helpers ────────────────────────────────────────────────
async function generateTreeString(dir, maxDepth, indent = '') {
  if (maxDepth < 0) return '';
  let out = '';
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) continue;
    out += `${indent}${ent.isDirectory() ? '📁' : '📄'} ${ent.name}\n`;
    if (ent.isDirectory() && maxDepth > 0) {
      out += await generateTreeString(path.join(dir, ent.name), maxDepth - 1, indent + '  ');
    }
  }
  return out;
}

async function getAllFiles(dir, array = [], prefix = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      await getAllFiles(full, array, rel);
    } else {
      array.push(rel);
    }
  }
  return array;
}

function stopWatcher() {
  if (fsWatcher) { fsWatcher.close(); fsWatcher = null; watchRoot = null }
}

// ── IPC handlers ────────────────────────────────────────────────────────
module.exports = function(mainWindow) {
  ipcMain.handle('fs:openProject', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    const result = await dialog.showOpenDialog(win, {
      title: 'Open Project Folder',
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths.length) return null
    return result.filePaths[0]
  })

  ipcMain.handle('fs:readDir', async (_ev, dirPath) => {
    try {
      const tree = await buildTree(dirPath)
      return { ok: true, tree, root: dirPath }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:readFile', async (_ev, filePath) => {
    try {
      const content = await fs.readFile(filePath, 'utf8')
      return { ok: true, content }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:writeFile', async (_ev, { filePath, content }) => {
    try {
      await fs.outputFile(filePath, content, 'utf8')
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:createFile', async (_ev, { dirPath, name }) => {
    try {
      const filePath = path.join(dirPath, name)
      await fs.outputFile(filePath, '', 'utf8')
      return { ok: true, path: filePath }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:createFolder', async (_ev, { dirPath, name }) => {
    try {
      const folderPath = path.join(dirPath, name)
      await fs.ensureDir(folderPath)
      return { ok: true, path: folderPath }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:rename', async (_ev, { oldPath, newName }) => {
    try {
      const newPath = path.join(path.dirname(oldPath), newName)
      await fs.rename(oldPath, newPath)
      return { ok: true, path: newPath }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:delete', async (_ev, itemPath) => {
    try {
      await fs.remove(itemPath)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:move', async (_ev, { srcPath, destDir }) => {
    try {
      const destPath = path.join(destDir, path.basename(srcPath))
      await fs.move(srcPath, destPath, { overwrite: false })
      return { ok: true, path: destPath }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('fs:watch', (_ev, dirPath) => {
    if (!chokidar) return { ok: false, error: 'chokidar not available' }
    stopWatcher()
    watchRoot = dirPath
    fsWatcher = chokidar.watch(dirPath, {
      ignored: /(^|[/\\])(\.|node_modules|dist|build|target|vendor|__pycache__)/,
      persistent: true,
      ignoreInitial: true,
      depth: 6,
    })
    const notify = (event, p) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fs:changed', { event, path: p, root: dirPath })
      }
    }
    fsWatcher
      .on('add', p => notify('add', p))
      .on('addDir', p => notify('addDir', p))
      .on('change', p => notify('change', p))
      .on('unlink', p => notify('unlink', p))
      .on('unlinkDir', p => notify('unlinkDir', p))
    return { ok: true }
  })

  ipcMain.handle('fs:stopWatch', () => { stopWatcher(); return { ok: true } })

  ipcMain.handle('fs:search', async (_ev, { root, query, caseSensitive, wholeWord, useRegex }) => {
    if (!root || !query) return { ok: true, results: [] }
    const SKIP_DIRS_SEARCH = new Set(['node_modules', '.git', '.svn', 'dist', 'build', '.next',
      '__pycache__', '.cache', 'coverage', '.venv', 'venv', 'target', '.idea', '.vscode'])
    const SKIP_EXTS = new Set(['.png','.jpg','.jpeg','.gif','.webp','.svg','.ico',
      '.mp4','.mp3','.woff','.woff2','.ttf','.eot','.pdf','.zip','.tar','.gz',
      '.exe','.bin','.lock','.map','.min.js'])
    const MAX_FILE_BYTES = 512 * 1024
    const MAX_RESULTS = 500
    let pattern
    try {
      const flags = caseSensitive ? 'g' : 'gi'
      const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      pattern = new RegExp(useRegex ? query : (wholeWord ? `\\b${esc}\\b` : esc), flags)
    } catch (e) {
      return { ok: false, error: `Invalid regex: ${e.message}` }
    }
    const results = []
    let totalMatches = 0
    async function walk(dir) {
      if (totalMatches >= MAX_RESULTS) return
      let entries
      try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
      for (const ent of entries) {
        if (totalMatches >= MAX_RESULTS) break
        if (ent.name.startsWith('.')) continue
        const fullPath = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          if (SKIP_DIRS_SEARCH.has(ent.name)) continue
          await walk(fullPath)
          continue
        }
        const ext = path.extname(ent.name).toLowerCase()
        if (SKIP_EXTS.has(ext)) continue
        let stat
        try { stat = await fs.stat(fullPath) } catch { continue }
        if (stat.size > MAX_FILE_BYTES) continue
        let content
        try { content = await fs.readFile(fullPath, 'utf8') } catch { continue }
        const lines = content.split('\n')
        const matches = []
        for (let i = 0; i < lines.length; i++) {
          if (totalMatches >= MAX_RESULTS) break
          pattern.lastIndex = 0
          const m = pattern.exec(lines[i])
          if (m) {
            matches.push({ line: i + 1, text: lines[i], colStart: m.index, colEnd: m.index + m[0].length })
            totalMatches++
          }
        }
        if (matches.length > 0) {
          results.push({
            path: fullPath,
            relPath: path.relative(root, fullPath),
            name: ent.name,
            matches,
          })
        }
      }
    }
    await walk(root)
    return { ok: true, results, capped: totalMatches >= MAX_RESULTS }
  })

  ipcMain.handle('fs:revealInExplorer', (_ev, filePath) => {
    try { shell.showItemInFolder(filePath); return { ok: true } }
    catch (e) { return { ok: false, error: e.message } }
  })

  ipcMain.handle('fs:saveAs', async (event, defaultName) => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    const result = await dialog.showSaveDialog(win, {
      title: 'Save As',
      defaultPath: defaultName || 'Untitled.txt',
      filters: [{ name: 'All Files', extensions: ['*'] }],
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('fs:openFileDialog', async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const result = await dialog.showOpenDialog(win, {
      title: 'Open File',
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] },
        { name: 'Code Files', extensions: ['js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'html', 'css', 'json', 'md'] },
      ],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // ── Generate project documentation ────────────────────────────────────
  ipcMain.handle('fs:generateProjectDocs', async (_ev, projectRoot) => {
    try {
      const tree = await generateTreeString(projectRoot, 3);
      const keyFiles = ['package.json', 'tsconfig.json', 'vite.config.ts', '.gitignore', 'README.md', 'idea.md'];
      let configSection = '';
      for (const name of keyFiles) {
        const p = path.join(projectRoot, name);
        if (fs.existsSync(p)) {
          configSection += `### ${name}\n\`\`\`\n${(await fs.readFile(p, 'utf8')).slice(0, 1500)}\n\`\`\`\n\n`;
        }
      }
      const allFiles = await getAllFiles(projectRoot);
      const md = `# ${path.basename(projectRoot)} – Project Documentation\n\n`
        + `*Auto‑generated by Cordex.*\n\n`
        + `## Directory Structure\n\`\`\`\n${tree}\`\`\`\n\n`
        + `## Key Configuration Files\n${configSection}\n`
        + `## Complete File List\n${allFiles.map(f => `- ${f}`).join('\n')}\n`;
      const outPath = path.join(projectRoot, 'PROJECT_DOCS.md');
      await fs.writeFile(outPath, md, 'utf8');
      return { ok: true, path: outPath };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
};
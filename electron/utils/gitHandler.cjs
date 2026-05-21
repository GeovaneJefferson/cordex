'use strict'
const { ipcMain } = require('electron')
const { exec }    = require('child_process')
const util        = require('util')

const execAsync = util.promisify(exec)

async function git(cmd, cwd) {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd, timeout: 10000 })
  return stdout.trim()
}

function parseStatusLine(line) {
  if (!line || line.length < 4) return null
  const xy   = line.slice(0, 2)
  const file = line.slice(3)
  const x    = xy[0] // index status
  const y    = xy[1] // worktree status

  const staged   = x !== ' ' && x !== '?'
  const unstaged = y !== ' ' && y !== '?'
  const untracked = x === '?' && y === '?'

  let statusLabel = 'M'
  if (untracked)     statusLabel = 'U'
  else if (x === 'A') statusLabel = 'A'
  else if (x === 'D' || y === 'D') statusLabel = 'D'
  else if (x === 'R') statusLabel = 'R'

  return { xy, x, y, path: file, staged, unstaged, untracked, statusLabel }
}

module.exports = function() {
  ipcMain.handle('git:status', async (_ev, { cwd }) => {
    try {
      const [statusOut, branchOut, aheadOut] = await Promise.all([
        git('status --porcelain -u', cwd),
        git('rev-parse --abbrev-ref HEAD', cwd).catch(() => 'main'),
        git('rev-list --count @{u}..HEAD', cwd).catch(() => '0'),
      ])

      const files = statusOut.split('\n').filter(Boolean)
        .map(parseStatusLine).filter(Boolean)

      return {
        ok: true, files,
        branch:    branchOut,
        ahead:     parseInt(aheadOut) || 0,
        hasRepo:   true,
      }
    } catch (err) {
      if (err.message?.includes('not a git repository')) return { ok: true, hasRepo: false, files: [], branch: '', ahead: 0 }
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('git:diff', async (_ev, { cwd, filePath, staged }) => {
    try {
      const flag = staged ? '--staged' : ''
      const out  = await git(`diff ${flag} -- "${filePath}"`, cwd).catch(() => '')
      return { ok: true, diff: out }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:stage', async (_ev, { cwd, filePath }) => {
    try {
      await git(`add -- "${filePath}"`, cwd)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:unstage', async (_ev, { cwd, filePath }) => {
    try {
      await git(`restore --staged -- "${filePath}"`, cwd)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:stage-all', async (_ev, { cwd }) => {
    try { await git('add -A', cwd); return { ok: true } }
    catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:discard', async (_ev, { cwd, filePath }) => {
    try {
      await git(`restore -- "${filePath}"`, cwd)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:commit', async (_ev, { cwd, message }) => {
    try {
      await git(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:push', async (_ev, { cwd }) => {
    try {
      const out = await git('push', cwd)
      return { ok: true, output: out }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:pull', async (_ev, { cwd }) => {
    try {
      const out = await git('pull', cwd)
      return { ok: true, output: out }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:log', async (_ev, { cwd, limit = 20 }) => {
    try {
      const out = await git(`log --oneline --graph -${limit}`, cwd)
      const commits = out.split('\n').filter(Boolean).map(line => {
        const m = line.match(/^([*|\\/ ]+)\s*([a-f0-9]+)\s+(.*)$/)
        return m ? { graph: m[1], hash: m[2], message: m[3] } : { graph: '', hash: '', message: line }
      })
      return { ok: true, commits }
    } catch (err) { return { ok: false, commits: [], error: err.message } }
  })

  ipcMain.handle('git:init', async (_ev, { cwd }) => {
    try { await git('init', cwd); return { ok: true } }
    catch (err) { return { ok: false, error: err.message } }
  })
}

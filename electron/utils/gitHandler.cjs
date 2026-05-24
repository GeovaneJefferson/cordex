'use strict'
const { ipcMain } = require('electron')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

async function git(cmd, cwd) {
  const { stdout } = await execAsync(`git ${cmd}`, { cwd, timeout: 10000 })
  return stdout.trim()
}

function parseStatusLine(line) {
  if (!line || line.length < 4) return null
  const xy   = line.slice(0, 2)
  const file = line.slice(3)
  const x    = xy[0]
  const y    = xy[1]
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
      // Remove --no-optional-locks (may not be supported on older Git)
      const [statusOut, branchOut] = await Promise.all([
        git('status --porcelain -u', cwd).catch(() => ''),
        git('rev-parse --abbrev-ref HEAD', cwd).catch(() => 'main'),
      ]);

      const files = statusOut.split('\n').filter(Boolean).map(parseStatusLine).filter(Boolean);
      return { ok: true, files, branch: branchOut, ahead: 0, hasRepo: true };
    } catch (err) {
      // If the command fails but a .git folder exists, it's probably an empty repo or permission issue
      const dotGit = path.join(cwd, '.git');
      if (fs.existsSync(dotGit)) {
        let branch = 'main';
        try { branch = await git('rev-parse --abbrev-ref HEAD', cwd); } catch {}
        return { ok: true, files: [], branch, ahead: 0, hasRepo: true };
      }

      if (err.message?.includes('not a git repository')) {
        return { ok: true, hasRepo: false, files: [], branch: '', ahead: 0 };
      }
      return { ok: false, error: err.message };
    }
  })

  ipcMain.handle('git:untrack', async (_ev, { cwd, filePath }) => {
    try {
      await git(`rm --cached -r "${filePath}"`, cwd);
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  })

  ipcMain.handle('git:diff', async (_ev, { cwd, filePath, staged }) => {
    try {
      const flag = staged ? '--staged' : ''
      const out = await git(`diff ${flag} -- "${filePath}"`, cwd).catch(() => '')
      return { ok: true, diff: out }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:stage', async (_ev, { cwd, filePath }) => {
    try { await git(`add -- "${filePath}"`, cwd); return { ok: true } }
    catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:unstage', async (_ev, { cwd, filePath }) => {
    try { await git(`restore --staged -- "${filePath}"`, cwd); return { ok: true } }
    catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:stage-all', async (_ev, { cwd }) => {
    try { await git('add -A', cwd); return { ok: true } }
    catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:discard', async (_ev, { cwd, filePath }) => {
    try { await git(`restore -- "${filePath}"`, cwd); return { ok: true } }
    catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:commit', async (_ev, { cwd, message }) => {
    try {
      await git(`commit -m "${message.replace(/"/g, '\\"')}"`, cwd)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:push', async (_ev, { cwd }) => {
    try { const out = await git('push', cwd); return { ok: true, output: out } }
    catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:pull', async (_ev, { cwd }) => {
    try { const out = await git('pull', cwd); return { ok: true, output: out } }
    catch (err) { return { ok: false, error: err.message } }
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
    try {
      // Use exec with a callback so we can be sure it returns
      await new Promise((resolve, reject) => {
        const child = require('child_process').exec('git init', { cwd, timeout: 5000 }, (err, stdout, stderr) => {
          if (err) return reject(err);
          resolve(stdout);
        });
      });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  })

  // ── Branch & merge ─────────────────────────────────────────────────────
  ipcMain.handle('git:branch-list', async (_ev, { cwd }) => {
    try {
      const out = await git('branch', cwd)
      const branches = out.split('\n').filter(Boolean).map(line => ({
        name: line.replace(/^\*?\s+/, ''),
        current: line.startsWith('*'),
      }))
      return { ok: true, branches }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:create-branch', async (_ev, { cwd, name }) => {
    try {
      await git(`checkout -b "${name}"`, cwd)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:checkout', async (_ev, { cwd, name }) => {
    try {
      await git(`checkout "${name}"`, cwd)
      return { ok: true }
    } catch (err) { return { ok: false, error: err.message } }
  })

  ipcMain.handle('git:merge', async (_ev, { cwd, branch }) => {
    try {
      const out = await git(`merge "${branch}"`, cwd)
      return { ok: true, output: out }
    } catch (err) {
      return { ok: false, error: err.message, conflict: true }
    }
  })
}
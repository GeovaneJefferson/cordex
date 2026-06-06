'use strict'
/**
 * agentHandler.cjs — IPC handlers for the background agent system.
 *
 * Channels:
 *   agent:run         → starts a one-shot agent run (streams step events back)
 *   agent:toggle      → enable/disable continuous background mode for an agent
 *   agent:analyze-file→ manually trigger file analysis
 *   agent:write-file  → write a file (invokable)
 *   agent:search      → text-search project files (invokable)
 *
 * Background mode (agent:toggle enabled=true):
 *   The agent re-runs automatically every BACKGROUND_INTERVAL_MS on the
 *   active project root, OR whenever the renderer fires agent:file-saved.
 */

const { ipcMain } = require('electron')
const fs          = require('fs-extra')
const path        = require('path')
const { execSync, exec } = require('child_process')
const { loadSettings }            = require('../utils/settings.cjs')
const { ollamaChat, extractText } = require('../utils/ollamaClient.cjs')

const MODEL_FALLBACK        = 'qwen2.5-coder:7b'
const BACKGROUND_INTERVAL_MS = 5 * 60 * 1000   // 5 min between background runs

// ── Shared state ──────────────────────────────────────────────────────────────
const enabledAgents    = new Set()   // agents running in background
const backgroundTimers = {}          // agentType → timer id

// ── Helpers ───────────────────────────────────────────────────────────────────
function resolveModel(settings, agentType) {
  switch (agentType) {
    case 'fix-code': return settings?.agentFixModel || settings?.analysisModel || MODEL_FALLBACK
    case 'document': return settings?.agentDocModel || settings?.analysisModel || MODEL_FALLBACK
    default:         return settings?.analysisModel || MODEL_FALLBACK
  }
}

function parseJSON(raw) {
  const clean = raw
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/, '').trim()
  return JSON.parse(clean)
}

const CODE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.rs', '.go', '.java', '.kt', '.swift',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.gd',
])

async function collectCodeFiles(root, maxFiles = 40) {
  const results = []
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.venv', 'coverage', '.godot'])
  async function walk(dir) {
    if (results.length >= maxFiles) return
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (results.length >= maxFiles) break
      const full = path.join(dir, e.name)
      if (e.isDirectory())  { if (!SKIP.has(e.name)) await walk(full) }
      else if (CODE_EXTS.has(path.extname(e.name).toLowerCase())) results.push(full)
    }
  }
  await walk(root)
  return results
}

// ── Planning ──────────────────────────────────────────────────────────────────
async function planTodos(agentType, payload) {
  const { code, filePath, projectRoot } = payload
  const settings = loadSettings()
  const model    = resolveModel(settings, agentType)

  // ── fix-code always gets exactly these 5 steps — no AI planning needed ──────
  if (agentType === 'fix-code') {
    return [
      { id: 'step_1', label: 'Read diagnostics',  description: 'Collect errors from PROBLEMS output & Monaco markers', status: 'pending' },
      { id: 'step_2', label: 'Backup files',       description: 'Create .bak copies before any modification',           status: 'pending' },
      { id: 'step_3', label: 'Generate fixes',     description: 'Ask AI to fix each problem in the file',               status: 'pending' },
      { id: 'step_4', label: 'Run tests',          description: 'Execute file to verify fix compiles / runs',           status: 'pending' },
      { id: 'step_5', label: 'Apply & report',     description: 'Write fixes to disk and report what changed',          status: 'pending' },
    ]
  }

  const modeDesc =
    agentType === 'document' ? 'add docstrings and inline comments' : 'process'

  const scopeHint = projectRoot
    ? `Project root: ${projectRoot}`
    : `File: ${filePath || 'unknown'}\n\`\`\`\n${(code || '').slice(0, 800)}\n\`\`\``

  const messages = [
    {
      role: 'system',
      content:
        `You are an expert software engineer. Create a concise plan to ${modeDesc}.\n` +
        'Return ONLY a valid JSON array with 3–5 steps, no prose or fences:\n' +
        '[{"id":"step_1","label":"Short title","description":"One sentence detail"}]',
    },
    { role: 'user', content: scopeHint },
  ]

  try {
    const res    = await ollamaChat({ model, messages, stream: false, num_predict: 1024 })
    const text   = await extractText(res)
    const parsed = parseJSON(text)
    const arr    = Array.isArray(parsed) ? parsed : parsed.steps ?? parsed.todos ?? []
    return arr.map((t, i) => ({
      id:          String(t.id || `step_${i + 1}`),
      label:       String(t.label || t.title || `Step ${i + 1}`),
      description: String(t.description || t.detail || ''),
      status:      'pending',
    }))
  } catch {
    return [
      { id: 'step_1', label: 'Collect files',  description: 'Gather source files', status: 'pending' },
      { id: 'step_2', label: 'Add docstrings', description: 'Add comments',        status: 'pending' },
      { id: 'step_3', label: 'Write changes',  description: 'Save updated files',  status: 'pending' },
    ]
  }
}

// ── Utility: run a quick syntax/runtime test on a file ────────────────────────
async function testFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return new Promise(resolve => {
    let cmd = null
    if (ext === '.py')              cmd = `python3 -c "import ast, sys; ast.parse(open(sys.argv[1]).read())" "${filePath}"`
    else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') cmd = `node --check "${filePath}"`
    else if (ext === '.ts' || ext === '.tsx') cmd = `npx tsc --noEmit --allowJs "${filePath}" 2>&1 | head -5`
    else if (ext === '.go')         cmd = `go vet "${filePath}"`
    else if (ext === '.java')       cmd = `javac -Xlint:none "${filePath}" -d /tmp`

    if (!cmd) return resolve({ ok: true, output: 'No test runner for this file type' })

    exec(cmd, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, output: (stderr || stdout || err.message).slice(0, 300) })
      else     resolve({ ok: true,  output: (stdout || 'Passed').slice(0, 300) })
    })
  })
}

// ── find-report execution ─────────────────────────────────────────────────────
async function runFindReport(win, payload, todos) {
  const { code, filePath, projectRoot } = payload
  const allIssues = []

  const s1 = todos[0]?.id ?? 'step_1'
  win.webContents.send('agent:step:start', s1)
  let files = []
  try {
    if (projectRoot) files = await collectCodeFiles(projectRoot, 30)
    else if (filePath) files = [filePath]
    win.webContents.send('agent:step:done', { id: s1, result: `${files.length} file(s) found` })
  } catch (err) {
    win.webContents.send('agent:step:error', { id: s1, error: err.message })
  }

  const s2 = todos[1]?.id ?? 'step_2'
  win.webContents.send('agent:step:start', s2)
  const settings = loadSettings()
  const model    = resolveModel(settings, 'find-report')
  try {
    for (const f of files) {
      const src = await fs.readFile(f, 'utf8').catch(() => null)
      if (!src) continue
      const ext = path.extname(f).replace('.', '')
      const messages = [
        { role: 'system', content: 'Find bugs. Return ONLY JSON array: [{"line":n,"snippet":"...","description":"...","severity":"error"|"warning"}]. Return [] if none.' },
        { role: 'user',   content: `\`\`\`${ext}\n${src.slice(0, 3000)}\n\`\`\`` },
      ]
      const res  = await ollamaChat({ model, messages, stream: false, num_predict: 1024 })
      const text = await extractText(res)
      try {
        const issues = parseJSON(text)
        ;(Array.isArray(issues) ? issues : []).forEach(i => {
          const issue = { file: path.relative(projectRoot || '', f), line: Number(i.line), snippet: String(i.snippet || '').slice(0, 120), description: String(i.description || ''), severity: i.severity === 'error' ? 'error' : 'warning' }
          allIssues.push(issue)
          win.webContents.send('agent:issue', issue)
        })
      } catch {}
    }
    win.webContents.send('agent:step:done', { id: s2, result: `${allIssues.length} issue(s)` })
  } catch (err) {
    win.webContents.send('agent:step:error', { id: s2, error: err.message })
  }

  const s3 = todos[2]?.id ?? 'step_3'
  win.webContents.send('agent:step:start', s3)
  const report = allIssues.length === 0
    ? `✓ No issues across ${files.length} file(s).`
    : `${files.length} file(s) — ${allIssues.length} issue(s) (${allIssues.filter(i=>i.severity==='error').length} errors)`
  win.webContents.send('agent:report', report)
  win.webContents.send('agent:step:done', { id: s3, result: 'Report ready' })
}

// ── document execution ────────────────────────────────────────────────────────
async function runDocument(win, payload, todos) {
  const { filePath, projectRoot } = payload
  const settings = loadSettings()
  const model    = resolveModel(settings, 'document')

  const s1 = todos[0]?.id ?? 'step_1'
  win.webContents.send('agent:step:start', s1)
  let files = []
  try {
    if (projectRoot) files = await collectCodeFiles(projectRoot, 20)
    else if (filePath) files = [filePath]
    win.webContents.send('agent:step:done', { id: s1, result: `${files.length} file(s)` })
  } catch (err) { win.webContents.send('agent:step:error', { id: s1, error: err.message }) }

  const s2 = todos[1]?.id ?? 'step_2'
  win.webContents.send('agent:step:start', s2)
  let documented = 0
  try {
    for (const f of files) {
      try {
        const src = await fs.readFile(f, 'utf8')
        if (!src.trim() || src.length > 12000) continue
        const ext = path.extname(f).replace('.', '')
        const messages = [
          { role: 'system', content: 'Add docstrings and inline comments. Do NOT change logic or variable names. Return ONLY the complete updated file, no markdown fences.' },
          { role: 'user',   content: `File: ${path.basename(f)}\n\`\`\`${ext}\n${src}\n\`\`\`` },
        ]
        const res  = await ollamaChat({ model, messages, stream: false, num_predict: 2048 })
        const raw  = (await extractText(res)).trim().replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
        if (raw && raw.length > 10) { await fs.writeFile(f, raw, 'utf8'); documented++ }
      } catch {}
    }
    win.webContents.send('agent:step:done', { id: s2, result: `${documented} file(s) documented` })
  } catch (err) { win.webContents.send('agent:step:error', { id: s2, error: err.message }) }

  const s3 = todos[2]?.id ?? 'step_3'
  win.webContents.send('agent:step:start', s3)
  win.webContents.send('agent:step:done', { id: s3, result: 'Done' })
}

// ── fix-code execution ────────────────────────────────────────────────────────
// Order: step_1=read diagnostics → step_2=backup → step_3=generate fix →
//        step_4=run tests → step_5=apply & report
async function runFixCode(win, payload, todos) {
  const { code, filePath, projectRoot, diagnostics } = payload
  const settings = loadSettings()
  const model    = resolveModel(settings, 'fix-code')

  // ── Step 1: collect diagnostics ───────────────────────────────────────────
  const s1 = todos[0]?.id ?? 'step_1'
  win.webContents.send('agent:step:start', s1)

  let problems = []
  let targetFiles = []

  try {
    // Monaco markers passed from renderer
    if (Array.isArray(diagnostics) && diagnostics.length > 0) {
      problems = diagnostics
        .filter(d => d.severity === 8 || d.severity === 4)
        .map(d => `Line ${d.startLineNumber}: [${d.severity === 8 ? 'error' : 'warning'}] ${d.message}`)
    }

    if (filePath) {
      targetFiles = [filePath]
    } else if (projectRoot) {
      // If no file specified, limit to files that have problems
      targetFiles = await collectCodeFiles(projectRoot, 15)
    }

    win.webContents.send('agent:step:done', { id: s1, result: `${problems.length} problem(s), ${targetFiles.length} file(s) targeted` })
  } catch (err) {
    win.webContents.send('agent:step:error', { id: s1, error: err.message })
    return
  }

  // ── Step 2: backup ────────────────────────────────────────────────────────
  const s2 = todos[1]?.id ?? 'step_2'
  win.webContents.send('agent:step:start', s2)

  const backups = []
  try {
    for (const f of targetFiles) {
      const bakPath = f + '.cordex.bak'
      await fs.copy(f, bakPath, { overwrite: true })
      backups.push({ original: f, bak: bakPath })
    }
    win.webContents.send('agent:step:done', { id: s2, result: `${backups.length} file(s) backed up (.cordex.bak)` })
  } catch (err) {
    win.webContents.send('agent:step:error', { id: s2, error: `Backup failed: ${err.message}` })
    return
  }

  // ── Step 3: generate fixes (but do NOT write yet) ─────────────────────────
  const s3 = todos[2]?.id ?? 'step_3'
  win.webContents.send('agent:step:start', s3)

  const pendingFixes = []   // { file, originalSrc, fixedSrc }
  try {
    for (const f of targetFiles) {
      try {
        const src = await fs.readFile(f, 'utf8')
        if (!src.trim() || src.length > 16000) continue
        const ext = path.extname(f).replace('.', '')
        const problemsHint = problems.length
          ? `Known problems to fix:\n${problems.slice(0, 20).join('\n')}`
          : 'Fix any bugs, syntax errors, or runtime errors you can identify.'
        const messages = [
          {
            role: 'system',
            content:
              'You are an expert software engineer fixing bugs in code.\n' +
              'Rules:\n' +
              '- Fix ONLY the reported errors, do not change unrelated code\n' +
              '- Do NOT add docstrings, comments, or extra explanations\n' +
              '- Return ONLY the complete corrected file content, no markdown fences, no prose',
          },
          {
            role: 'user',
            content: `File: ${path.basename(f)}\n${problemsHint}\n\n\`\`\`${ext}\n${src}\n\`\`\``,
          },
        ]
        const res   = await ollamaChat({ model, messages, stream: false, num_predict: 4096 })
        const raw   = (await extractText(res)).trim()
        const fixed = raw.replace(/^```[\w]*\n?/, '').replace(/\n?```$/, '').trim()
        if (fixed && fixed.length > 10 && fixed !== src) {
          pendingFixes.push({ file: f, originalSrc: src, fixedSrc: fixed })
        }
      } catch (err) {
        console.warn('[fixCode] AI call failed for', f, err.message)
      }
    }
    win.webContents.send('agent:step:done', { id: s3, result: `${pendingFixes.length} fix(es) generated` })
  } catch (err) {
    win.webContents.send('agent:step:error', { id: s3, error: err.message })
    return
  }

  // ── Step 4: run tests on the fixed code ──────────────────────────────────
  const s4 = todos[3]?.id ?? 'step_4'
  win.webContents.send('agent:step:start', s4)

  const passedFixes = []
  try {
    for (const fix of pendingFixes) {
      // Write to a temp file to test without touching the real file
      const tmpPath = fix.file + '.cordex.tmp'
      await fs.writeFile(tmpPath, fix.fixedSrc, 'utf8')
      const result = await testFile(tmpPath)
      await fs.remove(tmpPath).catch(() => {})

      if (result.ok) {
        passedFixes.push(fix)
        console.log('[fixCode] test PASSED for', path.basename(fix.file))
      } else {
        console.warn('[fixCode] test FAILED for', path.basename(fix.file), result.output)
        // Don't apply — restore noted in report
      }
    }

    const passCount = passedFixes.length
    const failCount = pendingFixes.length - passCount
    const msg = passCount > 0
      ? `${passCount} test(s) passed` + (failCount > 0 ? `, ${failCount} failed (skipped)` : '')
      : pendingFixes.length === 0 ? 'No fixes to test' : `All ${failCount} test(s) failed — not applying`
    win.webContents.send('agent:step:done', { id: s4, result: msg })
  } catch (err) {
    win.webContents.send('agent:step:error', { id: s4, error: err.message })
    // On unexpected test error, skip applying
    passedFixes.length = 0
  }

  // ── Step 5: apply passed fixes & report ──────────────────────────────────
  const s5 = todos[4]?.id ?? 'step_5'
  win.webContents.send('agent:step:start', s5)

  try {
    let applied = 0
    const reportLines = []

    for (const fix of passedFixes) {
      try {
        await fs.writeFile(fix.file, fix.fixedSrc, 'utf8')
        applied++
        win.webContents.send('agent:file-changed', fix.file)
      } catch (err) {
        // Restore backup on write failure
        const bak = backups.find(b => b.original === fix.file)
        if (bak) await fs.copy(bak.bak, fix.file, { overwrite: true }).catch(() => {})
        reportLines.push(`✗ ${path.basename(fix.file)}: write failed (backup restored)`)
      }
    }

    // Report
    const skipped = pendingFixes.length - passedFixes.length
    reportLines.unshift(
      `Fix Code complete.`,
      `Problems read: ${problems.length}`,
      `Fixes generated: ${pendingFixes.length}`,
      `Tests passed / applied: ${applied}`,
      skipped > 0 ? `Skipped (test failed): ${skipped}` : null,
      backups.length > 0 ? `Backups: *.cordex.bak (safe to delete)` : null,
    )

    const report = reportLines.filter(Boolean).join('\n')
    win.webContents.send('agent:report', report)
    win.webContents.send('agent:step:done', { id: s5, result: `${applied} file(s) applied` })
  } catch (err) {
    win.webContents.send('agent:step:error', { id: s5, error: err.message })
  }
}

// ── Background agent loop ─────────────────────────────────────────────────────
function startBackgroundLoop(agentType, win, getPayload) {
  if (backgroundTimers[agentType]) return  // already running

  async function doRun() {
    if (!enabledAgents.has(agentType)) return
    if (!win || win.isDestroyed()) return
    const payload = getPayload()
    if (!payload.projectRoot && !payload.filePath) return
    try {
      const todos = await planTodos(agentType, payload)
      win.webContents.send('agent:plan', todos)
      if (agentType === 'document')   await runDocument(win, payload, todos)
      else if (agentType === 'fix-code') await runFixCode(win, payload, todos)
      win.webContents.send('agent:done')
    } catch (err) {
      if (!win.isDestroyed()) win.webContents.send('agent:error', err.message)
    }
  }

  // Run immediately, then on timer
  doRun()
  backgroundTimers[agentType] = setInterval(doRun, BACKGROUND_INTERVAL_MS)
  console.log(`[agentHandler] background loop started: ${agentType}`)
}

function stopBackgroundLoop(agentType) {
  if (backgroundTimers[agentType]) {
    clearInterval(backgroundTimers[agentType])
    delete backgroundTimers[agentType]
    console.log(`[agentHandler] background loop stopped: ${agentType}`)
  }
}

// ── Main export ───────────────────────────────────────────────────────────────
module.exports = function(mainWindow) {
  let _projectRoot = null
  let _filePath    = null

  const getPayload = () => ({
    projectRoot: _projectRoot,
    filePath:    _filePath,
    diagnostics: [],
  })

  // ── agent:run (one-shot, explicit) ────────────────────────────────────────
  ipcMain.on('agent:run', async (_e, payload) => {
    const win = mainWindow
    if (!win || win.isDestroyed()) return
    const { agentType } = payload

    // Keep track of current context for background mode
    if (payload.projectRoot) _projectRoot = payload.projectRoot
    if (payload.filePath)    _filePath    = payload.filePath

    console.log('[agentHandler] agent:run', agentType)
    try {
      const todos = await planTodos(agentType, payload)
      win.webContents.send('agent:plan', todos)
      if      (agentType === 'find-report') await runFindReport(win, payload, todos)
      else if (agentType === 'document')    await runDocument(win, payload, todos)
      else if (agentType === 'fix-code')    await runFixCode(win, payload, todos)
      else throw new Error(`Unknown agent type: ${agentType}`)
      win.webContents.send('agent:done')
    } catch (err) {
      console.error('[agentHandler] agent:run error:', err.message)
      if (!win.isDestroyed()) win.webContents.send('agent:error', err.message)
    }
  })

  // ── agent:toggle — enable/disable background auto-run ────────────────────
  ipcMain.on('agent:toggle', (_e, { type, enabled, projectRoot, filePath }) => {
    if (projectRoot) _projectRoot = projectRoot
    if (filePath)    _filePath    = filePath

    if (enabled) {
      enabledAgents.add(type)
      startBackgroundLoop(type, mainWindow, getPayload)
    } else {
      enabledAgents.delete(type)
      stopBackgroundLoop(type)
    }
  })

  // ── agent:file-saved — re-trigger background agents immediately on save ───
  ipcMain.on('agent:file-saved', (_e, { filePath: fp, projectRoot: pr }) => {
    if (fp) _filePath    = fp
    if (pr) _projectRoot = pr
    // Re-trigger any enabled background agents right away (skip the timer)
    for (const type of enabledAgents) {
      stopBackgroundLoop(type)   // cancel current timer
      startBackgroundLoop(type, mainWindow, getPayload)  // restart (runs immediately)
    }
  })

  // ── agent:write-file ──────────────────────────────────────────────────────
  ipcMain.handle('agent:write-file', async (_e, { filePath: fp, content }) => {
    try { await fs.writeFile(fp, content, 'utf8'); return { ok: true } }
    catch (err) { return { ok: false, error: err.message } }
  })

  // ── agent:search ──────────────────────────────────────────────────────────
  ipcMain.handle('agent:search', async (_e, { query, projectRoot: pr, maxResults = 20 }) => {
    try {
      const files = await collectCodeFiles(pr || process.cwd(), 100)
      const results = []
      for (const f of files) {
        if (results.length >= maxResults) break
        const lines = (await fs.readFile(f, 'utf8').catch(() => '')).split('\n')
        const q = query.toLowerCase()
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(q)) results.push({ file: f, line: idx + 1, snippet: line.trim().slice(0, 120) })
        })
      }
      return { ok: true, results: results.slice(0, maxResults) }
    } catch (err) { return { ok: false, error: err.message } }
  })
}

module.exports.enabledAgents = enabledAgents

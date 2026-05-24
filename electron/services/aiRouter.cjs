'use strict'
/**
 * aiRouter.cjs — Cordex AI routing layer + IPC endpoints.
 *
 * Routing logic (deterministic):
 *   autocomplete request  → qwen2.5-coder:1.5b-base  (no retrieval)
 *   bug-fix / refactor    → qwen2.5-coder:7b          (+ retrieval)
 *   explain / generate    → qwen2.5-coder:7b          (+ retrieval)
 *   architecture Q&A      → qwen2.5-coder:7b          (+ retrieval)
 *
 * IPC channels exposed:
 *   ai:autocomplete       → fast inline completion (no streaming needed)
 *   ai:reason             → full coding agent, streaming via ai:reason:chunk
 *   ai:embed-project      → trigger embedding index build
 *   ai:embed-update-file  → incremental update after save
 *   ai:retrieval-status   → current index stats
 *   ai:retrieval-search   → raw semantic search (for debugging)
 */

const { ipcMain } = require('electron')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate, extractText, streamText } = require('../utils/ollamaClient.cjs')
const { autocompletePrompt, bugFixPrompt, refactorPrompt, explainPrompt, generatePrompt, architecturePrompt } = require('./promptTemplates.cjs')
const { buildContext }  = require('./retrieval.cjs')
const embeddingIndex    = require('./embeddingIndex.cjs')

const OLLAMA_BASE = 'http://127.0.0.1:11434'

// ── Models ─────────────────────────────────────────────────────────────
const MODEL_FAST   = 'qwen2.5-coder:1.5b-base'  // autocomplete
const MODEL_AGENT  = 'qwen2.5-coder:7b'          // reasoning

function resolveModel(modelName, settings, fallback) {
  return modelName || settings?.autocompleteModel || fallback
}

// ── Abort controllers ─────────────────────────────────────────────────
const controllers = new Map()
function abort(key) {
  const c = controllers.get(key); if (c) { c.abort(); controllers.delete(key) }
}
function newCtrl(key) {
  abort(key); const c = new AbortController(); controllers.set(key, c); return c
}

// ── Autocomplete (FIM, fast, no retrieval) ────────────────────────────
async function handleAutocomplete(ev, { before, after, language, model }) {
  const ctrl  = newCtrl('autocomplete')
  const settings = loadSettings()

  // Decide which model to use — prefer the explicit param, then settings, then default
  const useModel = model || settings.autocompleteModel || MODEL_FAST

  const prompt   = autocompletePrompt({ before, after, language })

  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: useModel,
        prompt,
        stream: false,
        raw: true,           // raw mode for base model FIM
        options: {
          temperature: 0,
          num_predict: 128,  // short completions only
          stop: ['\n\n', '```', '<|fim_', '// ', '# ', '/* '],
        },
      }),
    })

    if (!res.ok) return { ok: false, text: '' }
    const data = await res.json()
    let text = (data.response ?? '').trimEnd()

    // Strip leading newline if before ends with a newline
    if (before.endsWith('\n') && text.startsWith('\n')) text = text.slice(1)

    controllers.delete('autocomplete')
    return { ok: true, text }
  } catch (err) {
    if (err.name === 'AbortError') return { ok: false, aborted: true, text: '' }
    return { ok: false, error: err.message, text: '' }
  }
}

// ── Reasoning agent (streaming, with retrieval) ───────────────────────
async function handleReason(ev, mainWindow, {
  mode,          // 'bugfix' | 'refactor' | 'explain' | 'generate' | 'architecture' | 'chat'
  code,
  instruction,
  errorMessage,
  filePath,
  language,
  fileContent,
  fileTree,
  projectRoot,
  model,
  skipRetrieval = false,
}) {
  const ctrl     = newCtrl('reason')
  const settings = loadSettings()
  const useModel = model || settings.analysisModel || MODEL_AGENT

  // ── Build retrieval context ─────────────────────────────────────────
  let context = ''
  if (!skipRetrieval && projectRoot) {
    const query = instruction || errorMessage || code?.slice(0, 200) || ''
    if (query.trim()) {
      try { context = await buildContext(query, projectRoot) } catch {}
    }
  }

  // ── Build prompt ────────────────────────────────────────────────────
  let prompt = ''
  let systemPrompt = 'You are an expert software engineer. Use markdown in your responses.'
  let expectJson = false

  switch (mode) {
    case 'bugfix':
      prompt = bugFixPrompt({ code, errorMessage, filePath, context })
      expectJson = true
      systemPrompt = 'You are an expert debugger. Return only valid JSON as instructed.'
      break
    case 'refactor':
      prompt = refactorPrompt({ code, instruction, language, context })
      expectJson = true
      systemPrompt = 'You are an expert code refactorer. Return only valid JSON as instructed.'
      break
    case 'explain':
      prompt = explainPrompt({ code, language, context })
      break
    case 'generate':
      prompt = generatePrompt({ instruction, language, context, fileContent })
      break
    case 'architecture':
      prompt = architecturePrompt({ question: instruction, fileTree, context })
      break
    default: // 'chat' or unknown
      prompt = instruction || code || ''
      break
  }

  try {
    const res = await llamaGenerate({
      model: useModel,
      prompt,
      systemPrompt,
      stream: true,
      signal: ctrl.signal,
      temperature: expectJson ? 0.05 : 0.2,
      num_predict: expectJson ? 2048 : 4096,
    })

    let full = ''
    for await (const chunk of streamText(res)) {
      if (ctrl.signal.aborted) break
      full += chunk
      mainWindow?.webContents?.send('ai:reason:chunk', chunk)
    }

    controllers.delete('reason')

    // ── JSON parse for structured outputs ──────────────────────────
    if (expectJson) {
      try {
        const clean = full.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
        const parsed = JSON.parse(clean)
        mainWindow?.webContents?.send('ai:reason:done', { ok: true, json: parsed, raw: full })
        return { ok: true, json: parsed, raw: full }
      } catch {
        mainWindow?.webContents?.send('ai:reason:done', { ok: true, json: null, raw: full })
        return { ok: true, json: null, raw: full }
      }
    }

    mainWindow?.webContents?.send('ai:reason:done', { ok: true, raw: full })
    return { ok: true, raw: full }
  } catch (err) {
    const aborted = err.name === 'AbortError'
    mainWindow?.webContents?.send('ai:reason:done', { ok: false, aborted, error: err.message })
    return { ok: false, aborted, error: err.message }
  }
}

// ── Module export ─────────────────────────────────────────────────────
module.exports = function (mainWindow) {
  // ── ai:autocomplete ───────────────────────────────────────────────
  ipcMain.handle('ai:autocomplete', (ev, payload) => handleAutocomplete(ev, payload))

  // ── ai:reason ─────────────────────────────────────────────────────
  // Streams via ai:reason:chunk, resolves with ai:reason:done
  ipcMain.handle('ai:reason', (ev, payload) => handleReason(ev, mainWindow, payload))

  // ── ai:reason:abort ───────────────────────────────────────────────
  ipcMain.on('ai:reason:abort', () => abort('reason'))
  ipcMain.on('ai:autocomplete:abort', () => abort('autocomplete'))

  // ── ai:embed-project ──────────────────────────────────────────────
  ipcMain.handle('ai:embed-project', async (_ev, { projectRoot }) => {
    // Forward progress events to renderer
    const onProgress = (data) => mainWindow?.webContents?.send('ai:embed:progress', data)
    const onDone     = (data) => mainWindow?.webContents?.send('ai:embed:done', data)
    const onError    = (msg)  => mainWindow?.webContents?.send('ai:embed:error', { error: msg })

    embeddingIndex.on('progress', onProgress)
    embeddingIndex.on('done', onDone)
    embeddingIndex.on('error', onError)

    const result = await embeddingIndex.indexProject(projectRoot)

    embeddingIndex.off('progress', onProgress)
    embeddingIndex.off('done', onDone)
    embeddingIndex.off('error', onError)

    return result
  })

  // ── ai:embed-update-file ──────────────────────────────────────────
  // Called after every file save to keep index fresh incrementally
  ipcMain.handle('ai:embed-update-file', async (_ev, { filePath, content }) => {
    try {
      await embeddingIndex.updateFile(filePath, content)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ── ai:embed-abort ────────────────────────────────────────────────
  ipcMain.on('ai:embed-abort', () => embeddingIndex.abortIndexing())

  // ── ai:retrieval-status ───────────────────────────────────────────
  ipcMain.handle('ai:retrieval-status', async () => {
    const s = await embeddingIndex.status()
    return { ok: true, ...s }
  })

  // ── ai:retrieval-search (debug / Chat use) ────────────────────────
  ipcMain.handle('ai:retrieval-search', async (_ev, { query, topK }) => {
    try {
      const hits = await embeddingIndex.search(query, topK ?? 10)
      return { ok: true, hits }
    } catch (err) {
      return { ok: false, error: err.message, hits: [] }
    }
  })

  console.log('[aiRouter] ✓ registered')
}

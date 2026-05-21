'use strict'
const { ipcMain } = require('electron')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate, extractText, streamText } = require('../utils/llamaCpp.cjs')

const abortControllers = new Map()

function cancelRequest(key) {
  const ctrl = abortControllers.get(key)
  if (ctrl) { ctrl.abort(); abortControllers.delete(key) }
}

module.exports = function(mainWindow) {
  // ── Autocomplete ────────────────────────────────────────────────────────────
  ipcMain.handle('ai:complete', async (_ev, { prompt, model, temperature }) => {
    const settings = loadSettings()
    const useModel = model || settings.autocompleteModel

    cancelRequest('autocomplete')
    const ctrl = new AbortController()
    abortControllers.set('autocomplete', ctrl)

    try {
      const res = await llamaGenerate({ model: useModel, prompt, stream: false, signal: ctrl.signal, temperature })
      const text = await extractText(res)
      abortControllers.delete('autocomplete')
      return { ok: true, text }
    } catch (err) {
      if (err.name === 'AbortError') return { ok: false, aborted: true }
      return { ok: false, error: err.message }
    }
  })

  // ── Code Analysis (streaming) ───────────────────────────────────────────────
  ipcMain.handle('ai:analyze', async (ev, { code, model }) => {
    const settings = loadSettings()
    const useModel = model || settings.analysisModel

    cancelRequest('analyze')
    const ctrl = new AbortController()
    abortControllers.set('analyze', ctrl)

    const prompt = `Analyze this code. Identify: architecture patterns, potential bugs, improvement suggestions.\nBe concise. Use markdown.\n\n\`\`\`\n${code}\n\`\`\``

    try {
      const res = await llamaGenerate({
        model: useModel,
        systemPrompt: 'You are an expert code reviewer. Be concise and use markdown.',
        prompt,
        stream: true,
        signal: ctrl.signal,
      })

      let full = ''
      for await (const chunk of streamText(res)) {
        full += chunk
        ev.sender.send('ai:analyze:chunk', chunk)
      }

      abortControllers.delete('analyze')
      return { ok: true, text: full }
    } catch (err) {
      if (err.name === 'AbortError') return { ok: false, aborted: true }
      return { ok: false, error: err.message }
    }
  })

  ipcMain.on('ai:abort', (_ev, key) => cancelRequest(key))

  // ── Ping llama-server ───────────────────────────────────────────────────────
  ipcMain.handle('ai:ping', async () => {
    try {
      const res = await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(2000) })
      if (res.ok) {
        const modelRes = await fetch('http://127.0.0.1:8080/v1/models', { signal: AbortSignal.timeout(2000) }).catch(() => null)
        const modelData = modelRes ? await modelRes.json().catch(() => ({})) : {}
        const models = (modelData.data ?? []).map(m => m.id)
        return { ok: true, models }
      }
      return { ok: false, models: [] }
    } catch { return { ok: false, models: [] } }
  })

  // ── Docstring generation ────────────────────────────────────────────────────
  ipcMain.handle('ai:docstring', async (_ev, { code, model }) => {
    const settings = loadSettings()
    const useModel = model || settings.analysisModel
    const prompt = `Write a Python docstring (triple-quoted) for the following function/class. Include only the docstring, properly indented to match the code. No additional commentary.\n\nCode:\n${code}`
    try {
      const res = await llamaGenerate({
        model: useModel,
        systemPrompt: 'You are a documentation writer. Output only the docstring, nothing else.',
        prompt,
        stream: false,
        temperature: 0,
        num_predict: 256,
      })
      const response = (await extractText(res)).trim()
      const match = response.match(/"""([\s\S]*?)"""|'''([\s\S]*?)'''/)
      return { ok: true, docstring: match ? match[0] : response }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ── Fix error ───────────────────────────────────────────────────────────────
  ipcMain.handle('ai:fix-error', async (_ev, { errorMessage, filePath, line, column, codeSnippet }) => {
    const settings = loadSettings()
    const model = settings.analysisModel
    const prompt = `The following error occurred in file "${filePath}" at line ${line} (column ${column || 1}):

Error:
${errorMessage}

Code around the error:
\`\`\`
${codeSnippet}
\`\`\`

Explain the error in one short sentence, then provide the corrected version of the code block above.
Return ONLY valid JSON: {"explanation": "...", "fixedCode": "..."}. Do not include any other text.`

    try {
      const res = await llamaGenerate({
        model,
        systemPrompt: 'You are an expert developer. Return only valid JSON, no markdown, no explanation outside the JSON.',
        prompt,
        stream: false,
        temperature: 0.1,
        num_predict: 1024,
      })
      const response = (await extractText(res)).trim()
      const jsonMatch = response.match(/\{[\s\S]*"explanation"[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      const fix = JSON.parse(jsonMatch[0])
      return { ok: true, ...fix }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

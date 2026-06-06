'use strict'
/**
 * aiHandler.cjs — IPC handlers for BugFix and PlanTodos.
 *
 * Channels:
 *   ai:bug-fix-code  →  { explanation, fixedCode }
 *   ai:plan-todos    →  [{ id, label, description, status: 'pending' }]
 */

const { ipcMain }                        = require('electron')
const fs                                 = require('fs-extra')   
const { loadSettings }                   = require('../utils/settings.cjs')
const { llamaGenerate, extractText }     = require('../utils/ollamaClient.cjs')
const { bugFixPrompt, refactorPrompt }   = require('../services/promptTemplates.cjs')
const { buildContext }                   = require('../services/retrieval.cjs')

const MODEL_FALLBACK = 'qwen2.5-coder:7b'

function resolveModel(settings) {
  return settings?.analysisModel || MODEL_FALLBACK
}

/** Strip markdown fences and parse JSON */
function parseJSON(raw) {
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i,     '')
    .replace(/```\s*$/,      '')
    .trim()
  return JSON.parse(clean)
}

module.exports = function (_mainWindow) {

  // ── ai:bug-fix-code ──────────────────────────────────────────────────
  // Called by BugFixModal handleExecute via aiService.bugFixCode / improveCode
  // Payload : { code, filePath, isSelection?, mode: 'bugfix'|'improve' }
  // Returns : { explanation, fixedCode }
  ipcMain.handle('ai:bug-fix-code', async (_ev, { code, filePath, mode = 'bugfix' }) => {
    const settings = loadSettings()
    const model    = resolveModel(settings)

    let context = ''
    try {
      context = await buildContext(code.slice(0, 400), settings.projectRoot)
    } catch { /* retrieval optional */ }

    const prompt = mode === 'improve'
      ? refactorPrompt({ code, language: filePath?.split('.').pop() ?? '', context })
      : bugFixPrompt({ code, filePath, context })

    const res  = await llamaGenerate({ model, prompt, stream: false, num_predict: 2048 })
    const text = await extractText(res)

    try {
      const parsed = parseJSON(text)
      return {
        explanation: parsed.explanation   ?? '',
        fixedCode:   parsed.fixedCode     ?? parsed.refactoredCode ?? code,
      }
    } catch {
      // LLM didn't return valid JSON — surface raw text as fixedCode
      const trimmed = text.trim()
      return {
        explanation: '',
        fixedCode:   trimmed.length > 10 ? trimmed : code,
      }
    }
  })

  // ── ai:plan-todos ─────────────────────────────────────────────────────
  // Called by BugFixModal (planning phase) via aiService.planTodos
  // Payload : { code, filePath, mode: 'bugfix'|'improve'|'document' }
  // Returns : [{ id, label, description, status: 'pending' }]
  ipcMain.handle('ai:plan-todos', async (_ev, { code, filePath, mode = 'bugfix' }) => {
    const settings = loadSettings()
    const model    = resolveModel(settings)

    const modeLabel =
      mode === 'improve'  ? 'refactor and improve' :
      mode === 'document' ? 'document'              :
      'find and fix all bugs in'

    const prompt =
`You are an expert software engineer. Analyze the code below and create a concise step-by-step plan to ${modeLabel} it.
File: ${filePath || 'unknown'}

## Code
\`\`\`
${code.slice(0, 3000)}
\`\`\`

Return ONLY a valid JSON array with 3–6 steps and no prose or markdown fences:
[
  { "id": "step_1", "label": "Short action title", "description": "One-sentence detail" }
]`

    const res  = await llamaGenerate({ model, prompt, stream: false, num_predict: 1024 })
    const text = await extractText(res)

    try {
      const parsed = parseJSON(text)
      const arr    = Array.isArray(parsed) ? parsed
                   : parsed.steps ?? parsed.todos ?? parsed.plan ?? []
      return arr.map((t, i) => ({
        id:          String(t.id    || `step_${i + 1}`),
        label:       String(t.label || t.title || t.action || `Step ${i + 1}`),
        description: String(t.description || t.detail || ''),
        status:      'pending',
      }))
    } catch {
      // Fallback: generic 2-step plan so the UI doesn't hang empty
      return [
        { id: 'step_1', label: 'Analyze code',  description: 'Read and understand the current state', status: 'pending' },
        { id: 'step_2', label: 'Apply fixes',   description: 'Fix identified issues in the file',     status: 'pending' },
      ]
    }
  })

  // ── Fix a single issue ──────────────────────────────────────────────────
  ipcMain.handle('agent:fix-issue', async (_event, { filePath, line, snippet, description }) => {
    console.log('[aiHandler] fix-issue:', filePath, line)

    try {
      const content = await fs.readFile(filePath, 'utf8')
      const lines = content.split('\n')
      const isPython = filePath.endsWith('.py')

      // For Python, we send the whole file to preserve indentation context.
      // For other languages, we use ±5 lines as before.
      const contextBlock = isPython
        ? content
        : lines.slice(
            Math.max(0, line - 6),
            Math.min(lines.length, line + 5)
          ).map((l, i) => `${Math.max(0, line - 6) + i + 1}: ${l}`).join('\n')

      const prompt = isPython
        ? `The following Python code has an issue at line ${line}:

  \`\`\`python
  ${content}
  \`\`\`

  Issue: ${description || snippet}
  Snippet (near the problem): ${snippet}

  Python relies on exact indentation (4 spaces per level). Return the ENTIRE corrected file in a JSON object:
  {"fixedLines": {"<lineNumber>": "<exact corrected line including indentation>"}}
  Only include lines that actually change. Do NOT add any extra text.`
        : `The following code has an issue at line ${line}:
  \`\`\`
  ${contextBlock}
  \`\`\`
  Issue: ${description || snippet}
  Snippet: ${snippet}

  Return ONLY a JSON object with the corrected lines:
  {"fixedLines": {"<lineNumber>": "<corrected line>"}}`

      const settings = loadSettings()
      const model = settings.analysisModel || 'qwen2.5-coder:7b'

      const generateFix = async (retryPrompt = null) => {
        const finalPrompt = retryPrompt || prompt
        const res = await llamaGenerate({
          model,
          prompt: finalPrompt,
          temperature: 0,
          num_predict: isPython ? 1024 : 256,
          stream: false,
        })
        const text = await extractText(res)
        console.log('[aiHandler] fix response:', text)

        const jsonStart = text.indexOf('{')
        const jsonEnd   = text.lastIndexOf('}')
        if (jsonStart === -1 || jsonEnd === -1) throw new Error('No JSON in response')
        const json = JSON.parse(text.slice(jsonStart, jsonEnd + 1))

        const fixedLines = json.fixedLines || {}
        return fixedLines
      }

      const applyFixes = (fixes) => {
        const newLines = [...lines]
        for (const [ln, newLine] of Object.entries(fixes)) {
          const idx = parseInt(ln) - 1
          if (idx >= 0 && idx < newLines.length) {
            newLines[idx] = newLine
          }
        }
        return newLines.join('\n')
      }

      // First attempt
      let fixes = await generateFix()
      let newContent = applyFixes(fixes)

      // For Python, validate syntax
      if (isPython) {
        const tmpFile = filePath + '.tmpfix'
        await fs.writeFile(tmpFile, newContent, 'utf8')
        try {
          const { execSync } = require('child_process')
          execSync(`python3 -m py_compile "${tmpFile}"`, { stdio: 'pipe' })
          await fs.unlink(tmpFile)  // syntax OK, proceed
        } catch (syntaxErr) {
          console.warn('[aiHandler] Python syntax error after first fix, retrying...', syntaxErr.stderr?.toString())
          // Retry once with the error feedback
          const errMsg = syntaxErr.stderr?.toString() || syntaxErr.message
          const retryPrompt = `The previous fix introduced a Python syntax error:
  ${errMsg}

  Original file:
  \`\`\`python
  ${content}
  \`\`\`

  Please correct the file again and return the fixed lines in the same JSON format.`
          fixes = await generateFix(retryPrompt)
          newContent = applyFixes(fixes)
          // Clean up tmp file from first attempt
          try { await fs.unlink(tmpFile) } catch {}
        }
      }

      // Write the final version
      await fs.writeFile(filePath, newContent, 'utf8')
      return { ok: true, newContent }

    } catch (err) {
      console.error('[aiHandler] fix-issue error:', err.message)
      return { ok: false, error: err.message }
    }
  })

}

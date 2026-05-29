'use strict'
const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate, extractText, streamText } = require('../utils/ollamaClient.cjs')

const OLLAMA_BASE = 'http://127.0.0.1:11434'
const abortControllers = new Map()

function cancelRequest(key) {
  const ctrl = abortControllers.get(key)
  if (ctrl) { ctrl.abort(); abortControllers.delete(key) }
}

module.exports = function (mainWindow) {
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

  ipcMain.handle('ai:analyze', async (ev, { code, model }) => {
    const settings = loadSettings()
    const useModel = model || settings.analysisModel
    cancelRequest('analyze')
    const ctrl = new AbortController()
    abortControllers.set('analyze', ctrl)
    const prompt = `Analyze this code. Identify: architecture patterns, potential bugs, improvement suggestions.\nBe concise. Use markdown.\n\n\`\`\`\n${code}\n\`\`\``
    try {
      const res = await llamaGenerate({ model: useModel, systemPrompt: 'You are an expert code reviewer. Be concise and use markdown.', prompt, stream: true, signal: ctrl.signal })
      let full = ''
      for await (const chunk of streamText(res)) { full += chunk; ev.sender.send('ai:analyze:chunk', chunk) }
      abortControllers.delete('analyze')
      return { ok: true, text: full }
    } catch (err) {
      if (err.name === 'AbortError') return { ok: false, aborted: true }
      return { ok: false, error: err.message }
    }
  })

  ipcMain.on('ai:abort', (_ev, key) => cancelRequest(key))

  ipcMain.handle('ai:ping', async () => {
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
      if (res.ok) { const data = await res.json().catch(() => ({})); return { ok: true, models: (data.models ?? []).map(m => m.name) } }
      return { ok: false, models: [] }
    } catch { return { ok: false, models: [] } }
  })

  // ipcMain.handle('ai:docstring', async (_ev, { code, model }) => {
  //   const settings = loadSettings()
  //   const useModel = model || settings.analysisModel
  //   const prompt = `Write a docstring (triple-quoted) for the following code. Include only the docstring, properly indented. No additional commentary.\n\nCode:\n${code}`
  //   try {
  //     const res = await llamaGenerate({ model: useModel, systemPrompt: 'You are a documentation writer. Output only the docstring.', prompt, stream: false, temperature: 0, num_predict: 256 })
  //     const response = (await extractText(res)).trim()
  //     const match = response.match(/"""([\s\S]*?)"""|'''([\s\S]*?)'''/)
  //     return { ok: true, docstring: match ? match[0] : response }
  //   } catch (err) { return { ok: false, error: err.message } }
  // })

  ipcMain.handle('ai:markdown-docs', async (_ev, { code, model }) => {
    const settings = loadSettings()
    const useModel = model || settings.analysisModel

    const prompt = [
      'Write comprehensive Markdown documentation for the following code.',
      'Include a clear description, parameters, return value, and a usage example.',
      'Use proper Markdown syntax (headings, lists, inline code, code blocks with language).',
      'Output **only** the raw Markdown — no introductory text, no commentary, no wrapping fences.',
      '',
      'Code:',
      code
    ].join('\n')

    try {
      const res = await llamaGenerate({
        model: useModel,
        systemPrompt: 'You are a technical writer. Output raw Markdown documentation only. No extra words.',
        prompt,
        stream: false,
        temperature: 0,
        num_predict: 8192   // adjust as needed
      })

      const markdown = (await extractText(res)).trim()
      return { ok: true, documentation: markdown }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('ai:fix-error', async (_ev, { errorMessage, filePath, line, column, codeSnippet }) => {
    const settings = loadSettings()
    const model = settings.analysisModel
    const prompt = `Error in file "${filePath}" at line ${line} (column ${column || 1}):\n${errorMessage}\n\nCode:\n\`\`\`\n${codeSnippet}\n\`\`\`\n\nExplain the error in one short sentence, then provide the corrected code block.\nReturn ONLY valid JSON: {"explanation": "...", "fixedCode": "..."}.`
    try {
      const res = await llamaGenerate({ model, systemPrompt: 'You are an expert developer. Return only valid JSON.', prompt, stream: false, temperature: 0.1, num_predict: 8192 })
      const response = (await extractText(res)).trim()
      const jsonMatch = response.match(/\{[\s\S]*"explanation"[\s\S]*\}/)
      if (!jsonMatch) throw new Error('No JSON found')
      const fix = JSON.parse(jsonMatch[0])
      return { ok: true, ...fix }
    } catch (err) { return { ok: false, error: err.message } }
  })

  // ── Bug Fix / Improve: systematic TODO + FIXED_CODE ───────────────
  ipcMain.handle('ai:bug-fix-code', async (_ev, { code, filePath, mode, isSelection }) => {
    const settings = loadSettings();
    const model = settings.analysisModel;
    const isImprove = mode === 'improve';

    // ── System prompts ──────────────────────────────────────────────
    const bugfixSystemPrompt = `You are a systematic bug‑fixer. Follow this process exactly:

    1. Output a numbered TODO list of **every bug** in the code. Include: missing imports, typos, undefined variables, unsafe calls, wrong API usage, logic errors, scope mistakes.
    2. After the list, output the fully corrected code under "FIXED_CODE:".

    RULES:
    - Only change what is broken; do NOT refactor or alter working logic, data structures, or behaviour.
    - If the code uses "defaultdict(int)", keep it exactly. Do NOT replace it with "Counter" or anything else.
    - Preserve all comments, formatting, and structure unless they contain a bug.
    - If no bugs exist, output only "NO BUGS" and then the unchanged code.

    FORMAT:
    TODO:
    1. <bug>
    2. <bug>
    ...
    FIXED_CODE:
    \`\`\`<language>
    <complete corrected code>
    \`\`\`
    `;

    const improveSystemPrompt = `You are an expert code reviewer focused on clean code and best practices. Refactor the code for readability, performance, and maintainability without changing its external behaviour. Preserve the overall logic.`;

    // ── User prompt ─────────────────────────────────────────────────
    const instruction = isImprove
      ? 'Refactor this code for better readability, performance, and best practices.'
      : 'Find and fix all bugs. Only change what is broken; do not alter working logic.';

    const scopeNote = isSelection
      ? 'Return the corrected code selection ONLY, preserving indentation. Do not add or remove imports unless the selection itself requires them (e.g. a missing import inside the selection).'
      : 'Return the complete corrected file. Ensure all necessary imports are present.';

    const prompt = [
      instruction,
      '',
      `File: ${filePath || 'unknown'}`,
      '```',
      code,
      '```',
      '',
      scopeNote,
      '',
      // For improve mode we keep the old explanation format; for fix we rely on the TODO+CODE
      isImprove
        ? `Respond with:\nEXPLANATION:\n<2-4 sentences>\n\nFIXED_CODE:\n\`\`\`\n<refactored code>\n\`\`\``
        : 'Follow the systematic TODO + FIXED_CODE format exactly as described in the system prompt.'
    ].join('\n');

    // ── Call model ──────────────────────────────────────────────────
    try {
      const res = await llamaGenerate({
        model,
        systemPrompt: isImprove ? improveSystemPrompt : bugfixSystemPrompt,
        prompt,
        stream: false,
        temperature: 0.1,
        num_predict: 8192,   // enough for large files; bump to 16384 if needed
      });

      const response = (await extractText(res)).trim();

      // ── Extract TODO list (only for bug‑fix mode) ─────────────────
      let todoList = [];
      let explanation = '';

      if (!isImprove) {
        const todoMatch = response.match(/TODO:\s*([\s\S]*?)(?=\n\s*FIXED_CODE:|$)/i);
        if (todoMatch) {
          const raw = todoMatch[1].trim();
          todoList = raw.split('\n')
            .filter(line => /^\d+[\.\)]\s/.test(line.trim()))
            .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim());
        }
      }

      // ── Extract explanation (fallback for improve or old format) ──
      const explMatch = response.match(/EXPLANATION:\s*([\s\S]*?)(?=\n\s*(?:TODO:|FIXED_CODE:|$))/i);
      if (explMatch) {
        explanation = explMatch[1].trim();
      } else {
        // Use first line(s) as explanation if no structured format found
        const firstLine = response.split('\n')[0]?.replace(/^[#\s*-]+/, '').trim() || '';
        explanation = firstLine || 'Bugs fixed.';
      }

      // ── Extract fixed code ─────────────────────────────────────────
      const codeMatch =
        response.match(/FIXED_CODE:\s*```[\w]*\n([\s\S]*?)```/i) ||
        response.match(/FIXED_CODE:\s*```([\s\S]*?)```/i) ||
        response.match(/FIXED_CODE:\s*\n([\s\S]+)$/i);

      let fixedCode = codeMatch ? codeMatch[1].trim() : '';

      // Fallback: if no FIXED_CODE block but we have a TODO, try to extract code block anywhere
      if (!fixedCode) {
        const codeBlockMatch = response.match(/```[\w]*\n([\s\S]*?)```/g);
        if (codeBlockMatch && codeBlockMatch.length >= 1) {
          // The last code block is probably the fix
          const lastBlock = codeBlockMatch[codeBlockMatch.length - 1];
          const inner = lastBlock.replace(/```[\w]*\n/, '').replace(/```$/, '');
          fixedCode = inner.trim();
        }
      }

      if (!fixedCode) {
        return { ok: false, error: 'Model did not provide a FIXED_CODE block. Please try again.' };
      }

      return {
        ok: true,
        todo: todoList.length > 0 ? todoList : null,
        explanation: explanation || 'Analysis complete.',
        fixedCode: fixedCode,
      };
    } catch (err) {
      console.error('[aiHandler] bug-fix-code error:', err.message);
      return { ok: false, error: err.message };
    }
  });

  // ── AI‑powered FULL project documentation generator ────────
  ipcMain.handle('ai:document-project', async (ev, { projectRoot, model }) => {
    const settings = loadSettings()
    const useModel = model || settings.analysisModel || settings.flowModel || 'qwen2.5-coder:7b'
    try {
      console.log('[aiHandler] Starting AI-powered documentation for:', projectRoot)
      // Build a complete summary of every source file
      const summary = await buildFullProjectSummary(projectRoot)
      const systemPrompt = `You are a senior technical writer.You are given the COMPLETE source code and file tree of a real software project.Write a PROJECT_DOCS.md file using ONLY the information provided.Do NOT invent any names, do NOT use placeholders like "Your Project Name".Describe the actual project.Include sections: project name / purpose, tech stack, directory layout, key components(describe every file), architecture, AI features(if any), UI conventions(if any), coding rules(from config files), build commands, and any special notes.Output ONLY raw Markdown.`
      const prompt = `Write the PROJECT_DOCS.md for this project.\n\nPROJECT SUMMARY: \n${summary} `
      const res = await llamaGenerate({
        model: useModel,
        systemPrompt,
        prompt,
        stream: false,
        temperature: 0,
        num_predict: 8192,
      })
      const text = (await extractText(res)).trim()
      const outPath = path.join(projectRoot, 'PROJECT_DOCS.md')
      await fs.writeFile(outPath, text, 'utf8')
      console.log('[aiHandler] Documentation written to:', outPath)
      return { ok: true, path: outPath }
    } catch (err) {
      console.error('[aiHandler] document-project error:', err.message)
      return { ok: false, error: err.message }
    }
  })
}

// ══════════════════════════════════════════════════════════════
//  FULL PROJECT SCANNER – reads every source file
// ══════════════════════════════════════════════════════════════
const EXCLUDE_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', 'build', 'target', 'vendor', '__pycache__', '.venv', 'venv', '.next', '.nuxt', 'coverage', '.cache', '.idea', '.vscode'])
const MAX_FILE_SIZE = 200 * 1024
const MAX_SUMMARY_LENGTH = 60000   // larger limit for thoroughness

async function buildFullProjectSummary(root) {
  let summary = ''
  // All config files at root
  const rootEntries = await fs.readdir(root, { withFileTypes: true })
  for (const ent of rootEntries) {
    if (ent.isFile() && isConfigFile(ent.name)) {
      const p = path.join(root, ent.name)
      try {
        summary += `### ${ent.name} \n\`\`\`\n${(await fs.readFile(p, 'utf8')).slice(0, 2000)}\n\`\`\`\n\n`
      } catch { }
    }
  }
  // Full file tree (3 levels)
  summary += '### Full File Tree (top 3 levels)\n```\n' + await generateTree(root, 3) + '\n```\n\n'
  // Every single source file (recursive, filtered)
  const allFiles = await getAllSourceFiles(root)
  for (const rel of allFiles) {
    if (summary.length >= MAX_SUMMARY_LENGTH) break
    const p = path.join(root, rel)
    try {
      const stat = fs.statSync(p)
      if (stat.size > MAX_FILE_SIZE) { summary += `### ${rel} (too large, skipped)\n\n`; continue }
      summary += `### ${rel}\n\`\`\`\n${await fs.readFile(p, 'utf8')}\n\`\`\`\n\n`
    } catch { }
  }
  if (summary.length >= MAX_SUMMARY_LENGTH) summary += '\n**Note:** Summary truncated due to length limits.\n'
  return summary
}

async function getAllSourceFiles(root) {
  const files = []
  await walk(root, root, files)
  return files.sort()
}

async function walk(baseDir, currentDir, results) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  for (const ent of entries) {
    if (ent.name.startsWith('.') || EXCLUDE_DIRS.has(ent.name)) continue
    const fullPath = path.join(currentDir, ent.name)
    const relPath = path.relative(baseDir, fullPath)
    if (ent.isDirectory()) await walk(baseDir, fullPath, results)
    else if (isSourceFile(ent.name)) results.push(relPath)
  }
}

function isConfigFile(name) { return /^(package\.json|tsconfig|vite\.config|\.gitignore|README|Cargo\.toml|go\.mod|Makefile|pyproject\.toml|setup\.cfg|setup\.py|Gemfile|pom\.xml|build\.gradle)$/i.test(name) }
function isSourceFile(name) { return /\.(ts|tsx|js|jsx|py|rs|cpp|c|h|java|go|rb|php|cs|swift|kt|scala|lua|sql|sh|bash|yaml|yml|toml|json|md|txt|css|scss|less|html|vue|svelte)$/i.test(name) }

async function generateTree(dir, maxDepth, indent = '') {
  if (maxDepth < 0) return ''
  let out = ''
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const ent of entries) {
    if (ent.name.startsWith('.') || EXCLUDE_DIRS.has(ent.name)) continue
    out += `${indent}${ent.isDirectory() ? '📁' : '📄'} ${ent.name}\n`
    if (ent.isDirectory() && maxDepth > 0) out += await generateTree(path.join(dir, ent.name), maxDepth - 1, indent + '  ')
  }
  return out
}
'use strict'
const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const { execSync } = require('child_process')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate, extractText } = require('../utils/ollamaClient.cjs')
const { buildContext } = require('../services/retrieval.cjs')

// ── Tool implementations ──────────────────────────────────────────────────────

async function toolReadFile(args) {
  const filePath = args.path || args.filePath
  if (!filePath) throw new Error('read_file requires a path argument')
  const content = await fs.readFile(filePath, 'utf8')
  return content.slice(0, 8000)
}

async function toolWriteFile(args) {
  const { path: filePath, content } = args
  if (!filePath || content === undefined) throw new Error('write_file requires path and content')
  await fs.writeFile(filePath, content, 'utf8')
  return 'written'
}

async function toolSearchProject(args) {
  const { projectRoot, pattern } = args
  if (!projectRoot || !pattern) throw new Error('search_project requires projectRoot and pattern')
  try {
    const out = execSync(
      `grep -rn ${JSON.stringify(pattern)} ${JSON.stringify(projectRoot)} --include="*.ts" --include="*.tsx" --include="*.js" --include="*.cjs" --include="*.py" -l`,
      { timeout: 5000, encoding: 'utf8' }
    )
    return out.trim().split('\n').filter(Boolean)
  } catch {
    return []
  }
}

const TOOLS = {
  read_file:      toolReadFile,
  write_file:     toolWriteFile,
  search_project: toolSearchProject,
}

// ── JSON extraction ───────────────────────────────────────────────────────────

function extractTodosJson(raw) {
  // Strip thinking tags
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json?\n?/gi, '')
    .replace(/```/gi, '')
    .trim()

  // Find outermost { ... }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found')

  let jsonStr = cleaned.slice(start, end + 1)

  // Repair attempts
  const attempts = [
    () => JSON.parse(jsonStr),
    () => JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1')),
    () => {
      let s = jsonStr
      let open = 0, openB = 0
      for (const c of s) { if (c === '{') open++; else if (c === '}') open--; else if (c === '[') openB++; else if (c === ']') openB-- }
      if (open > 0) s += '}'.repeat(open)
      if (openB > 0) s += ']'.repeat(openB)
      return JSON.parse(s)
    },
  ]

  for (const attempt of attempts) {
    try { return attempt() } catch {}
  }
  throw new Error('Could not parse JSON from model response')
}

// ── Core agent loop ───────────────────────────────────────────────────────────

async function runAgentLoop(event, { goal, code, filePath, projectRoot }, maxSteps = 8) {
  const settings = loadSettings()
  const model = settings.analysisModel || settings.chatModel || 'qwen2.5-coder:7b'

  // Phase 1: RAG — retrieve relevant chunks from the embedding index
  let ragContext = ''
  try {
    ragContext = await buildContext(goal, projectRoot)
    if (ragContext) console.log('[agentHandler] RAG context retrieved, chars:', ragContext.length)
  } catch (e) {
    console.warn('[agentHandler] RAG unavailable (index not built?):', e.message)
  }

  // Phase 2: Plan
  const planPrompt = [
    ragContext ? `Relevant codebase context:\n${ragContext}\n` : '',
    filePath ? `Current file: ${filePath}` : '',
    code ? `\`\`\`\n${code.slice(0, 4000)}\n\`\`\`` : '',
    '',
    `Goal: ${goal}`,
    '',
    'List the steps needed to achieve this goal.',
    'Return ONLY a JSON object with this shape:',
    '{"todos":[{"id":"1","label":"short title","description":"what to do","tool":"read_file","args":{"path":"/abs/path"}}]}',
    '',
    'IMPORTANT: Each step must have exactly ONE tool from this list: read_file, write_file, search_project.',
    'DO NOT combine multiple tools with "|". Example: "tool":"read_file" not "read_file|write_file".',
    '',
    'Tool args shapes:',
    '  read_file:      {"path": "/abs/path/to/file"}',
    '  write_file:     {"path": "/abs/path/to/file", "content": "full content"}',
    '  search_project: {"projectRoot": "/abs/project/root", "pattern": "search term"}',
  ].filter(Boolean).join('\n')

  let rawPlan
  try {
    const planRes = await llamaGenerate({
      model,
      systemPrompt: 'You are a coding agent. Produce a step-by-step plan as JSON. No prose. No markdown. Only the JSON object.',
      prompt: planPrompt,
      temperature: 0,
      num_predict: 1024,
      stream: false,
    })
    rawPlan = await extractText(planRes)
  } catch (err) {
    event.sender.send('agent:error', `LLM call failed: ${err.message}`)
    return
  }

  let todos
  try {
    const parsed = extractTodosJson(rawPlan)
    todos = (parsed.todos || []).map((t, i) => ({
      id:          String(t.id ?? i + 1),
      label:       t.label       || `Step ${i + 1}`,
      description: t.description || '',
      tool:        t.tool        || 'read_file',
      args:        t.args        || {},
      status:      'pending',
    }))
  } catch (err) {
    console.error('[agentHandler] Plan parse failed. Raw:', rawPlan?.slice(0, 400))
    event.sender.send('agent:error', `Plan parsing failed: ${err.message}\n\nModel output:\n${rawPlan?.slice(0, 400)}`)
    return
  }

  if (todos.length === 0) {
    event.sender.send('agent:error', 'Model returned an empty plan.')
    return
  }

  // Send plan to UI — BugFixModal enters review phase
  event.sender.send('agent:plan', todos)

  // Phase 3: Execute each step
  for (let i = 0; i < Math.min(todos.length, maxSteps); i++) {
    const todo = todos[i]
    event.sender.send('agent:step:start', todo.id)

    const toolFn = TOOLS[todo.tool]
    if (!toolFn) {
      event.sender.send('agent:step:error', { id: todo.id, error: `Unknown tool: ${todo.tool}` })
      continue
    }

    try {
      const result = await toolFn(todo.args)
      event.sender.send('agent:step:done', { id: todo.id, result })
    } catch (err) {
      console.error(`[agentHandler] Step ${todo.id} failed:`, err.message)
      event.sender.send('agent:step:error', { id: todo.id, error: err.message })
      // Continue to next step instead of aborting the whole run
    }
  }

  event.sender.send('agent:done')
}

// ── IPC registration ──────────────────────────────────────────────────────────

module.exports = function () {
  ipcMain.on('agent:run', (event, payload) => {
    runAgentLoop(event, payload).catch(err =>
      event.sender.send('agent:error', err.message)
    )
  })

  ipcMain.handle('agent:write-file', async (_ev, { filePath, content }) => {
    await fs.writeFile(filePath, content, 'utf8')
    return { ok: true }
  })

  ipcMain.handle('agent:search', async (_ev, { projectRoot, pattern }) => {
    const files = await toolSearchProject({ projectRoot, pattern })
    return { ok: true, files }
  })
}

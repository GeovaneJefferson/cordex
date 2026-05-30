'use strict'
const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const { app } = require('electron')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate, resolveBackend, extractText } = require('../utils/ollamaClient.cjs')
const { scanModels } = require('../utils/ollamaServer.cjs')

// ── Dependency Manifest Builder ───────────────────────────────────────────────
const IMPORT_PATTERNS = [
  /^(?:from\s+(\.{0,2}[\w/.]+)\s+import|import\s+(\.{0,2}[\w/.]+))/gm,
  /(?:import\s+.*?\s+from\s+['"]([./][^'"]+)['"]|require\s*\(\s*['"]([./][^'"]+)['"]\s*\))/gm,
]

const SIG_PATTERNS = {
  py: [
    /^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/gm,
    /^class\s+(\w+)(?:\s*\([^)]*\))?:/gm,
  ],
  js: [
    /(?:export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\))/gm,
    /(?:export\s+(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/gm,
    /(?:module\.exports\s*[=.]\s*(?:async\s+)?function\s*(\w+)?\s*\(([^)]*)\))/gm,
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm,
  ],
  ts: [
    /(?:export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\))/gm,
    /(?:export\s+(?:const|let)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)/gm,
    /(?:export\s+(?:abstract\s+)?class\s+(\w+))/gm,
    /(?:export\s+(?:type|interface)\s+(\w+))/gm,
  ],
}

function detectLang(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  if (ext === 'py') return 'py'
  if (['ts', 'tsx'].includes(ext)) return 'ts'
  return 'js'
}

function extractSignatures(content, lang) {
  const sigs = new Set()
  const patterns = SIG_PATTERNS[lang] ?? SIG_PATTERNS.js
  for (const pat of patterns) {
    let m
    const re = new RegExp(pat.source, pat.flags)
    while ((m = re.exec(content)) !== null) {
      const name = m[1]
      if (name && !name.startsWith('_')) sigs.add(name)
    }
  }
  return [...sigs]
}

function resolveImportPath(importStr, sourceFile, projectRoot) {
  const sourceDir = path.dirname(sourceFile)
  let rel = importStr.replace(/^\.+/, match => match === '.' ? './' : match === '..' ? '../' : './')
  if (!rel.startsWith('.')) rel = './' + rel
  rel = rel.replace(/\./g, '/')

  const base = path.resolve(sourceDir, rel)
  const exts = ['.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
  for (const ext of exts) {
    const candidate = base.endsWith(ext) ? base : base + ext
    if (fs.existsSync(candidate)) return candidate
  }
  for (const ext of ['/index.ts', '/index.js', '/index.tsx']) {
    const candidate = base + ext
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

async function buildDependencyManifest(code, filePath, projectRoot) {
  if (!filePath || !projectRoot) return ''

  const resolvedImports = new Set()

  for (const pat of IMPORT_PATTERNS) {
    let m
    const re = new RegExp(pat.source, pat.flags)
    while ((m = re.exec(code)) !== null) {
      const importPath = m[1] || m[2]
      if (!importPath) continue
      if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue
      const resolved = resolveImportPath(importPath, filePath, projectRoot)
      if (resolved) resolvedImports.add(resolved)
    }
  }

  if (resolvedImports.size === 0) return ''

  const lines = ['=== DEPENDENCY MANIFEST (local imports) ===']
  for (const depPath of resolvedImports) {
    try {
      const content = await fs.readFile(depPath, 'utf8')
      const relPath = path.relative(projectRoot, depPath)
      const lang = detectLang(depPath)
      const sigs = extractSignatures(content, lang)
      if (sigs.length === 0) continue
      lines.push(`\nFile: ${relPath}`)
      lines.push(`Exports: ${sigs.join(', ')}`)
      const snippet = content.slice(0, 1200).replace(/\n{3,}/g, '\n\n')
      lines.push(`Source (truncated):\n${snippet}`)
    } catch { }
  }

  if (lines.length === 1) return ''
  return lines.join('\n')
}

function buildSystemPrompt(manifest) {
  const manifestSection = manifest
    ? `\nLocal imports context:\n${manifest}\n`
    : ''

  return `You are a code flow analyzer. Output ONLY a JSON object — no markdown, no explanation, no text before or after.

Analyze the runtime logic and return this exact structure:
{"nodes":[{"id":"entry","type":"entry","label":"Start program","description":"entry point","line":1},{"id":"n1","type":"call","label":"Do something","description":"what it does","line":5},{"id":"exit","type":"exit","label":"End program","description":"exit point","line":10}],"edges":[{"source":"entry","target":"n1","label":""},{"source":"n1","target":"exit","label":""}]}

Rules:
- First node must have id="entry" and type="entry"
- Last node must have id="exit" and type="exit"
- Node types allowed: entry | exit | call | decision | loop | error | value
- Between 4 and 14 nodes total
- Labels start with a verb: "Check X", "Call Y", "Return Z", "Handle error"
- Skip import/require statements — do not create nodes for them
- All JSON keys double-quoted, no trailing commas
${manifestSection}
Output ONLY the JSON object, nothing else:`
}
// ── Ultra‑resilient JSON extraction ─────────────────────────────────────────
function longestValidJsonSubstring(s) {
  let best = null;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < s.length && depth > 0) {
        if (s[j] === '{') depth++;
        else if (s[j] === '}') depth--;
        j++;
      }
      if (depth === 0) {
        const candidate = s.substring(i, j);
        try {
          const parsed = JSON.parse(candidate);
          if (best === null || JSON.stringify(parsed).length > JSON.stringify(best).length) {
            best = parsed;
          }
        } catch { }
      }
    }
  }
  if (best !== null) return best;
  throw new Error('No valid JSON object found');
}

function robustJsonExtract(raw) {
  // Grab the outermost { … } block
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || start >= end) {
    throw new Error('No braces found in response');
  }
  let jsonStr = raw.slice(start, end + 1);

  // Remove common cruft
  jsonStr = jsonStr
    .replace(/\/\/.*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\r/g, '');

  const attempts = [
    () => JSON.parse(jsonStr),
    () => JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1')),
    () => JSON.parse(jsonStr.replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')),
    () => {
      let balanced = jsonStr;
      let openBraces = 0, openBrackets = 0;
      for (const ch of balanced) {
        if (ch === '{') openBraces++;
        else if (ch === '}') openBraces--;
        else if (ch === '[') openBrackets++;
        else if (ch === ']') openBrackets--;
      }
      if (openBraces > 0) balanced += '}'.repeat(openBraces);
      if (openBrackets > 0) balanced += ']'.repeat(openBrackets);
      return JSON.parse(balanced);
    },
    () => longestValidJsonSubstring(jsonStr),
  ];

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (e) {
      // continue to next strategy
    }
  }

  throw new Error('JSON could not be repaired');
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────
module.exports = function () {

  ipcMain.handle('analyze-flow', async (_ev, payload) => {
    const code = typeof payload === 'string' ? payload : payload?.code ?? ''
    const filePath = typeof payload === 'object' ? payload?.filePath : null
    const projectRoot = typeof payload === 'object' ? payload?.projectRoot : null

    if (!code || !code.trim()) return { nodes: [], edges: [] }

    await resolveBackend()

    try {
      const settings = loadSettings()
      const availableModels = await scanModels()
      const defaultModel = availableModels.length > 0 ? availableModels[0].name : null
      const modelToUse = settings.flowModel || settings.analysisModel || defaultModel

      if (!modelToUse) throw new Error('No Ollama model found.')

      const manifest = await buildDependencyManifest(code, filePath, projectRoot)
      if (manifest) console.log('[flowHandler] Dependency manifest built:', manifest.split('\n').slice(0, 4).join(' | '))

      const systemPrompt = buildSystemPrompt(manifest)

      const res = await llamaGenerate({
        model: modelToUse,
        systemPrompt,
        prompt: `Code to analyze:\n\`\`\`\n${code.slice(0, 8000)}\n\`\`\``,
        temperature: 0,
        num_predict: 2048,
        stream: false,
      })

      let raw = await extractText(res)
      if (!raw) throw new Error('Empty response from Ollama.')

      raw = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json?\n?/gi, '')
        .replace(/```/gi, '')
        .trim()

      console.log('[analyze-flow] RAW AI response (first 500 chars):', raw.slice(0, 500));
      let flowData;
      try {
        flowData = robustJsonExtract(raw);
        console.log('[analyze-flow] Extraction succeeded. Keys:', Object.keys(flowData));
      } catch (err) {
        console.error('[analyze-flow] robustJsonExtract FAILED:', err.message);
        return { nodes: [], edges: [], error: `AI returned unparseable JSON.\n\nRaw response (first 600 chars):\n${raw.slice(0, 600)}` };
      }

      const graph = buildReactFlowGraph(flowData)
      if (graph.nodes.length === 0) {
        console.warn('[analyze-flow] Zero nodes after extraction. flowData:', JSON.stringify(flowData).slice(0, 400))
        return { nodes: [], edges: [], error: `Model returned no nodes.\n\nRaw response (first 600 chars):\n${raw.slice(0, 600)}` }
      }
      return graph
    } catch (err) {
      console.error('[analyze-flow] Error:', err.message)
      return { nodes: [], edges: [], error: err.message }
    }
  })

  ipcMain.handle('save-flow', async (_ev, fileHash, flowData) => {
    try {
      const flowDir = path.join(app.getPath('userData'), 'flows')
      await fs.ensureDir(flowDir)
      await fs.writeJson(path.join(flowDir, `${fileHash}.json`), flowData, { spaces: 2 })
      return { success: true }
    } catch (err) { return { success: false, error: err.message } }
  })

  ipcMain.handle('load-flow', async (_ev, fileHash) => {
    try {
      return await fs.readJson(path.join(app.getPath('userData'), 'flows', `${fileHash}.json`))
    } catch { return null }
  })

  ipcMain.handle('delete-flow', async (_ev, fileHash) => {
    try {
      const p = path.join(app.getPath('userData'), 'flows', `${fileHash}.json`)
      if (await fs.pathExists(p)) await fs.remove(p)
      return { success: true }
    } catch (err) { return { success: false, error: err.message } }
  })

  // ── flow:detect-mode ─────────────────────────────────────────────────────────
  ipcMain.handle('flow:detect-mode', async (_ev, { language, filePath }) => {
    const lang = (language || detectLangFromPath(filePath || '')).toLowerCase()
    const executable = EXECUTABLE_LANGS.has(lang)
    if (!executable) return { mode: 'simulation', reason: `${lang} is not directly executable` }

    const available = await checkRuntime(lang)
    if (!available) return { mode: 'simulation', reason: `${lang} runtime not found in PATH` }

    return { mode: 'execution', reason: `${lang} runtime available`, language: lang }
  })

  // ── flow:run ─────────────────────────────────────────────────────────────────
  ipcMain.handle('flow:run', async (_ev, { code, language, filePath, timeout = 12000 }) => {
    const lang = (language || detectLangFromPath(filePath || '')).toLowerCase()
    try {
      return await executeCode(code, lang, timeout)
    } catch (err) {
      return { success: false, stdout: '', stderr: err.message, exitCode: -1, errorLine: null, mode: 'execution' }
    }
  })

  // ── flow:simulate ────────────────────────────────────────────────────────────
  ipcMain.handle('flow:simulate', async (_ev, { code, language, nodes }) => {
    const lang = (language || '').toLowerCase()
    try {
      return simulateExecution(code, nodes || [], lang)
    } catch (err) {
      return { executedNodes: [], riskNodes: [], predictedNodes: [], mode: 'simulation', error: err.message }
    }
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
const { spawn } = require('child_process')
const os = require('os')

const EXECUTABLE_LANGS = new Set(['python', 'javascript', 'typescript', 'node', 'cpp', 'c', 'cjs', 'mjs'])
const EXT_TO_LANG = { py: 'python', js: 'javascript', cjs: 'javascript', mjs: 'javascript', ts: 'typescript', tsx: 'typescript', cpp: 'cpp', cc: 'cpp', c: 'c' }

const STDERR_ERROR_RE = /(?:Error|Exception|Traceback|CRITICAL|FATAL|NameError|TypeError|ValueError|AttributeError|ImportError|KeyError|IndexError|RuntimeError|PermissionError)\b/i

function detectLangFromPath(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return EXT_TO_LANG[ext] || ext || 'unknown'
}

function checkRuntime(lang) {
  const cmdMap = {
    python: ['python3', '--version'],
    javascript: ['node', '--version'],
    typescript: ['node', '--version'],
    cpp: ['g++', '--version'],
    c: ['gcc', '--version'],
  }
  const args = cmdMap[lang]
  if (!args) return Promise.resolve(false)
  return new Promise(resolve => {
    const p = spawn(args[0], args.slice(1))
    const t = setTimeout(() => { p.kill(); resolve(false) }, 3000)
    p.on('close', code => { clearTimeout(t); resolve(code === 0) })
    p.on('error', () => { clearTimeout(t); resolve(false) })
  })
}

function runProcess(cmd, args, timeout) {
  return new Promise(resolve => {
    let stdout = '', stderr = ''
    let timedOut = false

    let proc
    try {
      proc = spawn(cmd, args, {
        env: { ...process.env, PYTHONUNBUFFERED: '1', NODE_PATH: '' },
      })
    } catch (err) {
      return resolve({ success: false, stdout: '', stderr: err.message, exitCode: -1, timedOut: false })
    }

    const timer = setTimeout(() => {
      timedOut = true
      proc.kill('SIGKILL')
    }, timeout)

    proc.stdout?.on('data', d => { stdout += d.toString(); if (stdout.length > 50000) stdout = stdout.slice(-50000) })
    proc.stderr?.on('data', d => { stderr += d.toString(); if (stderr.length > 20000) stderr = stderr.slice(-20000) })

    proc.on('close', code => {
      clearTimeout(timer)
      resolve({ success: code === 0 && !timedOut, stdout: stdout.trimEnd(), stderr: stderr.trimEnd(), exitCode: timedOut ? -9 : (code ?? -1), timedOut })
    })
    proc.on('error', err => {
      clearTimeout(timer)
      resolve({ success: false, stdout: '', stderr: err.message, exitCode: -1, timedOut: false })
    })
  })
}

function extractErrorLine(stderr, lang) {
  if (!stderr) return null
  const pats = {
    python: [/File ".*?", line (\d+)/, /^\s*line (\d+)/m],
    javascript: [/[^ ]+:(\d+):\d+\)?\s*$/m, /at .+:(\d+):\d+/],
    typescript: [/[^ ]+\.tsx?:(\d+):\d+/, /at .+:(\d+):\d+/],
    cpp: [/:(\d+):\d+: (?:error|fatal)/, /line (\d+)/],
    c: [/:(\d+):\d+: (?:error|fatal)/],
  }
  for (const re of (pats[lang] ?? [])) {
    const m = re.exec(stderr)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

async function executeCode(code, lang, timeout = 12000) {
  const extMap = { python: '.py', javascript: '.js', typescript: '.ts', cpp: '.cpp', c: '.c' }
  const ext = extMap[lang] ?? '.txt'
  const tmpFile = path.join(os.tmpdir(), `cordex_${Date.now()}${ext}`)

  try {
    await fs.writeFile(tmpFile, code, 'utf8')
    let result

    if (lang === 'python') {
      result = await runProcess('python3', [tmpFile], timeout)
    } else if (lang === 'javascript') {
      result = await runProcess('node', [tmpFile], timeout)
    } else if (lang === 'typescript') {
      result = await runProcess('npx', ['--yes', 'tsx', tmpFile], timeout)
      if (!result.success && result.stderr.includes('npx')) {
        result = await runProcess('node', ['--loader', 'ts-node/esm', tmpFile], timeout)
      }
    } else if (lang === 'cpp' || lang === 'c') {
      const compiler = lang === 'cpp' ? 'g++' : 'gcc'
      const binary = tmpFile.replace(ext, '')
      const compile = await runProcess(compiler, [tmpFile, '-o', binary, '-std=c++17'], timeout)
      if (!compile.success) {
        return { ...compile, mode: 'execution', errorLine: extractErrorLine(compile.stderr, lang), phase: 'compile' }
      }
      result = await runProcess(binary, [], Math.min(timeout, 8000))
      try { await fs.remove(binary) } catch { }
    } else {
      return { success: false, stdout: '', stderr: `Unsupported language: ${lang}`, exitCode: -1, mode: 'simulation', errorLine: null }
    }

    return {
      ...result,
      mode: 'execution',
      hasStderrErrors: result.stderr ? STDERR_ERROR_RE.test(result.stderr) : false,
      errorLine: result.success && !STDERR_ERROR_RE.test(result.stderr ?? '')
        ? null
        : extractErrorLine(result.stderr, lang),
    }
  } finally {
    try { await fs.remove(tmpFile) } catch { }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATION ENGINE  (static analysis — no subprocess)
// ═══════════════════════════════════════════════════════════════════════════════

const RISK_CHECKS = [
  { name: 'Assignment in condition', re: /if\s*\([^)]*(?<![!<>=])=(?!=)[^)]*\)/ },
  { name: 'Possible null dereference', re: /(?:null|None|undefined)\s*\.\w+/ },
  { name: 'Array index in loop', re: /(?:for|while)[\s\S]{0,200}\w+\[(?!\s*[0-9]+\s*\])/ },
  { name: 'Recursive call risk', re: /function\s+(\w+)[\s\S]{0,300}\1\s*\(/ },
  { name: 'Bare except / catch', re: /(?:except\s*:|catch\s*\(\s*\))/ },
  { name: 'Hardcoded credentials', re: /(?:password|secret|token|api_key)\s*=\s*['"][^'"]{4,}['"]/ },
]

function codeRisks(snippet) {
  return RISK_CHECKS.filter(r => r.re.test(snippet)).map(r => r.name)
}

function buildLineMap(nodes, lines) {
  const identMap = new Map()
  const defPatterns = [
    /^(?:async\s+)?def\s+(\w+)/,
    /^class\s+(\w+)/,
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/,
    /^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/,
    /^\w[\w:*&\s]+\s+(\w+)\s*\([^)]*\)\s*\{?$/,
  ]

  lines.forEach((raw, i) => {
    const t = raw.trim()
    for (const pat of defPatterns) {
      const m = pat.exec(t)
      if (m) identMap.set(m[1].toLowerCase(), i + 1)
    }
  })

  const result = {}
  for (const node of nodes) {
    const d = node.data ?? node
    const label = (d.label ?? node.label ?? node.id).toLowerCase()
    const words = label.replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(w => w.length > 2)

    for (const word of words) {
      if (identMap.has(word)) {
        const start = identMap.get(word)
        result[node.id] = { start, end: Math.min(start + 40, lines.length) }
        break
      }
    }
  }
  return result
}

function topoOrder(nodes, edges) {
  const adjList = {}
  const inDegree = {}
  nodes.forEach(n => { adjList[n.id] = []; inDegree[n.id] = 0 })
  edges.forEach(e => { adjList[e.source]?.push(e.target); inDegree[e.target] = (inDegree[e.target] ?? 0) + 1 })

  const queue = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id)
  const order = []
  const seen = new Set()
  while (queue.length) {
    const id = queue.shift()
    if (seen.has(id)) continue
    seen.add(id); order.push(id)
      ; (adjList[id] ?? []).forEach(next => {
        inDegree[next] = (inDegree[next] ?? 1) - 1
        if (inDegree[next] <= 0) queue.push(next)
      })
  }
  nodes.forEach(n => { if (!seen.has(n.id)) order.push(n.id) })
  return order
}

function simulateExecution(code, nodes, lang) {
  const lines = code.split('\n')
  const lineMap = buildLineMap(nodes, lines)
  const ordered = topoOrder(nodes, [])

  const executedNodes = []
  const riskNodes = []
  const predictedNodes = []

  const fileRisks = codeRisks(code)

  const sorted = [...nodes].sort((a, b) => (a.position?.y ?? 0) - (b.position?.y ?? 0))

  for (const node of sorted) {
    const d = node.data ?? node
    const nodeType = d.nodeType ?? node.nodeType ?? 'call'
    const lineRange = lineMap[node.id]

    const snippet = lineRange
      ? lines.slice(lineRange.start - 1, lineRange.end).join('\n')
      : (d.label ?? node.label ?? '')

    const localRisks = codeRisks(snippet)

    if (nodeType === 'error') {
      riskNodes.push({ id: node.id, risks: ['Known error path'] })
    } else if (localRisks.length > 0) {
      riskNodes.push({ id: node.id, risks: localRisks })
    } else if (nodeType === 'decision') {
      predictedNodes.push(node.id)
    } else if (nodeType === 'loop') {
      predictedNodes.push(node.id)
    } else {
      executedNodes.push(node.id)
    }
  }

  const highRisk = fileRisks.filter(r => r.includes('null') || r.includes('Assignment'))
  if (highRisk.length > 0 && executedNodes.length > 0) {
    const entryNode = sorted.find(n => (n.data ?? n).nodeType === 'entry')
    if (entryNode) {
      const wasExec = executedNodes.indexOf(entryNode.id)
      if (wasExec !== -1) executedNodes.splice(wasExec, 1)
      riskNodes.unshift({ id: entryNode.id, risks: highRisk })
    }
  }

  return { executedNodes, riskNodes, predictedNodes, fileRisks, mode: 'simulation' }
}

// ── React Flow graph builder ───────────────────────────────────────────────────
function buildReactFlowGraph(data) {
  // Dig nodes/edges out of whatever nesting the model used
  let nodes = data.nodes ?? data.graph?.nodes ?? data.flow?.nodes ?? data.flowGraph?.nodes ?? []
  let edges = data.edges ?? data.graph?.edges ?? data.flow?.edges ?? data.flowGraph?.edges ?? []

  // Filter out placeholder nodes the model echoed from the example template
  nodes = nodes.filter(n =>
    n.id && n.id !== 'string' &&
    n.label && n.label !== 'string' && n.label !== 'Start' && n.label !== 'End' &&
    typeof n.id === 'string' && typeof n.label === 'string'
  )

  if (nodes.length === 0) return { nodes: [], edges: [] }

  const adjList = {}
  const inDegree = {}

  nodes.forEach(n => { inDegree[n.id] = 0; adjList[n.id] = [] })
  edges.forEach(e => {
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1
    adjList[e.source] = [...(adjList[e.source] ?? []), e.target]
  })

  const level = {}
  let queue = nodes.filter(n => (inDegree[n.id] ?? 0) === 0).map(n => n.id)
  if (queue.length === 0 && nodes.length > 0) {
    queue.push((nodes.find(n => n.id === 'entry') || nodes[0]).id)
  }
  queue.forEach(id => { level[id] = 0 })

  while (queue.length) {
    const cur = queue.shift()
    for (const next of (adjList[cur] ?? [])) {
      const nextLevel = (level[cur] ?? 0) + 1
      if (level[next] === undefined || (level[next] < nextLevel && nextLevel < nodes.length)) {
        level[next] = nextLevel
        queue.push(next)
      }
    }
  }

  const levelCols = {}
  const positions = {}
  const XGAP = 360, YGAP = 240, IX = 620, IY = 80

  nodes.forEach(n => {
    const lvl = level[n.id] ?? 0
    levelCols[lvl] = levelCols[lvl] === undefined ? 0 : levelCols[lvl] + 1
    const col = levelCols[lvl]
    const dir = col % 2 === 0 ? 1 : -1
    const steps = Math.ceil(col / 2)
    positions[n.id] = { x: IX + dir * steps * XGAP, y: IY + lvl * YGAP }
  })

  const rfNodes = nodes.map(n => ({
    id: n.id,
    type: 'flowNode',
    position: positions[n.id] ?? { x: IX, y: IY },
    nodeType: n.type ?? 'call',
    label: n.label ?? n.id,
    description: n.description ?? null,
    errorMsg: n.errorMsg ?? null,
    line: n.line ?? null,
    width: 260,
    height: 100,
  }))

  const rfEdges = edges.map(e => {
    const isError = ['raises', 'error', 'catch'].includes(e.label)
    const isFalse = ['false', 'no', 'else'].includes(e.label)
    return {
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      label: e.label ?? '',
      animated: !isError,
      type: 'smoothstep',
      labelStyle: { fill: isError ? '#ef4444' : isFalse ? '#f59e0b' : '#6b7280', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
      labelBgPadding: [4, 3],
      style: {
        stroke: isError ? '#ef4444' : isFalse ? '#f59e0b' : '#94a3b8',
        strokeWidth: isError ? 2 : 1.5,
        strokeDasharray: isError ? '6 3' : undefined,
      },
    }
  })

  return { nodes: rfNodes, edges: rfEdges }
}
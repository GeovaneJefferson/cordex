'use strict'
const { ipcMain }  = require('electron')
const path         = require('path')
const fs           = require('fs-extra')
const { app }      = require('electron')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate, resolveBackend, extractText } = require('../utils/llamaCpp.cjs')
const { scanModels }   = require('../utils/llamaServer.cjs')

// ── Dependency Manifest Builder ───────────────────────────────────────────────
// Extracts local import targets from a source file, reads those files, and
// builds a compact "API surface" string listing exported symbols with their
// signatures. This gets injected into the LLM prompt so the flow graph can
// represent cross-file calls with scoped node IDs (file:function).

const IMPORT_PATTERNS = [
  // Python:  from .module import foo   /  import module
  /^(?:from\s+(\.{0,2}[\w/.]+)\s+import|import\s+(\.{0,2}[\w/.]+))/gm,
  // JS/TS:   import ... from './module'   /  require('./module')
  /(?:import\s+.*?\s+from\s+['"]([./][^'"]+)['"]|require\s*\(\s*['"]([./][^'"]+)['"]\s*\))/gm,
]

// Signature extractors per language
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
  // Strip leading dots for Python relative imports
  let rel = importStr.replace(/^\.+/, match => match === '.' ? './' : match === '..' ? '../' : './')
  if (!rel.startsWith('.')) rel = './' + rel
  // Convert Python dotted paths to slashes
  rel = rel.replace(/\./g, '/')

  const base = path.resolve(sourceDir, rel)
  const exts = ['.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
  for (const ext of exts) {
    const candidate = base.endsWith(ext) ? base : base + ext
    if (fs.existsSync(candidate)) return candidate
  }
  // Try index file
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
      // Only local imports (relative or within project)
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
      // Add brief content snippet (first 1200 chars) for context
      const snippet = content.slice(0, 1200).replace(/\n{3,}/g, '\n\n')
      lines.push(`Source (truncated):\n${snippet}`)
    } catch {}
  }

  if (lines.length === 1) return '' // Only header, no deps found
  return lines.join('\n')
}

// ── Flow Analysis System Prompt ───────────────────────────────────────────────
function buildSystemPrompt(manifest) {
  const manifestSection = manifest
    ? `\nYou have access to a dependency manifest for local imports. Use it to:\n- Identify cross-file function calls and represent them as nodes\n- Use SCOPED node IDs for cross-file calls: "filename:function_name" (e.g., "utils:read_file")\n- Show the data/call flow between files accurately\n\n${manifest}\n`
    : ''

  return `You are a code flow analyzer. Analyze the given code and return ONLY a JSON object describing its logical flow.
${manifestSection}
Rules:
- Every flow MUST start with a node id="entry" (type="entry") and end with id="exit" (type="exit")
- Node types: "entry" | "exit" | "call" | "decision" | "loop" | "error" | "value" | "import"
- For cross-file calls use scoped IDs: "depfile:funcname" and type="import"
- Every node label must start with a verb
- Represent ALL conditionals as "decision" nodes  
- Group low-level steps into meaningful "call" nodes
- Keep it under 16 nodes max (multi-file graphs may use up to 16)

Return ONLY valid JSON, no markdown fences, no explanation:
{"nodes":[{"id":"string","type":"string","label":"string","description":"string"}],"edges":[{"source":"string","target":"string","label":"string"}]}`
}

// UNIVERSAL RULES:
// 1. ENTRY & EXIT: Every flow MUST start with an "Entry" node and end with a "Result" node.
// 2. ACTION-ORIENTED: Every node MUST start with a verb (e.g., "Parse Data", "Send Request", "Wait for Input").
// 3. LOGIC BRANCHING: Represent ALL conditional logic (if/switch/try-catch) as "decision" nodes.
// 4. ABSTRACTION: If the code is complex, group small steps into a single meaningful "call" node (e.g., "Process Payment" instead of mapping 50 lines of math).

// NODE TYPES: "call" (action), "loop", "decision", "error", "value".
// IGNORE: Variable declarations, imports, and low-level boilerplate.

// OUTPUT: STRICT RAW JSON ONLY.
// {
//   "nodes": [{"id":"1","type":"call","label":"Start Process","description":"Entry point"}],
//   "edges": [{"source":"1","target":"2","label":"then"}]
// }

// ── IPC Handlers ──────────────────────────────────────────────────────────────
module.exports = function() {

  ipcMain.handle('analyze-flow', async (_ev, payload) => {
    // Accept both old string API and new object API
    const code        = typeof payload === 'string' ? payload : payload?.code ?? ''
    const filePath    = typeof payload === 'object'  ? payload?.filePath    : null
    const projectRoot = typeof payload === 'object'  ? payload?.projectRoot : null

    if (!code || !code.trim()) return { nodes: [], edges: [] }

    await resolveBackend()

    try {
      const settings        = loadSettings()
      const availableModels = scanModels()
      const defaultModel    = availableModels.length > 0 ? availableModels[0].name : null
      const modelToUse      = settings.flowModel || settings.analysisModel || defaultModel

      if (!modelToUse) throw new Error('No AI model found. Place a .gguf model in your models directory.')

      // Build dependency manifest from local imports
      const manifest = await buildDependencyManifest(code, filePath, projectRoot)
      if (manifest) console.log('[flowHandler] Dependency manifest built:', manifest.split('\n').slice(0, 4).join(' | '))

      const systemPrompt = buildSystemPrompt(manifest)

      const res = await llamaGenerate({
        model:        modelToUse,
        systemPrompt,
        prompt:       `Code to analyze:\n\`\`\`\n${code.slice(0, 8000)}\n\`\`\``,
        temperature:  0,
        num_predict:  2048,
        stream:       false,
      })

      let raw = await extractText(res)
      if (!raw) throw new Error('Empty response from llama-server.')

      // Strip <think> blocks and markdown formatting
      raw = raw
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json?\n?/gi, '')
        .replace(/```/gi, '')
        .trim()

      const jsonStart = raw.indexOf('{')
      const jsonEnd   = raw.lastIndexOf('}')
      if (jsonStart === -1 || jsonEnd === -1) {
        console.error('[analyze-flow] Raw response:', raw)
        throw new Error('No JSON found in response.')
      }

      const flowData = JSON.parse(raw.slice(jsonStart, jsonEnd + 1))
      return buildReactFlowGraph(flowData)

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
}

// ── React Flow graph builder ───────────────────────────────────────────────────
function buildReactFlowGraph({ nodes = [], edges = [] }) {
  const adjList  = {}
  const inDegree = {}

  nodes.forEach(n => { inDegree[n.id] = 0; adjList[n.id] = [] })
  edges.forEach(e => {
    inDegree[e.target] = (inDegree[e.target] ?? 0) + 1
    adjList[e.source]  = [...(adjList[e.source] ?? []), e.target]
  })

  // BFS level assignment
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
  const XGAP = 280, YGAP = 140, IX = 400, IY = 60

  nodes.forEach(n => {
    const lvl = level[n.id] ?? 0
    levelCols[lvl] = levelCols[lvl] === undefined ? 0 : levelCols[lvl] + 1
    const col = levelCols[lvl]
    const dir = col % 2 === 0 ? 1 : -1
    const steps = Math.ceil(col / 2)
    positions[n.id] = { x: IX + dir * steps * XGAP, y: IY + lvl * YGAP }
  })

  const rfNodes = nodes.map(n => ({
    id:       n.id,
    type:     'flowNode',
    position: positions[n.id] ?? { x: IX, y: IY },
    data: {
      nodeType:    n.type ?? 'call',
      label:       n.label ?? n.id,
      description: n.description ?? null,
      errorMsg:    n.errorMsg ?? null,
    },
  }))

  const rfEdges = edges.map(e => {
    const isError  = ['raises','error','catch'].includes(e.label)
    const isFalse  = ['false','no','else'].includes(e.label)
    return {
      id:           `${e.source}-${e.target}`,
      source:       e.source,
      target:       e.target,
      label:        e.label ?? '',
      animated:     !isError,
      type:         'smoothstep',
      labelStyle:   { fill: isError ? '#ef4444' : isFalse ? '#f59e0b' : '#6b7280', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: 'white', fillOpacity: 0.85 },
      labelBgPadding: [4, 3],
      style: {
        stroke:          isError ? '#ef4444' : isFalse ? '#f59e0b' : '#94a3b8',
        strokeWidth:     isError ? 2 : 1.5,
        strokeDasharray: isError ? '6 3' : undefined,
      },
    }
  })

  return { nodes: rfNodes, edges: rfEdges }
}

// electron/utils/vectorIndexer.cjs
// Incremental workspace embeddings using qwen3-embedding via Ollama.
// Sends progress events to the renderer: indexer:status
'use strict'
const fs     = require('fs-extra')
const path   = require('path')
const http   = require('http')
const crypto = require('crypto')

const SKIP   = new Set(['node_modules','.git','dist','build','.next','__pycache__','.venv','coverage','.cache','.godot'])
const EXTS   = new Set(['.js','.ts','.jsx','.tsx','.py','.rs','.go','.java','.c','.cpp','.h','.gd','.md','.json','.sql','.yaml','.yml','.toml'])
const MAX_CHUNK = 512  // tokens ≈ chars / 4, keep chunks small

let _running   = false
let _hashCache = {}  // path → md5

// ── Helpers ───────────────────────────────────────────────────────────────
function send(win, state, data = {}) {
  if (win && !win.isDestroyed()) win.webContents.send('indexer:status', { state, ...data })
}

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex')
}

async function walkFiles(root) {
  const out = []
  async function walk(dir) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (SKIP.has(e.name)) continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) { await walk(full) }
      else if (EXTS.has(path.extname(e.name).toLowerCase())) out.push(full)
    }
  }
  await walk(root)
  return out
}

async function embedChunk(text, model) {
  return new Promise(resolve => {
    const body = JSON.stringify({ model, prompt: text.slice(0, MAX_CHUNK * 4) })
    const opts = {
      hostname: '127.0.0.1', port: 11434, path: '/api/embeddings', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }
    const req = http.request(opts, res => {
      let raw = ''
      res.on('data', d => raw += d)
      res.on('end', () => {
        try { resolve(JSON.parse(raw).embedding ?? []) } catch { resolve([]) }
      })
    })
    req.on('error', () => resolve([]))
    req.setTimeout(10000, () => { req.destroy(); resolve([]) })
    req.write(body); req.end()
  })
}

// ── Vector DB (simple flat JSON store) ───────────────────────────────────
function getDbPath(root) {
  return path.join(root, '.cordex', 'vector_index.json')
}

async function loadDb(root) {
  try { return await fs.readJson(getDbPath(root)) } catch { return {} }
}

async function saveDb(root, db) {
  try { await fs.outputJson(getDbPath(root), db, { spaces: 2 }) } catch {}
}

// ── Public: run indexing ──────────────────────────────────────────────────
async function runIndex(win, projectRoot, embeddingModel, force = false) {
  if (_running) return
  if (!projectRoot) return

  _running = true
  send(win, 'scanning')

  try {
    const files    = await walkFiles(projectRoot)
    const db       = await loadDb(projectRoot)
    const toIndex  = []

    for (const f of files) {
      try {
        const content = await fs.readFile(f, 'utf8')
        const hash    = md5(content)
        if (!force && db[f]?.hash === hash) continue  // unchanged
        toIndex.push({ path: f, content, hash })
      } catch {}
    }

    if (toIndex.length === 0) { send(win, 'idle', { files: files.length, indexed: 0 }); _running = false; return }

    for (let i = 0; i < toIndex.length; i++) {
      const { path: fp, content, hash } = toIndex[i]
      const pct = Math.round(((i + 1) / toIndex.length) * 100)
      send(win, 'indexing', { current: i + 1, total: toIndex.length, pct, file: path.basename(fp) })

      const embedding = await embedChunk(content.slice(0, 4000), embeddingModel || 'qwen3-embedding:latest')
      db[fp] = { hash, embedding: embedding.slice(0, 32), updatedAt: Date.now() }  // store partial embedding
    }

    await saveDb(projectRoot, db)
    send(win, 'idle', { files: files.length, indexed: toIndex.length })
  } catch (err) {
    console.error('[indexer]', err.message)
    send(win, 'idle', { error: err.message })
  }

  _running = false
}

function flushAndReindex(win, projectRoot, embeddingModel) {
  _hashCache = {}
  return runIndex(win, projectRoot, embeddingModel, true)
}

module.exports = { runIndex, flushAndReindex, isRunning: () => _running }

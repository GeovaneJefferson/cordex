'use strict'
/**
 * embeddingIndex.cjs
 * Manages nomic-embed-text embeddings for the project repository.
 *
 * Storage: userData/embeddings.json  (flat JSON, fast for < 50k chunks)
 * Incremental: file hashes tracked — only re-embeds changed files.
 * Exposes events so the renderer can show indexing progress.
 */

const path   = require('path')
const fs     = require('fs-extra')
const crypto = require('crypto')
const { EventEmitter } = require('events')
const { chunkFile }    = require('./chunker.cjs')

const OLLAMA_BASE   = 'http://127.0.0.1:11434'
const EMBED_MODEL   = 'nomic-embed-text'
const SKIP_DIRS     = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', '.next', 'coverage'])
const SKIP_EXTS     = new Set(['png','jpg','jpeg','gif','webp','ico','svg','woff','woff2','ttf','eot','pdf','zip','tar','gz','db','sqlite'])
const MAX_FILE_SIZE = 300 * 1024  // 300 KB

// ── Helpers ────────────────────────────────────────────────────────────
function fileHash(content) {
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 12)
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na  += a[i] * a[i]
    nb  += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

// ── EmbeddingIndex class ───────────────────────────────────────────────
class EmbeddingIndex extends EventEmitter {
  constructor() {
    super()
    this._indexPath   = null   // set on first use
    this._chunks      = []     // Array<{ filePath, startLine, endLine, text, hash, embedding }>
    this._fileHashes  = {}     // filePath → sha1 of content
    this._loaded      = false
    this._indexing    = false
    this._abortFlag   = false
  }

  _getIndexPath() {
    if (this._indexPath) return this._indexPath
    const { app } = require('electron')
    this._indexPath = path.join(app.getPath('userData'), 'embeddings.json')
    return this._indexPath
  }

  // ── Persist / load ─────────────────────────────────────────────────
  async _load() {
    if (this._loaded) return
    this._loaded = true
    try {
      const p = this._getIndexPath()
      if (await fs.pathExists(p)) {
        const data = await fs.readJson(p)
        this._chunks     = data.chunks     ?? []
        this._fileHashes = data.fileHashes ?? {}
        console.log(`[embeddingIndex] loaded ${this._chunks.length} chunks`)
      }
    } catch (err) {
      console.warn('[embeddingIndex] load error:', err.message)
      this._chunks = []; this._fileHashes = {}
    }
  }

  async _save() {
    try {
      await fs.outputJson(this._getIndexPath(), { chunks: this._chunks, fileHashes: this._fileHashes })
    } catch (err) {
      console.warn('[embeddingIndex] save error:', err.message)
    }
  }

  // ── Embed a single text via Ollama ─────────────────────────────────
  async _embed(text) {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`)
    const data = await res.json()
    // nomic-embed-text returns { embeddings: [[...]] }
    return data.embeddings?.[0] ?? data.embedding ?? null
  }

  // ── Discover text files under projectRoot ─────────────────────────
  async _discoverFiles(projectRoot) {
    const result = []
    async function walk(dir) {
      let entries
      try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue
        const fullPath = path.join(dir, ent.name)
        if (ent.isDirectory()) {
          if (!SKIP_DIRS.has(ent.name)) await walk(fullPath)
        } else {
          const ext = path.extname(ent.name).slice(1).toLowerCase()
          if (SKIP_EXTS.has(ext)) continue
          let stat
          try { stat = await fs.stat(fullPath) } catch { continue }
          if (stat.size > MAX_FILE_SIZE) continue
          result.push(fullPath)
        }
      }
    }
    await walk(projectRoot)
    return result
  }

  // ── Full index / incremental update ──────────────────────────────
  /**
   * indexProject(projectRoot) → { indexed, skipped, total }
   * Incrementally embeds changed/new files, removes deleted ones.
   */
  async indexProject(projectRoot) {
    if (this._indexing) return { error: 'already indexing' }
    this._indexing = true
    this._abortFlag = false

    await this._load()

    let indexed = 0
    let skipped = 0
    let errors  = 0

    try {
      const filePaths = await this._discoverFiles(projectRoot)
      const total     = filePaths.length
      this.emit('progress', { phase: 'discovering', total, indexed: 0 })

      // Remove chunks for deleted files
      const pathSet = new Set(filePaths)
      this._chunks = this._chunks.filter(c => pathSet.has(c.filePath))
      for (const fp of Object.keys(this._fileHashes)) {
        if (!pathSet.has(fp)) delete this._fileHashes[fp]
      }

      for (let i = 0; i < filePaths.length; i++) {
        if (this._abortFlag) break
        const fp = filePaths[i]
        this.emit('progress', { phase: 'indexing', total, indexed: i, current: path.basename(fp) })

        try {
          const content = await fs.readFile(fp, 'utf8')
          const hash    = fileHash(content)

          if (this._fileHashes[fp] === hash) { skipped++; continue }  // unchanged

          // Remove old chunks for this file
          this._chunks = this._chunks.filter(c => c.filePath !== fp)

          // Chunk + embed
          const chunks = chunkFile(fp, content)
          for (const chunk of chunks) {
            if (this._abortFlag) break
            try {
              const embedding = await this._embed(chunk.text)
              if (embedding) {
                this._chunks.push({ ...chunk, hash, embedding })
                indexed++
              }
            } catch (e) {
              errors++
              console.warn(`[embeddingIndex] embed error for ${fp}:`, e.message)
            }
          }

          this._fileHashes[fp] = hash
        } catch (e) {
          errors++
          console.warn(`[embeddingIndex] file error ${fp}:`, e.message)
        }
      }

      await this._save()
      const result = { ok: true, indexed, skipped, errors, total: this._chunks.length }
      this.emit('done', result)
      return result
    } catch (err) {
      this.emit('error', err.message)
      return { ok: false, error: err.message }
    } finally {
      this._indexing = false
    }
  }

  abortIndexing() { this._abortFlag = true }

  // ── Single-file update (called after each save) ───────────────────
  async updateFile(filePath, content) {
    await this._load()
    const hash = fileHash(content)
    if (this._fileHashes[filePath] === hash) return  // no change

    this._chunks = this._chunks.filter(c => c.filePath !== filePath)

    const chunks = chunkFile(filePath, content)
    for (const chunk of chunks) {
      try {
        const embedding = await this._embed(chunk.text)
        if (embedding) this._chunks.push({ ...chunk, hash, embedding })
      } catch {}
    }

    this._fileHashes[filePath] = hash
    await this._save()
  }

  // ── Semantic search ───────────────────────────────────────────────
  /**
   * search(query, topK) → Array<{ filePath, startLine, endLine, text, score }>
   */
  async search(query, topK = 10) {
    await this._load()
    if (this._chunks.length === 0) return []

    let queryEmbed
    try {
      queryEmbed = await this._embed(query)
    } catch (err) {
      console.warn('[embeddingIndex] query embed error:', err.message)
      return []
    }

    const scored = this._chunks
      .filter(c => c.embedding?.length > 0)
      .map(c => ({ ...c, score: cosineSim(queryEmbed, c.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)

    return scored.map(c => ({
      filePath:  c.filePath,
      startLine: c.startLine,
      endLine:   c.endLine,
      text:      c.text,
      score:     Math.round(c.score * 1000) / 1000,
    }))
  }

  // ── Status ────────────────────────────────────────────────────────
  async status() {
    await this._load()
    return {
      chunks: this._chunks.length,
      files:  Object.keys(this._fileHashes).length,
      indexing: this._indexing,
    }
  }
}

// Singleton
const index = new EmbeddingIndex()
module.exports = index

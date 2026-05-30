// embeddingIndex.cjs (SQLite version)
'use strict'
const path = require('path')
const fs = require('fs-extra')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const { EventEmitter } = require('events')
const { chunkFile } = require('./chunker.cjs')

const OLLAMA_BASE = 'http://127.0.0.1:11434'
const EMBED_MODEL = 'qwen3-embedding:0.6b'
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv', 'venv', '.next', 'coverage'])
const SKIP_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot', 'pdf', 'zip', 'tar', 'gz', 'db', 'sqlite'])
const MAX_FILE_SIZE = 300 * 1024

function fileHash(content) {
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 12)
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

class EmbeddingIndex extends EventEmitter {
  constructor() {
    super()
    this._db = null
    this._indexing = false
    this._abortFlag = false
  }

  _getDb() {
    if (this._db) return this._db
    const { app } = require('electron')
    const dbPath = path.join(app.getPath('userData'), 'embeddings.db')
    this._db = new Database(dbPath)
    this._db.pragma('journal_mode = WAL')
    this._db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        filePath TEXT NOT NULL,
        startLine INTEGER NOT NULL,
        endLine INTEGER NOT NULL,
        text TEXT NOT NULL,
        hash TEXT,
        embedding TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(filePath);
    `)
    return this._db
  }

  async _embed(text) {
    const res = await fetch(`${OLLAMA_BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return data.embeddings?.[0] ?? data.embedding ?? null
  }

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
          let stat; try { stat = await fs.stat(fullPath) } catch { continue }
          if (stat.size > MAX_FILE_SIZE) continue
          result.push(fullPath)
        }
      }
    }
    await walk(projectRoot)
    console.log('[embeddingIndex] discovered', result.length, 'files');
    return result
  }

  async indexProject(projectRoot) {
    if (this._indexing) return { error: 'already indexing' }
    this._indexing = true
    this._abortFlag = false
    console.log('[embeddingIndex] indexProject STARTED');

    const db = this._getDb()
    let indexed = 0, skipped = 0, errors = 0

    try {
      const filePaths = await this._discoverFiles(projectRoot)
      const total = filePaths.length
      this.emit('progress', { phase: 'discovering', total, indexed: 0 })

      // Remove chunks for deleted files
      const pathSet = new Set(filePaths)
      db.prepare('DELETE FROM chunks WHERE filePath NOT IN (SELECT value FROM json_each(?))')
        .run(JSON.stringify([...pathSet]))

      for (let i = 0; i < filePaths.length; i++) {
        if (this._abortFlag) break
        const fp = filePaths[i]
        this.emit('progress', { phase: 'indexing', total, indexed: i, current: path.basename(fp) })

        try {
          const content = await fs.readFile(fp, 'utf8')
          const hash = fileHash(content)

          // Check if already up to date
          const existingHash = db.prepare('SELECT DISTINCT hash FROM chunks WHERE filePath = ?').pluck().get(fp)
          if (existingHash === hash) { skipped++; continue }

          // Delete old chunks for this file
          db.prepare('DELETE FROM chunks WHERE filePath = ?').run(fp)

          const chunks = chunkFile(fp, content)
          const insert = db.prepare('INSERT INTO chunks (filePath, startLine, endLine, text, hash, embedding) VALUES (?,?,?,?,?,?)')

          for (const chunk of chunks) {
            if (this._abortFlag) break
            try {
              const embedding = await this._embed(chunk.text)
              if (embedding) {
                insert.run(fp, chunk.startLine, chunk.endLine, chunk.text, hash, JSON.stringify(embedding))
                indexed++
              }
            } catch (e) {
              errors++
              console.warn(`[embeddingIndex] embed error for ${fp}:`, e.message)
            }
          }
        } catch (e) {
          errors++
          console.warn(`[embeddingIndex] file error ${fp}:`, e.message)
        }
      }

      const totalChunks = db.prepare('SELECT COUNT(*) FROM chunks').pluck().get()
      const result = { ok: true, indexed, skipped, errors, total: totalChunks }
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

  async updateFile(filePath, content) {
    const db = this._getDb()
    const hash = fileHash(content)
    const existingHash = db.prepare('SELECT hash FROM chunks WHERE filePath = ? LIMIT 1').pluck().get(filePath)
    if (existingHash === hash) return

    db.prepare('DELETE FROM chunks WHERE filePath = ?').run(filePath)
    const chunks = chunkFile(filePath, content)
    const insert = db.prepare('INSERT INTO chunks (filePath, startLine, endLine, text, hash, embedding) VALUES (?,?,?,?,?,?)')

    for (const chunk of chunks) {
      try {
        const embedding = await this._embed(chunk.text)
        if (embedding) insert.run(filePath, chunk.startLine, chunk.endLine, chunk.text, hash, JSON.stringify(embedding))
      } catch { }
    }
  }

  async search(query, topK = 10) {
    const db = this._getDb();
    // Only load up to 500 recent chunks as a simple cap
    const rows = db.prepare(
      'SELECT filePath, startLine, endLine, text, embedding FROM chunks WHERE embedding IS NOT NULL'
    ).all();
    if (rows.length === 0) return [];

    let queryEmbed;
    try { queryEmbed = await this._embed(query); } catch { return []; }

    const scored = rows.map(row => ({
      filePath: row.filePath,
      startLine: row.startLine,
      endLine: row.endLine,
      text: row.text,
      score: cosineSim(queryEmbed, JSON.parse(row.embedding)),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async status() {
    const db = this._getDb()
    const chunks = db.prepare('SELECT COUNT(*) FROM chunks').pluck().get()
    const files = db.prepare('SELECT COUNT(DISTINCT filePath) FROM chunks').pluck().get()
    return { chunks, files, indexing: this._indexing }
  }
}

module.exports = new EmbeddingIndex()
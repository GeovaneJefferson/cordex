'use strict'
const path = require('path')
const crypto = require('crypto')

const MAX_VERSIONS = 50
const MAX_FILE_SIZE = 500 * 1024
const SKIP_DIRS = new Set(['node_modules','.git','dist','build','__pycache__','.venv','venv','.next','coverage'])

// ── Try to load better-sqlite3; fall back to in-memory Map if it fails ──────
let Database = null
try {
  Database = require('better-sqlite3')
  console.log('[historyDb] better-sqlite3 loaded OK')
} catch (e) {
  console.error('[historyDb] better-sqlite3 failed to load — using in-memory fallback:', e.message)
  console.error('[historyDb] Run: ./node_modules/.bin/electron-rebuild  to fix native bindings')
}

let db = null

function getDb() {
  if (db) return db
  if (!Database) return null    // SQLite unavailable — caller handles null
  try {
    const { app } = require('electron')
    const dbPath = path.join(app.getPath('userData'), 'history.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        filePath  TEXT    NOT NULL,
        content   TEXT    NOT NULL,
        timestamp INTEGER NOT NULL,
        hash      TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_history_file ON history(filePath);
    `)
    // Safe migration: add hash column if it didn't exist yet
    try { db.exec('ALTER TABLE history ADD COLUMN hash TEXT') } catch {}
    console.log('[historyDb] SQLite DB ready:', dbPath)
    return db
  } catch (err) {
    console.error('[historyDb] getDb() failed:', err.message)
    db = null
    return null
  }
}

// ── In-memory fallback (used when SQLite is unavailable) ─────────────────────
// Structure: Map<filePath, Array<{id, content, timestamp, hash}>>
const _memStore = new Map()
let _memIdCounter = 1

function shouldTrack(fp, size) {
  if (size > MAX_FILE_SIZE) return false
  return !fp.replace(/\\/g,'/').split('/').some(p => SKIP_DIRS.has(p))
}

function contentHash(content) {
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 12)
}

// ── Public API ────────────────────────────────────────────────────────────────

async function saveSnapshot(filePath, content) {
  try {
    const size = Buffer.byteLength(content, 'utf8')
    if (!shouldTrack(filePath, size)) return false

    const hash = contentHash(content)
    const database = getDb()

    if (database) {
      // ── SQLite path ──
      const latest = database.prepare(
        'SELECT hash FROM history WHERE filePath = ? ORDER BY id DESC LIMIT 1'
      ).get(filePath)
      if (latest && latest.hash === hash) return false  // unchanged

      database.prepare(
        'INSERT INTO history (filePath, content, timestamp, hash) VALUES (?, ?, ?, ?)'
      ).run(filePath, content, Date.now(), hash)

      database.prepare(`
        DELETE FROM history WHERE filePath = ? AND id NOT IN (
          SELECT id FROM history WHERE filePath = ? ORDER BY id DESC LIMIT ?
        )
      `).run(filePath, filePath, MAX_VERSIONS)

      return true
    } else {
      // ── In-memory fallback ──
      const entries = _memStore.get(filePath) ?? []
      if (entries.length > 0 && entries[entries.length - 1].hash === hash) return false

      entries.push({ id: _memIdCounter++, content, timestamp: Date.now(), hash })
      if (entries.length > MAX_VERSIONS) entries.splice(0, entries.length - MAX_VERSIONS)
      _memStore.set(filePath, entries)
      return true
    }
  } catch (err) {
    console.warn('[historyDb] saveSnapshot error:', err.message)
    return false
  }
}

async function listSnapshots(filePath) {
  try {
    const database = getDb()
    if (database) {
      const rows = database.prepare(
        'SELECT id, timestamp, LENGTH(content) AS size FROM history WHERE filePath = ? ORDER BY id DESC LIMIT ?'
      ).all(filePath, MAX_VERSIONS)
      return rows.map(r => ({ id: r.id, timestamp: r.timestamp, size: r.size }))
    } else {
      const entries = _memStore.get(filePath) ?? []
      return [...entries].reverse().map(e => ({
        id: e.id,
        timestamp: e.timestamp,
        size: Buffer.byteLength(e.content, 'utf8'),
      }))
    }
  } catch (err) {
    console.warn('[historyDb] listSnapshots error:', err.message)
    return []
  }
}

async function restoreSnapshot(id, filePath) {
  try {
    const database = getDb()
    if (database) {
      const row = database.prepare('SELECT content FROM history WHERE id = ?').get(id)
      return row ? row.content : null
    } else {
      for (const entries of _memStore.values()) {
        const found = entries.find(e => e.id === id)
        if (found) return found.content
      }
      return null
    }
  } catch (err) {
    console.warn('[historyDb] restoreSnapshot error:', err.message)
    return null
  }
}

async function deleteSnapshot(id, filePath) {
  try {
    const database = getDb()
    if (database) {
      database.prepare('DELETE FROM history WHERE id = ? AND filePath = ?').run(id, filePath)
    } else {
      const entries = _memStore.get(filePath)
      if (entries) _memStore.set(filePath, entries.filter(e => e.id !== id))
    }
    return true
  } catch (err) {
    console.warn('[historyDb] deleteSnapshot error:', err.message)
    return false
  }
}

async function deleteAllForFile(filePath) {
  try {
    const database = getDb()
    if (database) {
      database.prepare('DELETE FROM history WHERE filePath = ?').run(filePath)
    } else {
      _memStore.delete(filePath)
    }
    return true
  } catch (err) {
    console.warn('[historyDb] deleteAllForFile error:', err.message)
    return false
  }
}

module.exports = { saveSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, deleteAllForFile }

'use strict'
/**
 * historyDb.cjs — SQLite-backed local file history.
 * Requires: better-sqlite3  (npm install better-sqlite3)
 *
 * Falls back to an in-memory Map if better-sqlite3 is not installed
 * so the app still starts — the user just loses persistence.
 */

const path  = require('path')
const zlib  = require('zlib')

let _db  = null   // better-sqlite3 instance
let _mem = null   // fallback Map<filePath, snapshot[]>

// ── Config ─────────────────────────────────────────────────────────────
const MAX_FILE_SIZE  = 500 * 1024        // 500 KB — skip large/binary files
const MAX_VERSIONS   = 50               // per-file retention
const MAX_DB_BYTES   = 100 * 1024 * 1024 // 100 MB global cap

const EXCLUDED_DIRS  = new Set([
  'node_modules', '.git', '.svn', '.hg',
  'dist', 'build', 'out', 'target', 'vendor',
  '__pycache__', '.venv', 'venv', 'env',
  '.next', '.nuxt', 'coverage', '.cache',
])

// ── DB init ────────────────────────────────────────────────────────────
function getDb() {
  if (_db !== null) return _db

  try {
    // Lazy import — app may not have installed better-sqlite3 yet
    const { app } = require('electron')
    const Database = require('better-sqlite3')
    const dbPath   = path.join(app.getPath('userData'), 'history.db')

    _db = new Database(dbPath)
    _db.pragma('journal_mode = WAL')
    _db.pragma('synchronous = NORMAL')
    _db.pragma('cache_size = -4000')   // 4 MB page cache

    _db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        filePath  TEXT    NOT NULL,
        timestamp INTEGER NOT NULL,
        content   BLOB    NOT NULL,
        size      INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_file
        ON snapshots (filePath, timestamp DESC);
    `)

    console.log('[historyDb] SQLite opened →', dbPath)
    return _db
  } catch (err) {
    console.warn('[historyDb] better-sqlite3 unavailable, using in-memory fallback:', err.message)
    console.warn('[historyDb] Run `npm install better-sqlite3` then restart to persist history.')
    _db = false   // mark as unavailable so we don't retry
    _mem = new Map()
    return null
  }
}

// ── Guards ─────────────────────────────────────────────────────────────
function shouldTrack(filePath, byteSize) {
  if (byteSize > MAX_FILE_SIZE) return false
  const parts = filePath.replace(/\\/g, '/').split('/')
  return !parts.some(p => EXCLUDED_DIRS.has(p))
}

// ── Prune helpers ──────────────────────────────────────────────────────
function pruneFile(db, filePath) {
  const rows = db.prepare(
    'SELECT id FROM snapshots WHERE filePath = ? ORDER BY timestamp DESC'
  ).all(filePath)
  if (rows.length > MAX_VERSIONS) {
    const ids = rows.slice(MAX_VERSIONS).map(r => r.id)
    db.prepare(`DELETE FROM snapshots WHERE id IN (${ids.join(',')})`).run()
  }
}

function pruneGlobal(db) {
  try {
    // Quick size estimate via page stats
    const { page_count, page_size } = db.prepare(
      'SELECT * FROM pragma_page_count() AS pc, pragma_page_size() AS ps'
    ).get() ?? {}
    const approxBytes = (page_count ?? 0) * (page_size ?? 4096)
    if (approxBytes > MAX_DB_BYTES) {
      // Delete oldest 10 %
      const total   = (db.prepare('SELECT COUNT(*) AS c FROM snapshots').get()?.c ?? 0)
      const toRemove = Math.ceil(total * 0.1)
      if (toRemove > 0) {
        db.prepare(
          'DELETE FROM snapshots WHERE id IN (SELECT id FROM snapshots ORDER BY timestamp ASC LIMIT ?)'
        ).run(toRemove)
      }
    }
  } catch {}
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * saveSnapshot(filePath, content) → boolean
 * Compresses and stores a snapshot.  Returns false if skipped/unavailable.
 */
function saveSnapshot(filePath, content) {
  const byteSize = Buffer.byteLength(content, 'utf8')
  if (!shouldTrack(filePath, byteSize)) return false

  const db = getDb()

  // ── SQLite path ──────────────────────────────────────────────────────
  if (db) {
    const compressed = zlib.deflateSync(Buffer.from(content, 'utf8'))
    db.prepare(
      'INSERT INTO snapshots (filePath, timestamp, content, size) VALUES (?, ?, ?, ?)'
    ).run(filePath, Date.now(), compressed, byteSize)
    pruneFile(db, filePath)
    pruneGlobal(db)
    return true
  }

  // ── In-memory fallback ───────────────────────────────────────────────
  if (_mem) {
    const list = _mem.get(filePath) ?? []
    list.unshift({ id: Date.now(), timestamp: Date.now(), content, size: byteSize })
    if (list.length > MAX_VERSIONS) list.length = MAX_VERSIONS
    _mem.set(filePath, list)
    return true
  }

  return false
}

/**
 * listSnapshots(filePath) → Array<{ id, timestamp, size }>
 */
function listSnapshots(filePath) {
  const db = getDb()
  if (db) {
    return db.prepare(
      'SELECT id, timestamp, size FROM snapshots WHERE filePath = ? ORDER BY timestamp DESC'
    ).all(filePath)
  }
  if (_mem) {
    return (_mem.get(filePath) ?? []).map(s => ({ id: s.id, timestamp: s.timestamp, size: s.size }))
  }
  return []
}

/**
 * restoreSnapshot(id) → string | null
 */
function restoreSnapshot(id) {
  const db = getDb()
  if (db) {
    const row = db.prepare('SELECT content FROM snapshots WHERE id = ?').get(id)
    if (!row) return null
    return zlib.inflateSync(row.content).toString('utf8')
  }
  if (_mem) {
    for (const list of _mem.values()) {
      const s = list.find(x => x.id === id)
      if (s) return s.content
    }
  }
  return null
}

/**
 * deleteSnapshot(id)
 */
function deleteSnapshot(id) {
  const db = getDb()
  if (db) { db.prepare('DELETE FROM snapshots WHERE id = ?').run(id); return }
  if (_mem) {
    for (const [fp, list] of _mem.entries()) {
      const idx = list.findIndex(x => x.id === id)
      if (idx !== -1) { list.splice(idx, 1); _mem.set(fp, list); return }
    }
  }
}

/**
 * deleteAllForFile(filePath)
 */
function deleteAllForFile(filePath) {
  const db = getDb()
  if (db) { db.prepare('DELETE FROM snapshots WHERE filePath = ?').run(filePath); return }
  if (_mem) _mem.delete(filePath)
}

module.exports = { saveSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, deleteAllForFile }

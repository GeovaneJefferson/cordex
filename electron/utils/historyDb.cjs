'use strict'
const path = require('path')
const crypto = require('crypto')
const Database = require('better-sqlite3')

const MAX_VERSIONS = 50
const MAX_FILE_SIZE = 500 * 1024
const SKIP_DIRS = new Set(['node_modules','.git','dist','build','__pycache__','.venv','venv','.next','coverage'])

let db
function getDb() {
  if (db) return db
  const { app } = require('electron')
  const dbPath = path.join(app.getPath('userData'), 'history.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filePath TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      hash TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_history_file ON history(filePath);
  `)
  // If the table already existed without the hash column, add it.
  // This is safe because we use IF NOT EXISTS.
  try {
    db.exec('ALTER TABLE history ADD COLUMN hash TEXT')
  } catch (e) {
    // column already exists → ignore
  }
  return db
}

function shouldTrack(fp, size) {
  if (size > MAX_FILE_SIZE) return false
  return !fp.replace(/\\/g,'/').split('/').some(p => SKIP_DIRS.has(p))
}

function contentHash(content) {
  return crypto.createHash('sha1').update(content).digest('hex').slice(0, 12)
}

// ── Public API (same signature as JSON version) ──────────────────────
async function saveSnapshot(filePath, content) {
  try {
    const size = Buffer.byteLength(content, 'utf8')
    if (!shouldTrack(filePath, size)) return false

    const db = getDb()
    const hash = contentHash(content)

    // Get the most recent snapshot for this file
    const latest = db.prepare(
      'SELECT hash FROM history WHERE filePath = ? ORDER BY id DESC LIMIT 1'
    ).get(filePath)

    // If the hash matches the last snapshot, skip – content hasn't changed
    if (latest && latest.hash === hash) return false

    const insert = db.prepare(
      'INSERT INTO history (filePath, content, timestamp, hash) VALUES (?, ?, ?, ?)'
    )
    insert.run(filePath, content, Date.now(), hash)

    // Keep only the last MAX_VERSIONS entries for this file
    db.prepare(`
      DELETE FROM history WHERE filePath = ? AND id NOT IN (
        SELECT id FROM history WHERE filePath = ? ORDER BY id DESC LIMIT ?
      )
    `).run(filePath, filePath, MAX_VERSIONS)

    return true
  } catch (err) {
    console.warn('[historyDb] saveSnapshot error:', err.message)
    return false
  }
}

async function listSnapshots(filePath) {
  try {
    const rows = getDb().prepare(
      'SELECT id, timestamp, LENGTH(content) AS size FROM history WHERE filePath = ? ORDER BY id DESC LIMIT ?'
    ).all(filePath, MAX_VERSIONS)
    return rows.map(r => ({ id: r.id, timestamp: r.timestamp, size: r.size }))
  } catch { return [] }
}

async function restoreSnapshot(id, filePath) {
  try {
    const row = getDb().prepare('SELECT content FROM history WHERE id = ?').get(id)
    return row ? row.content : null
  } catch { return null }
}

async function deleteSnapshot(id, filePath) {
  try {
    getDb().prepare('DELETE FROM history WHERE id = ? AND filePath = ?').run(id, filePath)
    return true
  } catch { return false }
}

async function deleteAllForFile(filePath) {
  try {
    getDb().prepare('DELETE FROM history WHERE filePath = ?').run(filePath)
    return true
  } catch { return false }
}

module.exports = { saveSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot, deleteAllForFile }
'use strict'
/**
 * chunker.cjs — Language-agnostic code chunker for the embedding pipeline.
 *
 * Strategy (in order of preference):
 * 1. Structural chunking — detect top-level functions / classes / blocks
 *    using heuristic regex patterns per language family.
 * 2. Line-based fallback — sliding window of CHUNK_LINES lines with OVERLAP overlap.
 *
 * Each chunk is { filePath, startLine, endLine, text }.
 */

const path = require('path')

// ── Config ─────────────────────────────────────────────────────────────
const CHUNK_LINES   = 60   // target lines per chunk (fallback mode)
const OVERLAP_LINES = 10   // overlap between consecutive chunks
const MIN_LINES     = 4    // ignore trivially short chunks
const MAX_CHUNK_CHARS = 3000  // hard cap to keep tokens sane

// ── Language families → top-level block patterns ───────────────────────
// Each pattern matches the START of a top-level definition.
const LANG_PATTERNS = {
  // C-style: function/class/struct/impl at column 0 or minimal indent
  c_style: /^(?:(?:pub(?:\s+(?:unsafe|extern|async))?\s+)?(?:fn|async\s+fn|def|class|struct|enum|impl(?:\s+\w+\s+for)?|interface|module|namespace|object)\s+\w|\w[\w<>,\s]*\s+\w+\s*\()/m,

  // Python: def/class at column 0
  python: /^(?:def |class |async def )/m,

  // JavaScript/TypeScript: function/class/export
  js: /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\s+\w|class\s+\w|const\s+\w+\s*=\s*(?:async\s+)?\(|(?:module\.exports|exports)\s*=)/m,

  // Go
  go: /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+/m,

  // Java/Kotlin/C#/Swift: access modifier + type + name
  jvm: /^(?:(?:public|private|protected|internal|override|static|abstract|final|sealed)\s+)*(?:class|interface|enum|record|struct|fun|func|def)\s+\w/m,

  // Rust
  rust: /^(?:pub(?:\s*\(crate\))?\s+)?(?:fn|struct|enum|impl|trait|mod)\s+\w/m,

  // Shell
  shell: /^\w[\w_-]*\s*\(\s*\)/m,
}

// ── Extension → language family ────────────────────────────────────────
function extToFamily(ext) {
  const map = {
    js: 'js', jsx: 'js', ts: 'js', tsx: 'js', cjs: 'js', mjs: 'js',
    py: 'python', pyx: 'python', pyi: 'python',
    c: 'c_style', cpp: 'c_style', h: 'c_style', hpp: 'c_style', cc: 'c_style',
    java: 'jvm', kt: 'jvm', kts: 'jvm', cs: 'jvm', scala: 'jvm', groovy: 'jvm',
    go: 'go',
    rs: 'rust',
    sh: 'shell', bash: 'shell',
    swift: 'jvm', dart: 'jvm', rb: 'python', lua: 'shell',
    gd: 'python',   // GDScript is Python-like
    gdscript: 'python',
  }
  return map[ext] ?? null
}

// ── Structural chunker ─────────────────────────────────────────────────
function structuralChunk(lines, family, filePath) {
  const pattern = LANG_PATTERNS[family]
  if (!pattern) return null

  const chunks = []
  const startLines = []

  lines.forEach((line, i) => {
    if (pattern.test(line)) startLines.push(i)
  })

  if (startLines.length < 2) return null  // not enough structure, fall back

  for (let s = 0; s < startLines.length; s++) {
    const startLine = startLines[s]
    const endLine   = s + 1 < startLines.length ? startLines[s + 1] - 1 : lines.length - 1
    const slice     = lines.slice(startLine, endLine + 1)

    if (slice.length < MIN_LINES) continue

    const text = slice.join('\n').slice(0, MAX_CHUNK_CHARS)
    chunks.push({ filePath, startLine: startLine + 1, endLine: endLine + 1, text })
  }

  return chunks.length > 0 ? chunks : null
}

// ── Line-based fallback chunker ────────────────────────────────────────
function lineChunk(lines, filePath) {
  const chunks = []
  let i = 0
  while (i < lines.length) {
    const end  = Math.min(i + CHUNK_LINES, lines.length)
    const slice = lines.slice(i, end)
    if (slice.filter(l => l.trim()).length >= MIN_LINES) {
      const text = slice.join('\n').slice(0, MAX_CHUNK_CHARS)
      chunks.push({ filePath, startLine: i + 1, endLine: end, text })
    }
    i = end - OVERLAP_LINES
    if (i <= 0) i = end  // safety
  }
  return chunks
}

// ── Main export ────────────────────────────────────────────────────────
/**
 * chunkFile(filePath, content) → Array<{ filePath, startLine, endLine, text }>
 */
function chunkFile(filePath, content) {
  const lines  = content.split('\n')
  const ext    = path.extname(filePath).slice(1).toLowerCase()
  const family = extToFamily(ext)

  if (family) {
    const chunks = structuralChunk(lines, family, filePath)
    if (chunks) return chunks
  }

  return lineChunk(lines, filePath)
}

/**
 * chunkFiles(files) → Array<chunk>
 * files: Array<{ path, content }>
 */
function chunkFiles(files) {
  return files.flatMap(f => {
    try { return chunkFile(f.path, f.content) }
    catch { return [] }
  })
}

module.exports = { chunkFile, chunkFiles }

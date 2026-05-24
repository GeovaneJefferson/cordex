'use strict'
/**
 * retrieval.cjs
 * Retrieval layer: semantic search + context assembly for the coding agent.
 *
 * Never dumps the full repo.  Always returns a compact, relevant excerpt.
 */

const path  = require('path')
const index = require('./embeddingIndex.cjs')

const TOP_K          = 12     // max chunks retrieved
const MAX_CTX_CHARS  = 6000   // hard limit on assembled context string
const SCORE_FLOOR    = 0.20   // ignore chunks below this similarity

/**
 * buildContext(query, projectRoot) → string
 *
 * Searches the embedding index for relevant chunks, deduplicates,
 * ranks, and assembles a compact context string to inject into the LLM prompt.
 */
async function buildContext(query, projectRoot) {
  const hits = await index.search(query, TOP_K)

  // Filter weak matches
  const relevant = hits.filter(h => h.score >= SCORE_FLOOR)
  if (relevant.length === 0) return ''

  // Deduplicate overlapping chunks from same file (keep highest score)
  const seen  = new Map()  // filePath → set of line ranges
  const deduped = []
  for (const hit of relevant) {
    const key = `${hit.filePath}:${hit.startLine}-${hit.endLine}`
    if (!seen.has(key)) {
      seen.set(key, true)
      deduped.push(hit)
    }
  }

  // Assemble context string, respecting MAX_CTX_CHARS
  let ctx   = ''
  let chars = 0
  for (const hit of deduped) {
    // Make path relative to projectRoot if possible
    const relPath = projectRoot
      ? path.relative(projectRoot, hit.filePath)
      : hit.filePath

    const block = `// ${relPath}  (lines ${hit.startLine}-${hit.endLine})\n${hit.text}\n\n`
    if (chars + block.length > MAX_CTX_CHARS) break
    ctx   += block
    chars += block.length
  }

  return ctx.trim()
}

/**
 * buildContextForChunks(chunks) → string
 * Direct assembly from an already-retrieved chunk array (used when caller already ran search).
 */
function buildContextForChunks(chunks, projectRoot) {
  let ctx   = ''
  let chars = 0
  for (const hit of chunks) {
    if (hit.score < SCORE_FLOOR) continue
    const relPath = projectRoot ? path.relative(projectRoot, hit.filePath) : hit.filePath
    const block   = `// ${relPath}  (lines ${hit.startLine}-${hit.endLine})\n${hit.text}\n\n`
    if (chars + block.length > MAX_CTX_CHARS) break
    ctx   += block
    chars += block.length
  }
  return ctx.trim()
}

module.exports = { buildContext, buildContextForChunks }

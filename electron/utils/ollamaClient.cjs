'use strict'

/**
 * Ollama client — connects to Ollama on :11434 (replaces llama-server :8080).
 */

const OLLAMA_BASE = 'http://127.0.0.1:11434'

let _online = null  // true | false | null (unknown)

async function resolveBackend() {
  try {
    const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(1500) })
    if (r.ok) {
      if (_online !== true) console.log('[ollamaClient] Ollama :11434 → online')
      _online = true
      return true
    }
  } catch {}
  _online = false
  return false
}

function resetBackendCache() {
  _online = null
}

async function llamaGenerate({
  model,
  prompt,
  stream = false,
  signal,
  temperature,
  num_predict = 1024,
  systemPrompt,
} = {}) {
  const online = await resolveBackend()
  if (!online) throw new Error('Ollama is not running. Start it with: ollama serve')

  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  return fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream,
      options: {
        temperature: temperature ?? 0.1,
        num_predict,
      },
    }),
  })
}

async function extractText(res) {
  const data = await res.json()
  return data.message?.content ?? ''
}

async function* streamText(res) {
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const t = line.trim()
      if (!t) continue
      try {
        const obj = JSON.parse(t)
        const delta = obj.message?.content ?? ''
        if (delta) yield delta
        if (obj.done) return
      } catch {}
    }
  }
}

async function pingBackend() {
  resetBackendCache()
  const online = await resolveBackend()
  if (!online) return { ok: false, backend: null, model: null, gpuLayers: 0 }

  try {
    const tagsRes = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(2000) })
    const data = tagsRes.ok ? await tagsRes.json() : {}
    const models = (data.models ?? []).map(m => m.name)
    const model = models[0] ?? 'unknown'
    return { ok: true, backend: 'ollama', model, gpuLayers: 0 }
  } catch {
    return { ok: true, backend: 'ollama', model: 'unknown', gpuLayers: 0 }
  }
}

module.exports = { llamaGenerate, extractText, streamText, pingBackend, resolveBackend, resetBackendCache }

'use strict'

/**
 * llama.cpp client — connects to llama-server on :8080 (OpenAI-compatible API).
 */

const LLAMA_BASE = 'http://127.0.0.1:8080'

let _online = null  // true | false | null (unknown)

async function resolveBackend() {
  try {
    const r = await fetch(`${LLAMA_BASE}/health`, { signal: AbortSignal.timeout(1500) })
    if (r.ok || r.status === 200) {
      if (_online !== true) console.log('[llamaCpp] llama-server :8080 → online')
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
  if (!online) throw new Error('llama-server is not running. Start it on port 8080.')

  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  return fetch(`${LLAMA_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      messages,
      stream,
      temperature: temperature ?? 0.1,
      max_tokens: num_predict,
      cache_prompt: true,
    }),
  })
}

async function extractText(res) {
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
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
      if (!t || t === 'data: [DONE]') continue
      try {
        const raw = t.startsWith('data: ') ? t.slice(6) : t
        const obj = JSON.parse(raw)
        const delta = obj.choices?.[0]?.delta?.content ?? ''
        if (delta) yield delta
        if (obj.choices?.[0]?.finish_reason === 'stop') return
      } catch {}
    }
  }
}

async function pingBackend() {
  resetBackendCache()
  const online = await resolveBackend()
  if (!online) return { ok: false, backend: null, model: null, gpuLayers: 0 }

  try {
    const [propsRes, modelRes] = await Promise.allSettled([
      fetch(`${LLAMA_BASE}/props`,     { signal: AbortSignal.timeout(2000) }),
      fetch(`${LLAMA_BASE}/v1/models`, { signal: AbortSignal.timeout(2000) }),
    ])
    const props  = propsRes.status  === 'fulfilled' && propsRes.value.ok  ? await propsRes.value.json()  : {}
    const models = modelRes.status  === 'fulfilled' && modelRes.value.ok  ? await modelRes.value.json()  : {}
    const gpuLayers = props.n_gpu_layers ?? props.total_slots ?? 0
    const model     = models.data?.[0]?.id ?? 'unknown'
    return { ok: true, backend: 'llama', model, gpuLayers }
  } catch {
    return { ok: true, backend: 'llama', model: 'unknown', gpuLayers: 0 }
  }
}

module.exports = { llamaGenerate, extractText, streamText, pingBackend, resolveBackend, resetBackendCache }

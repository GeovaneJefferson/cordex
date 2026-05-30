'use strict'
const OLLAMA_BASE = 'http://127.0.0.1:11434'

async function ollamaGenerate({ model, prompt, stream = false, signal, temperature, num_predict = 1024 }) {
  const body = JSON.stringify({
    model,
    prompt,
    stream,
    keep_alive: '5m',
    options: {
      num_predict: stream ? 1024 : num_predict,
      num_ctx: 8192,
      temperature: temperature !== undefined ? temperature : (stream ? 0.1 : 0.15),
      top_p: 0.9,
      stop: ['```\n\n', '---\n\n'],
    },
  })

  const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal,
  })

  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`)
  return res
}

module.exports = { ollamaGenerate }
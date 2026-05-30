// electron/handlers/chatHandler.cjs
'use strict'
const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const { loadSettings } = require('../utils/settings.cjs')
const { ollamaChat } = require('../utils/ollamaClient.cjs')

const EXCLUDE_PATTERNS = [
  '**/node_modules/**', '**/.venv/**', '**/env/**', '**/__pycache__/**',
  '**/build/**', '**/dist/**', '**/target/**', '**/vendor/**',
  '**/.git/**', '**/.svn/**', '**/.hg/**', '**/package-lock.json', '**/yarn.lock'
]

let currentController = null

const SYSTEM_RULES = `You are a precision coding assistant. Rules:
- Answer directly and concisely — no preamble, no summaries, no filler.
- Never restate the question. Get to the point immediately.
- When referencing code, cite specific line numbers (e.g. "line 42").
- Do NOT provide code unless the user explicitly asks for it.
- Keep responses short. Use bullet points only when listing multiple distinct items.
- If asked to explain a file, give a 2-3 sentence summary of its purpose.
- Separate distinct ideas with a blank line between paragraphs.
- If the user message includes <tool_call>...<tool_call>, that content is your internal thought process and should NOT be included in your final answer. Only respond with the content outside of those tags.
- If you encounter an error or something you can't handle, respond with a concise error message starting with "Error: " followed by a brief explanation.
CRITICAL: When you output code inside markdown code blocks, NEVER include line numbers. Output raw code only. For example, write "def foo():" not "1: def foo():". 
`

class ThinkingParser {
  constructor(onThinking, onContent) {
    this._onThinking = onThinking
    this._onContent  = onContent
    this._buf        = ''
    this._inThink    = false
  }

  feed(chunk) {
    this._buf += chunk
    this._drain()
  }

  end() {
    if (this._buf) {
      this._inThink ? this._onThinking(this._buf) : this._onContent(this._buf)
      this._buf = ''
    }
  }

  _drain() {
    while (true) {
      if (this._inThink) {
        const close = this._buf.indexOf('</think>')
        if (close === -1) {
          const safe = Math.max(0, this._buf.length - 8)
          if (safe > 0) { this._onThinking(this._buf.slice(0, safe)); this._buf = this._buf.slice(safe) }
          break
        }
        this._onThinking(this._buf.slice(0, close))
        this._buf     = this._buf.slice(close + 8)
        this._inThink = false
      } else {
        const open = this._buf.indexOf('<think>')
        if (open === -1) {
          const safe = Math.max(0, this._buf.length - 7)
          if (safe > 0) { this._onContent(this._buf.slice(0, safe)); this._buf = this._buf.slice(safe) }
          break
        }
        if (open > 0) this._onContent(this._buf.slice(0, open))
        this._buf     = this._buf.slice(open + 7)
        this._inThink = true
      }
    }
  }
}

module.exports = function(mainWindow) {
  // --- IPC Handlers ---
  ipcMain.on('ai:chatStream:start', async (event, { messages, context }) => {
    console.log('[chatHandler] Received chat request:', messages?.length, 'messages')
    if (currentController) currentController.abort()
    const controller = new AbortController()
    currentController = controller

    const settings = loadSettings()
    const model = settings.chatModel || settings.analysisModel || settings.flowModel || 'qwen2.5-coder:7b'

    try {
      // Build base context (SYSTEM_RULES + current file ONLY – no project tree)
      const baseContext = await buildChatContext(context.projectRoot, context.currentFile, context.selection)

      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null
      let additionalContext = ''
      let cleanedUserContent = lastMsg?.content || ''

      if (lastMsg && lastMsg.role === 'user' && context.projectRoot) {
        const { mentions, cleaned } = parseMentions(lastMsg.content, context.projectRoot)
        cleanedUserContent = cleaned
        if (mentions.length > 0) {
          additionalContext = await buildMentionsContext(mentions, context.projectRoot)
        }
      }

      const fullSystemContent = additionalContext
        ? baseContext + '\n\n' + additionalContext
        : baseContext

      // Build Ollama messages array
      const ollamaMessages = [{ role: 'system', content: fullSystemContent }]

      const history = messages.slice(-7, -1)   // last 6 messages (exclude the current user message)
      for (const m of history) {
        let content = m.content
        if (m.role === 'assistant' && content.length > 500) {
          content = content.slice(0, 500) + '…'
        }
        ollamaMessages.push({ role: m.role === 'user' ? 'user' : 'assistant', content })
      }
      ollamaMessages.push({ role: 'user', content: cleanedUserContent })

      // Stream from Ollama
      const response = await ollamaChat({
        model,
        messages: ollamaMessages,
        temperature: 0.1,
        num_predict: 8192,
        stream: true,
        signal: controller.signal,
      })

      const parser = new ThinkingParser(
        (text) => event.sender.send('ai:chatStream:thinking', text),
        (text) => event.sender.send('ai:chatStream:chunk', text),
      )

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const json = JSON.parse(line)
              if (json.message?.content) {
                parser.feed(json.message.content)
              }
              if (json.done) {
                parser.end()
                event.sender.send('ai:chatStream:done')
                return
              }
            } catch {}
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          parser.end()
          event.sender.send('ai:chatStream:done')
          return
        }
        console.error('[chatHandler] Stream read error:', err.message)
        event.sender.send('ai:chatStream:error', err.message)
        return
      } finally {
        reader.releaseLock()
        try { await response.body.cancel() } catch {}
        if (currentController === controller) currentController = null
      }

      parser.end()
      event.sender.send('ai:chatStream:done')
    } catch (err) {
      console.error('[chatHandler] Top-level error:', err.message)
      event.sender.send('ai:chatStream:error', err.message)
    } finally {
      if (currentController === controller) currentController = null
    }
  })

  ipcMain.on('ai:chatStream:abort', () => {
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  })
}

// ---------- Helper functions ----------
// Build base context: only SYSTEM_RULES + current file (no project tree)
async function buildChatContext(projectRoot, currentFile, selection) {
  let context = SYSTEM_RULES

  // Do NOT add project file tree here – it's only added via @allproject mention
  if (selection) {
    const relativePath = projectRoot ? path.relative(projectRoot, currentFile) : path.basename(currentFile)
    context += `\n\nSELECTED CODE from "${relativePath}":\n\`\`\`\n${selection.slice(0, 4000)}\n\`\`\``
  } else if (currentFile && fs.existsSync(currentFile)) {
    const stat = fs.statSync(currentFile)
    if (stat.size < 100_000) {
      const content = await fs.readFile(currentFile, 'utf8')
      const relativePath = projectRoot ? path.relative(projectRoot, currentFile) : path.basename(currentFile)
      const numbered = content.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')
      context += `\n\nACTIVE FILE "${relativePath}" (line-numbered):\n\`\`\`\n${numbered.slice(0, 6000)}\n\`\`\``
    }
  }
  return context
}

function parseMentions(message, projectRoot) {
  const mentionRegex = /@(\S+)/g
  const mentions = []
  let match
  while ((match = mentionRegex.exec(message)) !== null) {
    const token = match[1]
    if (token === 'allproject') {
      mentions.push({ type: 'allproject' })
      continue
    }
    const candidate = path.resolve(projectRoot, token)
    if (!candidate.startsWith(projectRoot)) continue
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate)
      mentions.push({ type: stat.isDirectory() ? 'directory' : 'file', resolvedPath: candidate })
    }
  }
  const cleaned = message.replace(mentionRegex, '').replace(/\s{2,}/g, ' ').trim()
  return { mentions, cleaned }
}

async function buildMentionsContext(mentions, projectRoot) {
  let context = ''
  for (const mention of mentions) {
    if (mention.type === 'allproject') {
      context += await buildAllProjectContext(projectRoot)
    } else if (mention.type === 'file') {
      const relPath = path.relative(projectRoot, mention.resolvedPath)
      try {
        const stat = fs.statSync(mention.resolvedPath)
        const maxSize = 100_000
        const content = await fs.readFile(mention.resolvedPath, 'utf8')
        const raw = stat.size > maxSize ? content.slice(0, maxSize) + '\n... (file truncated)' : content
        const numbered = raw.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')
        context += `\n--- Full content of "${relPath}" (line-numbered) ---\n\`\`\`\n${numbered}\n\`\`\`\n`
      } catch (err) {
        context += `\nCould not read file "${relPath}": ${err.message}\n`
      }
    } else if (mention.type === 'directory') {
      const relPath = path.relative(projectRoot, mention.resolvedPath)
      const tree = await getQuickFileTree(mention.resolvedPath, 3)
      context += `\nDirectory "${relPath}" file tree:\n${tree}\n`
      const fileContents = await getDirectoryContents(mention.resolvedPath, 5000)
      if (fileContents) context += `\nFirst lines of files:\n${fileContents}\n`
    }
  }
  if (context.length > 14000) {
    context = context.slice(0, 14000) + '\n... (mention context truncated)'
  }
  return context
}

async function buildAllProjectContext(projectRoot) {
  let ctx = `\n--- @allproject summary ---\n`
  const tree = await getQuickFileTree(projectRoot, 4)
  ctx += `Full file tree:\n${tree}\n`
  const keyFiles = ['package.json', 'tsconfig.json', 'tsconfig.node.json', 'vite.config.ts', '.gitignore', 'README.md', 'idea.md']
  for (const file of keyFiles) {
    const filePath = path.join(projectRoot, file)
    if (fs.existsSync(filePath)) {
      try {
        const content = await fs.readFile(filePath, 'utf8')
        ctx += `\n--- ${file} ---\n\`\`\`\n${content.slice(0, 1500)}\n\`\`\`\n`
      } catch {}
    }
  }
  const sourceFiles = await getSourceFiles(projectRoot)
  let snippetAcc = ''
  let fileCount = 0
  for (const file of sourceFiles) {
    if (fileCount >= 100) break
    try {
      const content = await fs.readFile(file, 'utf8')
      const lines = content.split('\n').slice(0, 30).join('\n')
      const relPath = path.relative(projectRoot, file)
      snippetAcc += `\n--- ${relPath} (first 30 lines) ---\n\`\`\`\n${lines}\n\`\`\`\n`
      fileCount++
    } catch {}
  }
  if (snippetAcc) ctx += `\nSource file previews (limited to 100 files):\n${snippetAcc}`
  if (ctx.length > 14000) ctx = ctx.slice(0, 14000) + '\n... (@allproject summary truncated)'
  return ctx
}

async function getSourceFiles(root) {
  const files = []
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(root, fullPath)
      if (shouldExclude(relPath)) continue
      if (entry.isDirectory()) {
        await walk(fullPath)
      } else if (isTextFile(entry.name)) {
        files.push(fullPath)
      }
    }
  }
  await walk(root)
  return files
}

function isTextFile(name) {
  const ext = path.extname(name).toLowerCase()
  const textExtensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.cjs', '.mjs', '.css', '.html', '.md', '.txt', '.py', '.rs', '.go', '.java', '.c', '.cpp', '.h', '.yml', '.yaml', '.toml', '.xml', '.svg']
  return textExtensions.includes(ext) || name === 'LICENSE' || name === '.env'
}

async function getDirectoryContents(dir, maxChars) {
  let result = ''
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (result.length >= maxChars) break
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && isTextFile(entry.name)) {
      try {
        const content = await fs.readFile(fullPath, 'utf8')
        const snippet = content.slice(0, 200)
        result += `\n${entry.name}: ${snippet}`
      } catch {}
    }
  }
  return result.length > 0 ? result : null
}

async function getQuickFileTree(dir, maxDepth, currentDepth = 0) {
  if (currentDepth > maxDepth) return ''
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    let output = ''
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (shouldExclude(path.relative(dir, fullPath))) continue
      const indent = '  '.repeat(currentDepth)
      if (entry.isDirectory()) {
        output += `${indent}📁 ${entry.name}/\n`
        if (currentDepth < maxDepth) {
          output += await getQuickFileTree(fullPath, maxDepth, currentDepth + 1)
        }
      } else {
        output += `${indent}📄 ${entry.name}\n`
      }
    }
    return output
  } catch { return '' }
}

function shouldExclude(relativePath) {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.endsWith('/**') && relativePath.startsWith(pattern.replace('/**', ''))) return true
    if (pattern.startsWith('**/') && relativePath.endsWith(pattern.replace('**/', ''))) return true
    if (relativePath === pattern) return true
  }
  return false
}
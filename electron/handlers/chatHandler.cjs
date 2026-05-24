// electron/handlers/chatHandler.cjs
'use strict'
const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate } = require('../utils/ollamaClient.cjs')

const EXCLUDE_PATTERNS = [
  '**/node_modules/**', '**/.venv/**', '**/env/**', '**/__pycache__/**',
  '**/build/**', '**/dist/**', '**/target/**', '**/vendor/**',
  '**/.git/**', '**/.svn/**', '**/.hg/**', '**/package-lock.json', '**/yarn.lock'
]

let currentController = null

module.exports = function(mainWindow) {
  ipcMain.on('ai:chatStream:start', async (event, { messages, context }) => {
    console.log('[chatHandler] Received chat request:', messages.length, 'messages')
    if (currentController) currentController.abort()
    const controller = new AbortController()
    currentController = controller

    const settings = loadSettings()
    const model = settings.chatModel || settings.analysisModel || settings.flowModel || 'qwen2.5-coder:7b'

    try {
      // 1. Build base system prompt (project tree + current file info)
      const systemPrompt = await buildChatContext(context.projectRoot, context.currentFile)

      // 2. Parse @mentions from the last user message
      const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null
      let additionalContext = ''
      let cleanedMessage = lastMsg?.content || ''

      if (lastMsg && lastMsg.role === 'user' && context.projectRoot) {
        const { mentions, cleaned } = parseMentions(lastMsg.content, context.projectRoot)
        cleanedMessage = cleaned
        if (mentions.length > 0) {
          additionalContext = await buildMentionsContext(mentions, context.projectRoot)
        }
      }

      const fullSystemPrompt = additionalContext
        ? systemPrompt + '\n\n' + additionalContext
        : systemPrompt

      // 3. Build conversation (last 6 messages, truncate long assistant replies)
      const recent = messages.slice(-6)
      const conversation = recent.map((m, i) => {
        let content = m.content
        if (i === recent.length - 1 && m.role === 'user') {
          content = cleanedMessage   // use cleaned message
        }
        if (m.role === 'assistant' && content.length > 300) {
          content = content.slice(0, 300) + '…'
        }
        return `${m.role === 'user' ? 'User' : 'Assistant'}: ${content}`
      }).join('\n')

      const prompt = `${fullSystemPrompt}\n\nConversation:\n${conversation}\nAssistant:`

      const response = await llamaGenerate({
        model,
        prompt,
        temperature: 0.1,
        num_predict: 2048,
        stream: true,
        signal: controller.signal,
      })

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
                event.sender.send('ai:chatStream:chunk', json.message.content)
              }
              if (json.done) {
                event.sender.send('ai:chatStream:done')
                return
              }
            } catch {}
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
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
      event.sender.send('ai:chatStream:done')
    } catch (err) {
      if (err.name === 'AbortError') {
        event.sender.send('ai:chatStream:done')
        return
      }
      console.error('[chatHandler] Error:', err.message)
      event.sender.send('ai:chatStream:error', err.message)
    }
  })

  ipcMain.on('ai:chatStream:abort', () => {
    if (currentController) {
      currentController.abort()
      currentController = null
    }
  })
}

// ══════════════════════════════════════════════════════════════════
//  Context Builder (unchanged – project tree + current file)
// ══════════════════════════════════════════════════════════════════
async function buildChatContext(projectRoot, currentFile) {
  let context = `You are a project‑aware coding assistant. Follow these rules strictly:
- Answer the user's last question directly.
- If the user asks "What files are in this project?" or similar, list the files from the PROJECT FILE TREE below. Do NOT guess or invent files.
- Do NOT provide code unless the user explicitly asks for it.
- Keep answers concise (1-3 sentences). No unnecessary examples.
- If the user asks to explain a file, describe its purpose without reprinting the entire file.`

  if (projectRoot && fs.existsSync(projectRoot)) {
    const projectName = path.basename(projectRoot)
    const fileTree = await getQuickFileTree(projectRoot, 4)
    context += `\n\nPROJECT FILE TREE:\n${fileTree}`
  } else {
    context += '\n\nNo project is currently open. Ask the user to open one if needed.'
  }

  // (We keep the current file info, but it will be superseded if the user mentions it)
  if (currentFile && fs.existsSync(currentFile)) {
    const stat = fs.statSync(currentFile)
    if (stat.size < 100_000) {
      const content = await fs.readFile(currentFile, 'utf8')
      const relativePath = projectRoot ? path.relative(projectRoot, currentFile) : path.basename(currentFile)
      context += `\n\nThe user has the file "${relativePath}" open. Content (first 2000 chars):\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``
    }
  }

  return context
}

// ══════════════════════════════════════════════════════════════════
//  Mention parsing & resolution (NEW)
// ══════════════════════════════════════════════════════════════════
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
    if (!candidate.startsWith(projectRoot)) continue  // security
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
        const maxSize = 100_000   // 100 KB – you can increase this if needed
        const content = await fs.readFile(mention.resolvedPath, 'utf8')
        const snippet = stat.size > maxSize ? content.slice(0, maxSize) + '\n... (file truncated)' : content
        context += `\n--- Full content of "${relPath}" ---\n\`\`\`\n${snippet}\n\`\`\`\n`
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
  // Cap total additional context to avoid token overflow
  if (context.length > 12000) {
    context = context.slice(0, 12000) + '\n... (mention context truncated)'
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
  // Source file previews (first 30 lines, up to 100 files)
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
  if (ctx.length > 12000) ctx = ctx.slice(0, 12000) + '\n... (@allproject summary truncated)'
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
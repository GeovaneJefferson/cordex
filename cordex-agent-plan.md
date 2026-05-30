# Cordex Agent Implementation Plan

Adapting the DeepSeek agent guide to your **actual** codebase.

---

## What you already have (don't rebuild)

| DeepSeek suggests building | You already have it |
|---|---|
| `agentManager.js` with LLM call | `aiRouter.cjs` — already routes to correct model |
| `embeddingIndex.search()` | `embeddingIndex.cjs` — SQLite + nomic-embed-text, full cosine search |
| Context assembly | `retrieval.cjs` → `buildContext(query, projectRoot)` |
| Code chunker | `chunker.cjs` — language-aware, 60-line chunks with overlap |
| Streaming | `ollamaClient.cjs` → `llamaGenerate`, `streamText`, `extractText` |
| Plan → TODO list UI | `BugFixModal.tsx` + `ai:plan-todos` IPC — phases: planning → review → executing → done |
| Preload bridge | `preload.cjs` — `planTodos`, `bugFixCode`, `chatStream`, `agentRun` (partial) |

**The DeepSeek guide is building from zero. You're building from 80%.**

---

## What's actually missing

1. `agentHandler.cjs` — the IPC handler that runs the full loop
2. `agent:write-file` and `agent:search` tools wired as IPC
3. `useAgent` hook in the renderer
4. `AgentPopover.tsx` wired to real state (currently a static mockup)

---

## Step 1 — Create `electron/handlers/agentHandler.cjs`

This replaces DeepSeek's `agentManager.js`. Uses your existing services instead of rolling new ones.

```js
'use strict'
const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs-extra')
const { execSync } = require('child_process')
const { loadSettings } = require('../utils/settings.cjs')
const { llamaGenerate, extractText } = require('../utils/ollamaClient.cjs')
const { buildContext } = require('../services/retrieval.cjs')     // ← already exists
const embeddingIndex = require('../services/embeddingIndex.cjs') // ← already exists

// ── Tool implementations ───────────────────────────────────────────────────
async function toolReadFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8')
  return content.slice(0, 8000)
}

async function toolWriteFile(filePath, content) {
  await fs.writeFile(filePath, content, 'utf8')
  return 'ok'
}

async function toolSearchProject(projectRoot, pattern) {
  try {
    const out = execSync(
      `grep -rn ${JSON.stringify(pattern)} ${JSON.stringify(projectRoot)} --include="*.ts" --include="*.tsx" --include="*.js" --include="*.py" -l`,
      { timeout: 5000, encoding: 'utf8' }
    )
    return out.trim().split('\n').filter(Boolean)
  } catch { return [] }
}

async function toolRunCode(code, lang) {
  // Delegate to the existing flow:run handler
  // (avoid duplicating executeCode logic)
  return { note: 'Delegate to flow:run IPC from renderer' }
}

const TOOLS = {
  read_file:      ({ path: p })             => toolReadFile(p),
  write_file:     ({ path: p, content: c }) => toolWriteFile(p, c),
  search_project: ({ projectRoot, pattern }) => toolSearchProject(projectRoot, pattern),
}

// ── JSON extraction (reuse same approach as flowHandler) ──────────────────
function extractJson(raw) {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```json?\n?/gi, '').replace(/```/gi, '').trim()
  const match = cleaned.match(/\{[\s\S]*"todos"[\s\S]*\}/)
  if (!match) throw new Error('No JSON with todos found')
  return JSON.parse(match[0])
}

// ── Core agent loop ────────────────────────────────────────────────────────
async function runAgentLoop(event, { goal, code, filePath, projectRoot }, maxSteps = 6) {
  const settings = loadSettings()
  const model = settings.analysisModel || settings.chatModel || 'qwen2.5-coder:7b'

  // Phase 1: RAG — get relevant context from the embedding index
  // This is the key advantage over the DeepSeek guide: you don't pass
  // the whole file, you retrieve only the relevant chunks.
  let ragContext = ''
  try {
    ragContext = await buildContext(goal, projectRoot)
  } catch { /* embedding may not be indexed yet, continue without */ }

  // Phase 2: Plan — ask model to produce a TODO list with tool calls
  const planPrompt = [
    ragContext ? `Relevant codebase context:\n${ragContext}\n` : '',
    `Current file: ${filePath}`,
    '```',
    (code || '').slice(0, 4000),
    '```',
    '',
    `Goal: ${goal}`,
    '',
    'Return ONLY a JSON object:',
    '{"todos":[{"id":"1","label":"short title","description":"what to do","tool":"read_file|write_file|search_project|run_code","args":{}}]}',
  ].join('\n')

  const planRes = await llamaGenerate({
    model,
    systemPrompt: 'You are a coding agent. Plan the steps to achieve the goal. Output ONLY valid JSON, no prose.',
    prompt: planPrompt,
    temperature: 0,
    num_predict: 1024,
    stream: false,
  })

  let todos
  try {
    const parsed = extractJson(await extractText(planRes))
    todos = (parsed.todos || []).map((t, i) => ({
      id: String(t.id ?? i + 1),
      label: t.label || `Step ${i + 1}`,
      description: t.description || '',
      tool: t.tool || 'read_file',
      args: t.args || {},
      status: 'pending',
    }))
  } catch (err) {
    event.sender.send('agent:error', `Planning failed: ${err.message}`)
    return
  }

  // Send plan to UI — BugFixModal shows it as the review phase
  event.sender.send('agent:plan', todos)

  // Phase 3: Execute each step
  for (let i = 0; i < Math.min(todos.length, maxSteps); i++) {
    const todo = todos[i]
    event.sender.send('agent:step:start', todo.id)

    try {
      const toolFn = TOOLS[todo.tool]
      if (!toolFn) throw new Error(`Unknown tool: ${todo.tool}`)
      const result = await toolFn(todo.args)
      event.sender.send('agent:step:done', { id: todo.id, result })
    } catch (err) {
      event.sender.send('agent:step:error', { id: todo.id, error: err.message })
      // Don't abort — let the loop continue to remaining steps
    }
  }

  event.sender.send('agent:done')
}

// ── IPC registration ───────────────────────────────────────────────────────
module.exports = function () {
  ipcMain.on('agent:run', (event, payload) => {
    runAgentLoop(event, payload).catch(err =>
      event.sender.send('agent:error', err.message)
    )
  })

  ipcMain.handle('agent:write-file', async (_ev, { filePath, content }) => {
    await fs.writeFile(filePath, content, 'utf8')
    return { ok: true }
  })

  ipcMain.handle('agent:search', async (_ev, { projectRoot, pattern }) => {
    const files = await toolSearchProject(projectRoot, pattern)
    return { ok: true, files }
  })
}
```

Register it in `electron/main.cjs` alongside the other handlers:

```js
require('./handlers/agentHandler.cjs')()
```

---

## Step 2 — Add the preload bridge

Add to `electron/preload.cjs` inside the `Cordex.ai` object:

```js
agentRun: (payload, callbacks) => {
  const { onPlan, onStepStart, onStepDone, onStepError, onDone, onError } = callbacks || {}

  ipcRenderer.send('agent:run', payload)

  const handlers = {
    'agent:plan':       (_e, plan)            => onPlan?.(plan),
    'agent:step:start': (_e, id)              => onStepStart?.(id),
    'agent:step:done':  (_e, { id, result })  => onStepDone?.(id, result),
    'agent:step:error': (_e, { id, error })   => onStepError?.(id, error),
    'agent:done':       ()                    => { cleanup(); onDone?.() },
    'agent:error':      (_e, err)             => { cleanup(); onError?.(err) },
  }

  const cleanup = () =>
    Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.removeListener(ch, fn))
  Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.on(ch, fn))

  return cleanup
},

writeFile:     (p) => ipcRenderer.invoke('agent:write-file', p),
searchProject: (p) => ipcRenderer.invoke('agent:search', p),
```

---

## Step 3 — Add `useAgent` hook

Create `src/hooks/useAgent.ts`:

```ts
import { useCallback } from 'react';
import { useAppState } from '../store/AppContext';

const Cordex = (window as any).Cordex;

export function useAgent() {
  const { state, dispatch } = useAppState();

  const runAgent = useCallback(async (goal: string) => {
    const activeTab = state.tabs.find(t => t.id === state.activeTabId);
    if (!activeTab) return;

    // Reuse BugFixModal — open in planning phase
    dispatch({ type: 'OPEN_BUG_FIX_MODAL' });

    const cleanup = Cordex?.ai?.agentRun(
      {
        goal,
        code: activeTab.content,
        filePath: activeTab.path,
        projectRoot: state.projectRoot,
      },
      {
        onPlan: (todos: any[]) => {
          dispatch({ type: 'SET_BUG_FIX_TODOS', todos });
        },
        onStepStart: (id: string) => {
          dispatch({ type: 'SET_TODO_STATUS', id, status: 'running' });
        },
        onStepDone: (id: string) => {
          dispatch({ type: 'SET_TODO_STATUS', id, status: 'done' });
        },
        onStepError: (id: string) => {
          dispatch({ type: 'SET_TODO_STATUS', id, status: 'error' });
        },
        onDone: () => {
          dispatch({ type: 'SET_BUG_FIX_PHASE', phase: 'done' });
        },
        onError: (err: string) => {
          dispatch({ type: 'SET_BUG_FIX_ERROR', error: err });
        },
      }
    );

    return cleanup;
  }, [state, dispatch]);

  return { runAgent };
}
```

---

## Step 4 — Wire `AgentPopover.tsx`

Replace the static mockup with real state. The goal input → `runAgent(goal)`:

```tsx
import { useAgent } from '../hooks/useAgent';

export const AgentPopover: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const { runAgent } = useAgent();

  const handleRun = async () => {
    if (!goal.trim() || running) return;
    setRunning(true);
    setVisible(false); // BugFixModal takes over the UI
    await runAgent(goal);
    setRunning(false);
  };

  // ... render: textarea for goal, "Execute Agent Loop" button calls handleRun
};
```

The **BugFixModal already handles the full UI** — planning spinner, todo list review, step-by-step animation, done state. You get it for free. `AgentPopover` is just the entry point.

---

## Step 5 — Make the embedding index available

DeepSeek's guide skips this, but it's the most important part. Your `embeddingIndex` needs to be indexed before `buildContext` returns anything useful.

The UI for this already exists (`ai:embed-project` IPC in `aiRouter.cjs`). Just make sure the user triggers it once per project. You can prompt automatically when a project is opened:

```js
// In main.cjs, after project root is set:
ipcMain.on('project:opened', (_ev, { projectRoot }) => {
  embeddingIndex.buildIndex(projectRoot)
    .then(() => mainWin.webContents.send('agent:index-ready'))
    .catch(console.error)
})
```

---

## Key differences from DeepSeek's guide

| DeepSeek guide | Your actual implementation |
|---|---|
| Build `AgentManager` class from scratch | Use `agentHandler.cjs` + existing `aiRouter.cjs` |
| Call `embeddingIndex.search()` directly | Use `retrieval.cjs` → `buildContext()` — already deduped, scored, and truncated |
| Roll your own JSON extraction | Reuse `robustJsonExtract` from `flowHandler.cjs` |
| Build a new HTML panel | Reuse `BugFixModal` — already has planning/review/execute/done phases |
| New streaming setup | Use `llamaGenerate` + `streamText` from `ollamaClient.cjs` |
| Context menu integration (renderer-side) | Wire to `AgentPopover.tsx` → `useAgent` hook |

---

## File checklist

```
NEW:
  electron/handlers/agentHandler.cjs
  src/hooks/useAgent.ts

MODIFY:
  electron/main.cjs              → register agentHandler
  electron/preload.cjs           → add agentRun, writeFile, searchProject
  src/components/AgentPopover.tsx → wire goal input to useAgent

REUSE AS-IS (no changes):
  electron/services/embeddingIndex.cjs
  electron/services/retrieval.cjs
  electron/services/chunker.cjs
  electron/utils/ollamaClient.cjs
  src/components/BugFixModal.tsx
  src/store/reducer.ts (agent dispatches same actions as BugFix)
```

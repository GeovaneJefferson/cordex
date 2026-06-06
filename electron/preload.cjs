'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('Cordex', {
  ai: {
    complete:  (p) => ipcRenderer.invoke('ai:complete', p),
    analyze:   (p) => ipcRenderer.invoke('ai:analyze', p),
    abort:     (k) => ipcRenderer.send('ai:abort', k),
    ping:      ()  => ipcRenderer.invoke('ai:ping'),
    docstring: (p) => ipcRenderer.invoke('ai:docstring', p),
    fixError:    (p) => ipcRenderer.invoke('ai:fix-error', p),
    bugFixCode:  (p) => ipcRenderer.invoke('ai:bug-fix-code', p),
    planTodos:   (p) => ipcRenderer.invoke('ai:plan-todos', p),

    // ── Agent ──────────────────────────────────────────────────────────
    agentRun: (payload, callbacks) => {
      const { onPlan, onStepStart, onStepDone, onStepError, onDone, onError, onReport, onFileChanged } = callbacks || {}

      ipcRenderer.send('agent:run', payload)

      const handlers = {
        'agent:plan':       (_e, plan)             => onPlan?.(plan),
        'agent:step:start': (_e, id)               => onStepStart?.(id),
        'agent:step:done':  (_e, { id, result })   => onStepDone?.(id, result),
        'agent:step:error': (_e, { id, error })    => onStepError?.(id, error),
        'agent:done':       ()                     => { cleanup(); onDone?.() },
        'agent:report':     (_e, report)           => onReport?.(report),
        'agent:error':      (_e, err)              => { cleanup(); onError?.(err) },
        'agent:file-changed': (_e, fp)               => onFileChanged?.(fp),
      }

      const cleanup = () =>
        Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.removeListener(ch, fn))
      Object.entries(handlers).forEach(([ch, fn]) => ipcRenderer.on(ch, fn))

      return cleanup
    },

    agentToggle:  (p) => ipcRenderer.send('agent:toggle', p),
    agentFileSaved: (p) => ipcRenderer.send('agent:file-saved', p),
    writeFile:     (p) => ipcRenderer.invoke('agent:write-file', p),
    searchProject: (p) => ipcRenderer.invoke('agent:search', p),
    onChunk: (cb) => { ipcRenderer.on('ai:analyze:chunk', (_e, c) => cb(c)) },
    documentProject: (root, model) => ipcRenderer.invoke('ai:document-project', { projectRoot: root, model }),
    chatStream: (payload, callbacks) => {
      const { onChunk, onDone, onError, onThinking } = callbacks || {};
     
      ipcRenderer.send('ai:chatStream:start', payload);

      const chunkHandler    = (_e, text) => onChunk?.(text);
      const thinkingHandler = (_e, text) => onThinking?.(text);
      const doneHandler = () => {
        ipcRenderer.removeListener('ai:chatStream:chunk',    chunkHandler);
        ipcRenderer.removeListener('ai:chatStream:thinking', thinkingHandler);
        ipcRenderer.removeListener('ai:chatStream:done',     doneHandler);
        ipcRenderer.removeListener('ai:chatStream:error',    errorHandler);
        onDone?.();
      };
      const errorHandler = (_e, err) => { doneHandler(); onError?.(err); };

      ipcRenderer.on('ai:chatStream:chunk',    chunkHandler);
      ipcRenderer.on('ai:chatStream:thinking', thinkingHandler);
      ipcRenderer.on('ai:chatStream:done',     doneHandler);
      ipcRenderer.on('ai:chatStream:error',    errorHandler);

      return () => {
        ipcRenderer.removeListener('ai:chatStream:chunk',    chunkHandler);
        ipcRenderer.removeListener('ai:chatStream:thinking', thinkingHandler);
        ipcRenderer.removeListener('ai:chatStream:done',     doneHandler);
        ipcRenderer.removeListener('ai:chatStream:error',    errorHandler);
        ipcRenderer.send('ai:chatStream:abort');
      };
    },

    // ── AI Router (autocomplete + reasoning agent + embeddings) ──────
    autocomplete: (p) => ipcRenderer.invoke('ai:autocomplete', p),
    autocompleteAbort: () => ipcRenderer.send('ai:autocomplete:abort'),

    reason: (payload, callbacks) => {
      const { onChunk, onDone, onError } = callbacks || {};
      ipcRenderer.invoke('ai:reason', payload).then(result => {
        onDone?.(result);
      }).catch(err => onError?.(err?.message));

      const chunkHandler = (_e, text) => onChunk?.(text);
      ipcRenderer.on('ai:reason:chunk', chunkHandler);
      const doneHandler  = () => { ipcRenderer.removeListener('ai:reason:chunk', chunkHandler); ipcRenderer.removeListener('ai:reason:done', doneHandler); };
      ipcRenderer.on('ai:reason:done', doneHandler);
      return () => { ipcRenderer.send('ai:reason:abort'); doneHandler(); };
    },
    reasonAbort: () => ipcRenderer.send('ai:reason:abort'),

    embedProject: (projectRoot) => ipcRenderer.invoke('ai:embed-project', { projectRoot }),
    embedUpdateFile: (filePath, content) => ipcRenderer.invoke('ai:embed-update-file', { filePath, content }),
    embedAbort: () => ipcRenderer.send('ai:embed-abort'),
    retrievalStatus: () => ipcRenderer.invoke('ai:retrieval-status'),
    retrievalSearch: (query, topK) => ipcRenderer.invoke('ai:retrieval-search', { query, topK }),

    onEmbedProgress: (cb) => { const fn = (_e, d) => cb(d); ipcRenderer.on('ai:embed:progress', fn); return () => ipcRenderer.removeListener('ai:embed:progress', fn); },
    onEmbedDone:     (cb) => { const fn = (_e, d) => cb(d); ipcRenderer.on('ai:embed:done', fn);     return () => ipcRenderer.removeListener('ai:embed:done', fn); },
    onReasonChunk:   (cb) => { const fn = (_e, t) => cb(t); ipcRenderer.on('ai:reason:chunk', fn);   return () => ipcRenderer.removeListener('ai:reason:chunk', fn); },
  },

  agents: {
    toggle: (type, enabled) => ipcRenderer.send('agent:toggle', { type, enabled }),
    onIssue: (cb) => {
      const fn = (_e, issue) => cb(issue);
      ipcRenderer.on('agent:issue', fn);
      return () => ipcRenderer.removeListener('agent:issue', fn);
    },
    fixIssue: (payload) => ipcRenderer.invoke('agent:fix-issue', payload),
  },

  // ═══════════════════════ Git ═══════════════════════
  git: {
    status:       (cwd)        => ipcRenderer.invoke('git:status', { cwd }),
    diff:         (cwd, path, staged) => ipcRenderer.invoke('git:diff', { cwd, filePath: path, staged }),
    stage:        (cwd, path)  => ipcRenderer.invoke('git:stage', { cwd, filePath: path }),
    unstage:      (cwd, path)  => ipcRenderer.invoke('git:unstage', { cwd, filePath: path }),
    stageAll:     (cwd)        => ipcRenderer.invoke('git:stage-all', { cwd }),
    discard:      (cwd, path)  => ipcRenderer.invoke('git:discard', { cwd, filePath: path }),
    commit:       (cwd, msg)   => ipcRenderer.invoke('git:commit', { cwd, message: msg }),
    push:         (cwd)        => ipcRenderer.invoke('git:push', { cwd }),
    pull:         (cwd)        => ipcRenderer.invoke('git:pull', { cwd }),
    log:          (cwd, limit) => ipcRenderer.invoke('git:log', { cwd, limit }),
    init:         (cwd)        => ipcRenderer.invoke('git:init', { cwd }),
    branchList:   (cwd)        => ipcRenderer.invoke('git:branch-list', { cwd }),
    createBranch: (cwd, name)  => ipcRenderer.invoke('git:create-branch', { cwd, name }),
    checkout:     (cwd, name)  => ipcRenderer.invoke('git:checkout', { cwd, name }),
    merge:        (cwd, branch)=> ipcRenderer.invoke('git:merge', { cwd, branch }),
    untrack:      (cwd, path)  => ipcRenderer.invoke('git:untrack', { cwd, filePath: path }),
  },

  // ═══════════════════════ Local History ═══════════════════════
  history: {
    save:    (args)              => ipcRenderer.invoke('history:save',    args),
    list:    (filePath)          => ipcRenderer.invoke('history:list',    filePath),
    restore: (id, filePath)      => ipcRenderer.invoke('history:restore', { id, filePath }),
    delete:  (args)              => ipcRenderer.invoke('history:delete',  args),
  },

  // ═══════════════════════ LSP ═══════════════════════
  lsp: {
    connect: (language, projectRoot) => ipcRenderer.invoke('lsp:connect', { language, projectRoot }),
    sendRequest: (language, method, params) => ipcRenderer.invoke('lsp:send', { language, method, params }),
    startPython: (projectRoot) => ipcRenderer.invoke('lsp:start-python', { projectRoot }),
    stopPython:  () => ipcRenderer.send('lsp:stop-python'),
  },

  fs: {
    openProject:    ()         => ipcRenderer.invoke('fs:openProject'),
    openFileDialog: ()         => ipcRenderer.invoke('fs:openFileDialog'),
    readDir:        (d)        => ipcRenderer.invoke('fs:readDir', d),
    readFile:       (p)        => ipcRenderer.invoke('fs:readFile', p),
    writeFile:      (p, c)     => ipcRenderer.invoke('fs:writeFile', { filePath: p, content: c }),
    saveAs:         (n)        => ipcRenderer.invoke('fs:saveAs', n),
    createFile:     (d, n)     => ipcRenderer.invoke('fs:createFile', { dirPath: d, name: n }),
    createFolder:   (d, n)     => ipcRenderer.invoke('fs:createFolder', { dirPath: d, name: n }),
    rename:         (op, nn)   => ipcRenderer.invoke('fs:rename', { oldPath: op, newName: nn }),
    delete:         (p)        => ipcRenderer.invoke('fs:delete', p),
    move:           (s, d)     => ipcRenderer.invoke('fs:move', { srcPath: s, destDir: d }),
    search:         (params)   => ipcRenderer.invoke('fs:search', params),
    watch:          (d)        => ipcRenderer.invoke('fs:watch', d),
    unwatch:        (d)        => ipcRenderer.invoke('fs:unwatch', d),
    mkdir:          (p)        => ipcRenderer.invoke('fs:mkdir', { dirPath: p }),
    onFsChanged:    (cb)       => {
      const fn = (_e, p) => cb(p);
      ipcRenderer.on('fs:changed', fn);
      return () => ipcRenderer.removeListener('fs:changed', fn);
    },
    stopWatch:      ()         => ipcRenderer.invoke('fs:stopWatch'),
    revealInExplorer: (p)      => ipcRenderer.invoke('fs:revealInExplorer', p),
    generateProjectDocs: (root) => ipcRenderer.invoke('fs:generateProjectDocs', root),
    onChange: (cb) => {
      const fn = (_e, ev) => cb(ev)
      ipcRenderer.on('fs:changed', fn)
      return () => ipcRenderer.removeListener('fs:changed', fn)
    },
  },
  terminal: {
    create:  (id, cwd, cols, rows) => ipcRenderer.invoke('terminal:create', { id, cwd, cols, rows }),
    write:   (id, data)            => ipcRenderer.send('terminal:write', { id, data }),
    resize:  (id, cols, rows)      => ipcRenderer.invoke('terminal:resize', { id, cols, rows }),
    destroy: (id)                  => ipcRenderer.invoke('terminal:destroy', { id }),
    onData: (id, cb) => {
      const ch = `terminal:data:${id}`
      const fn = (_e, d) => cb(d)
      ipcRenderer.on(ch, fn)
      return () => ipcRenderer.removeListener(ch, fn)
    },
    onExit: (id, cb) => {
      const ch = `terminal:exit:${id}`
      const fn = (_e, d) => cb(d)
      ipcRenderer.on(ch, fn)
      return () => ipcRenderer.removeListener(ch, fn)
    },
  },
  hardware: {
    info:        () => ipcRenderer.invoke('hardware:info'),
    redetect:    () => ipcRenderer.invoke('hardware:redetect'),
    checkModels: () => ipcRenderer.invoke('hardware:checkModels'),
    onDetected: (cb) => { ipcRenderer.on('hw:detected', (_e, hw) => cb(hw)) },
  },
  settings: {
    get: ()  => ipcRenderer.invoke('settings:get'),
    set: (u) => ipcRenderer.invoke('settings:set', u),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close:    () => ipcRenderer.send('window:close'),
  },
  ollama: {
    list: () => ipcRenderer.invoke('ollama:list'),
    ping: () => ipcRenderer.invoke('ollama:ping'),
  },
  session: {
    save: (data) => ipcRenderer.invoke('session:save', data),
    load: ()     => ipcRenderer.invoke('session:load'),
  },
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  profile: {
    get:        ()     => ipcRenderer.invoke('profile:get'),
    chatModels: ()     => ipcRenderer.invoke('profile:chat-models'),
    modelParams:(id)   => ipcRenderer.invoke('profile:model-params', { identifier: id }),
  },
  indexer: {
    start:  (root, force) => ipcRenderer.send('indexer:start', { projectRoot: root, force: !!force }),
    setRoot:(root)         => ipcRenderer.send('indexer:set-root', { projectRoot: root }),
    onStatus: (cb) => {
      const fn = (_e, data) => cb(data);
      ipcRenderer.on('indexer:status', fn);
      return () => ipcRenderer.removeListener('indexer:status', fn);
    },
  },
  onSetupProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('setup:progress', listener);
    return () => ipcRenderer.removeListener('setup:progress', listener);
  },
  on: (channel, callback) => {
    const listener = (_event, ...args) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
})

contextBridge.exposeInMainWorld('electronAPI', {
  saveFlow:       (fh, fd) => ipcRenderer.invoke('save-flow',    fh, fd),
  loadFlow:       (fh)    => ipcRenderer.invoke('load-flow',    fh),
  analyzeFlow:    (p)     => ipcRenderer.invoke('analyze-flow', p),
  runFlow:        (p)     => ipcRenderer.invoke('flow:run',         p),
  simulateFlow:   (p) => ipcRenderer.invoke('flow:simulate',    p),
  detectFlowMode: (p) => ipcRenderer.invoke('flow:detect-mode', p),
  deleteFlow:     (fh)     => ipcRenderer.invoke('delete-flow', fh),
  ollamaStatus:   ()       => ipcRenderer.invoke('ollama-status'),
  systemMemory:   ()       => ipcRenderer.invoke('system-memory'),
  execCommand:    (c, d)   => ipcRenderer.invoke('exec-command', c, d),
})
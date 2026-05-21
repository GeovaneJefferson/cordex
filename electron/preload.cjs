'use strict'
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('Cordex', {
  ai: {
    complete:  (p) => ipcRenderer.invoke('ai:complete', p),
    analyze:   (p) => ipcRenderer.invoke('ai:analyze', p),
    abort:     (k) => ipcRenderer.send('ai:abort', k),
    ping:      ()  => ipcRenderer.invoke('ai:ping'),
    docstring: (p) => ipcRenderer.invoke('ai:docstring', p),
    fixError:  (p) => ipcRenderer.invoke('ai:fix-error', p),
    onChunk: (cb) => { ipcRenderer.on('ai:analyze:chunk', (_e, c) => cb(c)) },
  },
  fs: {
    openProject:  ()          => ipcRenderer.invoke('fs:openProject'),
    readDir:      (d)         => ipcRenderer.invoke('fs:readDir', d),
    readFile:     (p)         => ipcRenderer.invoke('fs:readFile', p),
    writeFile:    (p, c)      => ipcRenderer.invoke('fs:writeFile', { filePath: p, content: c }),
    createFile:   (d, n)      => ipcRenderer.invoke('fs:createFile', { dirPath: d, name: n }),
    createFolder: (d, n)      => ipcRenderer.invoke('fs:createFolder', { dirPath: d, name: n }),
    rename:       (op, nn)    => ipcRenderer.invoke('fs:rename', { oldPath: op, newName: nn }),
    delete:       (p)         => ipcRenderer.invoke('fs:delete', p),
    move:         (s, d)      => ipcRenderer.invoke('fs:move', { srcPath: s, destDir: d }),
    search:       (params)    => ipcRenderer.invoke('fs:search', params),
    watch:        (d)         => ipcRenderer.invoke('fs:watch', d),
    stopWatch:    ()          => ipcRenderer.invoke('fs:stopWatch'),
    revealInExplorer: (p) => ipcRenderer.invoke('fs:revealInExplorer', p),
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
  llama: {
    start:      (opts)   => ipcRenderer.invoke('llama:start', opts),
    stop:       ()       => ipcRenderer.invoke('llama:stop'),
    status:     ()       => ipcRenderer.invoke('llama:status'),
    saveConfig: (cfg)    => ipcRenderer.invoke('llama:save-config', cfg),
    onStatus: (cb) => {
      const fn = (_e, d) => cb(d)
      ipcRenderer.on('llama:status-changed', fn)
      return () => ipcRenderer.removeListener('llama:status-changed', fn)
    },
  },
  // Session persistence
  session: {
    save: (data) => ipcRenderer.invoke('session:save', data),
    load: ()     => ipcRenderer.invoke('session:load'),
  },
})

contextBridge.exposeInMainWorld('electronAPI', {
  saveFlow:     (fh, fd) => ipcRenderer.invoke('save-flow', fh, fd),
  loadFlow:     (fh)     => ipcRenderer.invoke('load-flow', fh),
  analyzeFlow:  (code)   => ipcRenderer.invoke('analyze-flow', code),
  deleteFlow:   (fh)     => ipcRenderer.invoke('delete-flow', fh),
  ollamaStatus: ()       => ipcRenderer.invoke('ollama-status'),
  systemMemory: ()       => ipcRenderer.invoke('system-memory'),
  execCommand:  (c, d)   => ipcRenderer.invoke('exec-command', c, d),
})

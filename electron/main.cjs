'use strict'
const { app, BrowserWindow } = require('electron')
const path = require('path')
const os   = require('os')
const { loadSettings, saveSettings } = require('./utils/settings.cjs')

// Hardware-driven rendering flags
const totalRam = os.totalmem() / (1024 ** 3)
if (totalRam < 8) {
  app.commandLine.appendSwitch('disable-software-rasterizer');
  app.commandLine.appendSwitch('disable-features', 'UseNativeFileDialog');
}
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
  app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations');
  app.commandLine.appendSwitch('disable-features', 'UseNativeFileDialog');
  app.commandLine.appendSwitch('disable-accelerated-2d-canvas');
}

let mainWin = null

function safeRequireHandler(modulePath, arg) {
  try {
    const handler = require(modulePath)
    handler(arg)
    console.log(`[main] ✓ ${path.basename(modulePath)}`)
  } catch (err) {
    console.error(`[main] ✗ Failed to load ${path.basename(modulePath)}:`, err.message)
    console.error(err.stack)
  }
}

function createWindow() {
  const isDev = !app.isPackaged && !process.argv.includes('--app')
  const settings = loadSettings()
  const bounds = settings.windowBounds ?? { width: 1400, height: 900 }

  mainWin = new BrowserWindow({
    x:         bounds.x,
    y:         bounds.y,
    width:     bounds.width  ?? 1400,
    height:    bounds.height ?? 900,
    minWidth:  960,
    minHeight: 600,
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  })

  if (bounds.isMaximized) mainWin.maximize()

  const saveBounds = () => {
    if (!mainWin || mainWin.isDestroyed()) return
    const b = mainWin.getBounds()
    const cur = loadSettings()
    saveSettings({ ...cur, windowBounds: { ...b, isMaximized: mainWin.isMaximized() } })
  }
  mainWin.on('resize', saveBounds)
  mainWin.on('move',   saveBounds)
  mainWin.on('close',  saveBounds)

  mainWin.webContents.on('crashed', () => {
    console.error('Renderer crashed – reloading in 1s')
    setTimeout(() => { if (mainWin && !mainWin.isDestroyed()) mainWin.reload() }, 1000)
  })

  mainWin.once('ready-to-show', () => { mainWin.show() })
  setTimeout(() => {
    if (mainWin && !mainWin.isDestroyed() && !mainWin.isVisible()) mainWin.show()
  }, 4000)

  if (isDev) {
    mainWin.loadURL(process.env.ELECTRON_START_URL || 'http://localhost:5173')
  } else {
    mainWin.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWin.once('ready-to-show', () => {
    mainWin.show()
    // Load heavy handlers asynchronously, without blocking the UI
    setImmediate(() => {
      safeRequireHandler('./handlers/fileSystemHandler.cjs', mainWin)
      safeRequireHandler('./handlers/terminalHandler.cjs', mainWin)
      safeRequireHandler('./handlers/hardwareHandler.cjs', mainWin)
      safeRequireHandler('./handlers/flowHandler.cjs', undefined)
      safeRequireHandler('./handlers/legacyHandler.cjs', mainWin)
      safeRequireHandler('./handlers/settingsHandler.cjs', undefined)
      safeRequireHandler('./handlers/windowHandler.cjs', mainWin)
      
      safeRequireHandler('./handlers/ollamaHandler.cjs', undefined)
      safeRequireHandler('./handlers/chatHandler.cjs', mainWin)
      safeRequireHandler('./handlers/aiHandler.cjs', mainWin)
      safeRequireHandler('./services/aiRouter.cjs', mainWin)

      safeRequireHandler('./handlers/lspHandler.cjs', undefined)
      safeRequireHandler('./utils/gitHandler.cjs', undefined)
      safeRequireHandler('./handlers/historyHandler.cjs', undefined)
    })
  })

  mainWin.on('closed', () => {
    if (global.ptyInstances?.size) {
      for (const pty of global.ptyInstances.values()) pty.kill()
      global.ptyInstances.clear()
    }
    if (global.fsWatcher) { global.fsWatcher.close(); global.fsWatcher = null }
    if (process.platform !== 'darwin') app.quit()
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

  
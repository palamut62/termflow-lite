import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { IPC } from '../shared/ipc'
import { DEFAULT_SETTINGS } from '../shared/types'
import { TerminalManager } from './terminal/TerminalManager'
import { discoverShells, warmPathCache } from './terminal/ShellDiscovery'
import { SettingsStore } from './storage/SettingsStore'
import { registerTerminalIpc } from './ipc/terminal'
import { registerSettingsIpc } from './ipc/settings'
import { registerShellIpc } from './ipc/shell'

// Dev: project resources/. Packaged: extraResources under process.resourcesPath.
const APP_ICON = app.isPackaged
  ? join(process.resourcesPath, 'resources', 'icon.ico')
  : join(__dirname, '../../resources/icon.ico')

let mainWindow: BrowserWindow | null = null
let settingsStore: SettingsStore | null = null
let manager: TerminalManager | null = null

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

// Single-instance: focus the existing window instead of spawning a second
// process that would fight over the userData/cache locks.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

function createWindow(): void {
  if (!settingsStore) return
  const settings = settingsStore.get()

  mainWindow = new BrowserWindow({
    width: settings.windowWidth,
    height: settings.windowHeight,
    minWidth: 640,
    minHeight: 400,
    show: false,
    // Native title bar — V1 stability (no custom titlebar overlay).
    autoHideMenuBar: true,
    icon: APP_ICON,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // Sandboxed renderer: the preload only uses contextBridge/ipcRenderer
      // (no direct Node APIs), so the full Chromium sandbox can stay on.
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Show the window reliably. `ready-to-show` can fail to fire on some Windows
  // configurations, leaving the process running with a hidden window — the app
  // appears "not to open". Show on both events plus a hard fallback timer.
  const reveal = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  setTimeout(reveal, 3000)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Persist the window size so the next launch restores it.
  mainWindow.on('resize', () => {
    if (!settingsStore || !mainWindow || mainWindow.isDestroyed()) return
    const [width, height] = mainWindow.getSize()
    settingsStore.update({ windowWidth: width, windowHeight: height })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const url = new URL(details.url)
      if (url.protocol === 'https:' || url.protocol === 'http:') shell.openExternal(url.toString())
    } catch {
      // Invalid and non-web URLs stay blocked.
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (url !== current) event.preventDefault()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Warm the registry PATH cache off the critical path so the first terminal
  // never pays for a `reg query` round trip.
  warmPathCache()

  settingsStore = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  const mgr = new TerminalManager(() => mainWindow, () => (settingsStore ? settingsStore.get() : DEFAULT_SETTINGS))
  manager = mgr
  // WSL distro enumeration makes discovery async — the renderer re-queries
  // via SHELLS_DISCOVER anyway, so the warm value is only a fallback.
  void discoverShells().then((shells) => mgr.setShells(shells))

  registerTerminalIpc(manager)
  registerSettingsIpc(settingsStore, mgr)
  registerShellIpc()

  // Renderer asks for the current window size at startup (window persist).
  ipcMain.handle(IPC.WINDOW_GET_SIZE, () => {
    if (!mainWindow || mainWindow.isDestroyed()) return { width: 1100, height: 700 }
    const [width, height] = mainWindow.getSize()
    return { width, height }
  })
  ipcMain.on(IPC.WINDOW_RESIZE, (_event, width: unknown, height: unknown) => {
    if (typeof width !== 'number' || typeof height !== 'number') return
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.setSize(Math.max(640, Math.floor(width)), Math.max(400, Math.floor(height)))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  settingsStore?.flush() // write any debounced settings mutations
  manager?.shutdown() // kill every live PTY
})

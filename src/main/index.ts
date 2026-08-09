import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { DEFAULT_SETTINGS } from '../shared/types'
import { applyWindowAppearance, titleBarOptions } from './window'
import { TerminalManager } from './terminal/TerminalManager'
import { discoverShells, warmPathCache } from './terminal/ShellDiscovery'
import { SettingsStore } from './storage/SettingsStore'
import { registerTerminalIpc } from './ipc/terminal'
import { registerSettingsIpc } from './ipc/settings'
import { registerShellIpc } from './ipc/shell'
import { registerClipboardIpc } from './ipc/clipboard'
import { registerWindowIpc } from './ipc/window'
import { registerDialogIpc } from './ipc/dialog'
import { registerGitIpc } from './ipc/git'
import { registerTasksIpc } from './ipc/tasks'
import { registerProjectIpc } from './ipc/project'
import { registerAgentSessionsIpc } from './ipc/agentSessions'
import { IPC } from '../shared/ipc'
import { parseLaunchRequest } from './launchPath'
import { syncExplorerContextMenu } from './explorerContextMenu'

// Dev: project resources/. Packaged: extraResources under process.resourcesPath.
const APP_ICON = app.isPackaged
  ? join(process.resourcesPath, 'resources', 'icon.ico')
  : join(__dirname, '../../resources/icon.ico')

// E2E isolation: Playwright launches (TERMFLOW_E2E=1, see e2e/app.spec.ts)
// get a throwaway pid-scoped userData dir so they never touch the real
// settings.json. Must run before any userData use — including the
// single-instance lock below.
if (process.env.TERMFLOW_E2E === '1') {
  app.setPath('userData', join(app.getPath('temp'), `termflow-lite-e2e-${process.pid}`))
}

let mainWindow: BrowserWindow | null = null
let settingsStore: SettingsStore | null = null
let manager: TerminalManager | null = null

let initialLaunchRequest = parseLaunchRequest(process.argv)

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
  app.on('second-instance', (_event, argv) => {
    const request = parseLaunchRequest(argv)
    showMainWindow()
    if (request && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.APP_OPEN_PATH, request)
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
    // Custom title bar (PRD §68): sekme barı title bar ile birleşir. Windows'ta
    // Controls Overlay ile native düğmeler korunur, Linux'ta native bar kalır.
    ...titleBarOptions(settings),
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
  applyWindowAppearance(mainWindow, settings)

  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  setTimeout(reveal, 3000)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Persist the window size so the next launch restores it. Tek sahip main
  // process'tir (renderer boyut yazmaz). Maximize/fullscreen ölçüsü kalıcı
  // olmasın diye o durumlarda yazma atlanır.
  mainWindow.on('resize', () => {
    if (!settingsStore || !mainWindow || mainWindow.isDestroyed()) return
    if (mainWindow.isMaximized() || mainWindow.isFullScreen()) return
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
  let currentShells: Awaited<ReturnType<typeof discoverShells>> = []
  const refreshContextMenu = (): void => {
    if (!app.isPackaged || !settingsStore) return
    void syncExplorerContextMenu(process.execPath, process.resourcesPath, settingsStore.get(), currentShells)
      .catch((error) => console.warn('Explorer context menu sync failed:', error))
  }
  void discoverShells().then((shells) => {
    currentShells = shells
    mgr.setShells(shells)
    refreshContextMenu()
  })

  registerTerminalIpc(manager)
  registerSettingsIpc(settingsStore, mgr, () =>
    mainWindow && !mainWindow.isDestroyed() ? mainWindow : null,
    refreshContextMenu
  )
  registerShellIpc()
  registerClipboardIpc()
  registerWindowIpc(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  registerDialogIpc(() => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null))
  registerGitIpc()
  registerTasksIpc()
  registerProjectIpc()
  registerAgentSessionsIpc()
  ipcMain.handle(IPC.APP_LAUNCH_CWD, () => {
    const request = initialLaunchRequest
    initialLaunchRequest = null
    return request
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

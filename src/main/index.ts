import { app, BrowserWindow, ipcMain, Menu, Notification, shell, Tray } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { IPC } from '../shared/types'
import { autoUpdater } from 'electron-updater'

// Dev: project resources/. Packaged: extraResources under process.resourcesPath.
const APP_ICON = app.isPackaged
  ? join(process.resourcesPath, 'resources', 'icon.ico')
  : join(__dirname, '../../resources/icon.ico')
import { getSettings, initDatabase, flushPersist } from './db/database'
import { warmPathCache } from './pty/shells'
import { registerIpc } from './ipc/registerIpc'
import type { PtyController } from './pty/backend'

let mainWindow: BrowserWindow | null = null
let ptyController: PtyController | null = null
let tray: Tray | null = null
let isQuitting = false
let recoveryFile = ''
let previousSessionCrashed = false
const isE2E = process.env.TERMFLOW_E2E === '1'
if (isE2E) app.setPath('userData', join(app.getPath('temp'), `termflow-e2e-${process.pid}`))

function configureUpdater(channel: 'stable' | 'beta'): void {
  autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest'
  autoUpdater.allowPrerelease = channel === 'beta'
  // Opting out of automatic updates still allows the launch-time *check* — it
  // just stops the download, so the status bar can report a new version without
  // pulling it in the background.
  autoUpdater.autoDownload = getSettings().autoUpdate
}
function publishUpdateStatus(status: string, detail?: string): void { mainWindow?.webContents.send(IPC.UPDATE_STATUS, { status, detail }) }

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  if (tray) return
  tray = new Tray(APP_ICON)
  tray.setToolTip('TermFlow')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open TermFlow', click: showMainWindow },
    { type: 'separator' },
    { label: 'Quit TermFlow', click: () => { isQuitting = true; app.quit() } }
  ]))
  tray.on('double-click', showMainWindow)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    icon: APP_ICON,
    titleBarStyle: 'hidden',
    // Overlay is 1px shorter than the 44px toolbar so the toolbar's bottom
    // border stays visible under the native window controls.
    titleBarOverlay: { color: '#20242c', symbolColor: '#a0a7b4', height: 43 },
    autoHideMenuBar: true,
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
  // configurations (seen with titleBarOverlay), leaving the process running with
  // a hidden window — the app appears "not to open". Show on both events plus a
  // hard fallback timer, all idempotent.
  const reveal = (): void => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
  }
  mainWindow.once('ready-to-show', reveal)
  mainWindow.webContents.once('did-finish-load', reveal)
  setTimeout(reveal, 3000)

  mainWindow.on('close', (event) => {
    if (isQuitting || !getSettings().minimizeToTray) return
    event.preventDefault()
    mainWindow?.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
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

// Single-instance: focus the existing window instead of spawning a second
// process that would fight over the userData/cache locks.
const gotLock = isE2E || app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

app.whenReady().then(() => {
  // Warm the registry PATH cache off the critical path so the first terminal
  // never pays for a `reg query` round trip.
  warmPathCache()
  recoveryFile = join(app.getPath('userData'), 'session-state.json')
  if (existsSync(recoveryFile)) { try { previousSessionCrashed = !(JSON.parse(readFileSync(recoveryFile, 'utf-8')) as { cleanExit?: boolean }).cleanExit } catch { previousSessionCrashed = true } }
  try { writeFileSync(recoveryFile, JSON.stringify({ cleanExit: false, startedAt: new Date().toISOString() }), 'utf-8') } catch (err) { console.warn('[recovery] failed to write session-state:', err) }
  ipcMain.handle(IPC.RECOVERY_STATUS, () => ({ crashed: previousSessionCrashed }))
  ipcMain.handle(IPC.RECOVERY_ACK, () => { previousSessionCrashed = false })
  ipcMain.handle(IPC.UPDATE_CHECK, async (_event, channel: 'stable' | 'beta') => { if (!app.isPackaged) return { status: 'development' }; configureUpdater(channel); publishUpdateStatus('checking'); await autoUpdater.checkForUpdates(); return { status: 'checking' } })
  ipcMain.handle(IPC.UPDATE_INSTALL, () => autoUpdater.quitAndInstall())
  // Desktop notifications are reserved for update events only — new version
  // found and update downloaded/ready. (user request)
  const notifyUpdate = (title: string, body: string): void => {
    try {
      if (getSettings().notificationsEnabled && Notification.isSupported()) {
        const n = new Notification({ title, body, icon: APP_ICON })
        n.on('click', showMainWindow)
        n.show()
      }
    } catch { /* notifications unavailable on this system */ }
  }
  autoUpdater.on('update-available', (info) => {
    publishUpdateStatus('available', info.version)
    notifyUpdate('TermFlow update available', `Version ${info.version} is downloading in the background.`)
  })
  autoUpdater.on('update-not-available', () => publishUpdateStatus('current'))
  autoUpdater.on('download-progress', (progress) => publishUpdateStatus('downloading', `${Math.round(progress.percent)}%`))
  autoUpdater.on('update-downloaded', (info) => {
    publishUpdateStatus('ready', info.version)
    notifyUpdate('TermFlow update ready', `Version ${info.version} will install when you restart the app.`)
  })
  autoUpdater.on('error', (error) => {
    // A 404 from GitHub just means no published release exists yet (or the
    // repo is private) — show a friendly message instead of the raw HTTP dump.
    const msg = error.message || ''
    if (/404|releases\.atom|no published versions/i.test(msg)) {
      publishUpdateStatus('no-releases')
    } else {
      publishUpdateStatus('error', msg.split('\n')[0].slice(0, 160))
    }
  })
  initDatabase()
  const settings = getSettings()
  configureUpdater(settings.updateChannel)
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.startAtLogin, path: process.execPath })
  ptyController = registerIpc(() => mainWindow)
  createTray()
  createWindow()
  // One version check per app launch, whatever the autoUpdate setting says, so
  // the status-bar version chip always shows a fresh verdict. 5s in: the window
  // and its renderer are up, so the 'checking' -> result statuses are received.
  if (app.isPackaged) {
    setTimeout(() => {
      publishUpdateStatus('checking')
      void autoUpdater.checkForUpdates().catch(() => undefined)
    }, 5000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  if (recoveryFile) { try { writeFileSync(recoveryFile, JSON.stringify({ cleanExit: true, endedAt: new Date().toISOString() }), 'utf-8') } catch { /* ignore shutdown write failure */ } }
  flushPersist() // write any debounced store mutations before the process dies
  // Detached daemon sessions stay alive on purpose; only in-process shells die.
  ptyController?.shutdown()
})

import { spawn } from 'node:child_process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC, type AppSettings } from '../../../shared/types'
import * as dbApi from '../../db/database'
import { discoverShells } from '../../pty/shells'
import type { PtyBackend } from '../../pty/backend'

/** Settings, shell discovery, window chrome and the directory picker. */

export function registerAppShellIpc(
  getWindow: () => BrowserWindow | null,
  withBackend: (fn: (backend: PtyBackend) => void) => void
): void {
  // ---- Window (titlebar overlay follows the app theme) ----
  ipcMain.on(IPC.WINDOW_OVERLAY, (_e, color: string, symbolColor: string) => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      try {
        // 43px: 1px shorter than the toolbar so its bottom border shows through.
        win.setTitleBarOverlay({ color, symbolColor, height: 43 })
      } catch {
        /* platform without overlay support */
      }
    }
  })

  // ---- Window focus (desktop notification click) ----
  ipcMain.on(IPC.WINDOW_FOCUS, () => {
    const win = getWindow()
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore()
      if (!win.isVisible()) win.show()
      win.focus()
    }
  })

  // ---- Shells ----
  ipcMain.handle(IPC.SHELLS_DISCOVER, () => discoverShells())

  // ---- Settings ----
  ipcMain.handle(IPC.SETTINGS_GET, () => dbApi.getSettings())
  ipcMain.handle(IPC.SETTINGS_SET, (_e, patch: Partial<AppSettings>) => {
    const next = dbApi.setSettings(patch)
    if (app.isPackaged && patch.startAtLogin !== undefined) {
      app.setLoginItemSettings({ openAtLogin: next.startAtLogin, path: process.execPath })
    }
    withBackend((b) => {
      b.setScrollback(next.scrollback)
      b.setPassiveInterval(next.passiveThrottleMs)
    })
    return next
  })

  // ---- Dialog ----
  ipcMain.handle(IPC.DIALOG_OPEN_DIR, async () => {
    const res = await dialog.showOpenDialog(getWindow()!, { properties: ['openDirectory', 'createDirectory'] })
    return res.canceled ? null : res.filePaths[0]
  })

  // Attach files to a terminal: multi-select picker whose paths are typed into
  // the PTY by the renderer (same shape as a drag & drop).
  ipcMain.handle(IPC.DIALOG_OPEN_FILES, async () => {
    const res = await dialog.showOpenDialog(getWindow()!, {
      title: 'Attach files',
      properties: ['openFile', 'multiSelections']
    })
    return res.canceled ? [] : res.filePaths
  })

  // ---- Editor (clickable file paths in terminal output) ----
  ipcMain.handle(IPC.EDITOR_OPEN, async (_e, path: string, line?: number, col?: number) => {
    if (!path) return { ok: false }
    const template = (dbApi.getSettings().editorCommand ?? '').trim()
    if (!template) {
      const err = await shell.openPath(path)
      return { ok: !err }
    }
    // The template is a user setting (shell: true), but the path comes from
    // terminal output — strip the characters that could break out of the
    // quoted argument and inject extra commands.
    const safePath = path.replace(/["`$]/g, '')
    const cmd = template
      .replace(/\{path\}/g, safePath)
      .replace(/\{line\}/g, String(line ?? 1))
      .replace(/\{col\}/g, String(col ?? 1))
    try {
      const child = spawn(cmd, { shell: true, detached: true, windowsHide: true, stdio: 'ignore' })
      // Never let a broken editor command surface as an unhandled error event.
      child.on('error', () => { void shell.openPath(path) })
      child.unref()
      return { ok: true }
    } catch {
      const err = await shell.openPath(path)
      return { ok: !err }
    }
  })
}

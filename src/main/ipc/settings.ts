import { ipcMain, type BrowserWindow } from 'electron'
import type { AppSettings } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import { applyWindowAppearance } from '../window'
import type { SettingsStore } from '../storage/SettingsStore'
import type { TerminalManager } from '../terminal/TerminalManager'

/** GET/SET settings. The renderer already holds the optimistic value, so no
 *  change broadcast is needed — the SETTINGS_SET response is authoritative. */
export function registerSettingsIpc(
  store: SettingsStore,
  manager: TerminalManager,
  getWindow: () => BrowserWindow | null
): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => store.get())

  ipcMain.handle(IPC.SETTINGS_SET, (_event, patch: Partial<AppSettings>) => {
    if (!patch || typeof patch !== 'object') return store.get()
    const next = store.update(patch)
    // Scrollback live: mevcut PTY'lerin ring buffer limitini hemen güncelle
    // (yeni session'lar zaten create() içinde settings.scrollback'i kullanır).
    if (typeof patch.scrollback === 'number' && Number.isFinite(patch.scrollback)) {
      manager.setScrollback(patch.scrollback)
    }
    // Opacity/blur pencere seviyesinde canlı uygulanır (PRD §30).
    if (typeof patch.opacity === 'number' || typeof patch.blur === 'boolean') {
      const win = getWindow()
      if (win && !win.isDestroyed()) applyWindowAppearance(win, next)
    }
    return next
  })
}

import { ipcMain, type BrowserWindow } from 'electron'
import { IPC, type TitleBarOverlayPayload } from '../../shared/ipc'
import { applyTitleBarOverlay } from '../window'

/**
 * Title bar overlay renkleri renderer'dan bildirilir: tema tablosu (ve custom
 * tema) orada yaşıyor, main renkleri kendisi çözemez (PRD §68).
 */
export function registerWindowIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.on(IPC.WINDOW_TITLEBAR_OVERLAY, (_event, payload: TitleBarOverlayPayload) => {
    if (!payload || typeof payload !== 'object') return
    const win = getWindow()
    if (win && !win.isDestroyed()) applyTitleBarOverlay(win, payload)
  })
}

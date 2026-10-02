import { ipcMain, Notification, type BrowserWindow } from 'electron'
import { IPC, type CommandNotification, type TitleBarOverlayPayload } from '../../shared/ipc'
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

  // Uzun süren komut arka planda bitince: tıklanınca pencere öne gelir ve
  // ilgili sekme seçilir. Metinler kısaltılır; renderer zaten redakte eder.
  ipcMain.on(IPC.WINDOW_NOTIFY, (_event, payload: CommandNotification) => {
    if (!payload || typeof payload.title !== 'string' || typeof payload.body !== 'string' || typeof payload.tabId !== 'string') return
    if (!Notification.isSupported()) return
    const notification = new Notification({ title: payload.title.slice(0, 80), body: payload.body.slice(0, 200) })
    notification.on('click', () => {
      const win = getWindow()
      if (!win || win.isDestroyed()) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send(IPC.WINDOW_FOCUS_TAB, payload.tabId)
    })
    notification.show()
  })
}

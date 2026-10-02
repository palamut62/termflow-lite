import { dialog, ipcMain, Notification, type BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { IPC, type CaptureRect, type CommandNotification, type TitleBarOverlayPayload } from '../../shared/ipc'
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

  // Wrapped kartı gibi bir pencere bölgesini PNG olarak kaydet (kayıt yeri
  // kullanıcıya sorulur; renderer dosya sistemine dokunmaz).
  ipcMain.handle(IPC.WINDOW_SAVE_SNAPSHOT, async (_event, rect: CaptureRect, defaultName: unknown) => {
    const win = getWindow()
    if (!win || win.isDestroyed() || !rect) return null
    const values = [rect.x, rect.y, rect.width, rect.height]
    if (!values.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 20000)) return null
    const name = typeof defaultName === 'string' && /^[\w.-]{1,64}\.png$/.test(defaultName) ? defaultName : 'termflow.png'
    const image = await win.webContents.capturePage({
      x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)
    })
    const result = await dialog.showSaveDialog(win, { defaultPath: name, filters: [{ name: 'PNG image', extensions: ['png'] }] })
    if (result.canceled || !result.filePath) return null
    await writeFile(result.filePath, image.toPNG())
    return result.filePath
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

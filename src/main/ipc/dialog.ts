import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc'

export function registerDialogIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.DIALOG_OPEN_DIR, async () => {
    const window = getWindow()
    const result = window && !window.isDestroyed()
      ? await dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
    return result.canceled ? null : result.filePaths[0] ?? null
  })
}

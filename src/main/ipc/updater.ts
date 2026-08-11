import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { UpdateStatus } from '../../shared/types'
import { checkForUpdates, downloadUpdate, quitAndInstall } from '../updater'

/** Otomatik güncelleme kanalları (durum push'u updater.ts içinde yapılır). */
export function registerUpdaterIpc(): void {
  ipcMain.handle(IPC.UPDATE_CHECK, (): Promise<UpdateStatus> => checkForUpdates())
  ipcMain.handle(IPC.UPDATE_DOWNLOAD, (): Promise<void> => downloadUpdate())
  ipcMain.handle(IPC.UPDATE_INSTALL, (): void => quitAndInstall())
}

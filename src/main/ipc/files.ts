import { ipcMain } from 'electron'
import { IPC, type DirListing } from '../../shared/ipc'
import { listDirectory } from '../files'

/** Read-only folder listing for the file panel. */
export function registerFilesIpc(): void {
  ipcMain.handle(IPC.FILES_LIST, async (_event, dir: unknown, showHidden: unknown): Promise<DirListing | null> =>
    typeof dir === 'string' ? listDirectory(dir, showHidden === true) : null)
}

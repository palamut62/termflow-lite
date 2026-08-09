import { clipboard, ipcMain } from 'electron'
import { existsSync } from 'fs'
import { isAbsolute } from 'path'
import { IPC } from '../../shared/ipc'

/**
 * Read the system clipboard text on the main side. The sandboxed renderer's
 * navigator.clipboard.readText() needs a clipboard-read permission that can be
 * flaky, so paste goes through a single IPC path (PRD §24).
 */
export function registerClipboardIpc(): void {
  ipcMain.handle(IPC.CLIPBOARD_READ, () => clipboard.readText())
  ipcMain.handle(IPC.CLIPBOARD_READ_PASTE, () => {
    if (process.platform === 'win32') {
      const filePath = clipboard.readBuffer('FileNameW').toString('utf16le').replace(/\0+$/g, '').trim()
      if (filePath && isAbsolute(filePath) && existsSync(filePath)) return { kind: 'file' as const, value: filePath }
    }
    return { kind: 'text' as const, value: clipboard.readText() }
  })
}

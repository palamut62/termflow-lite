import { clipboard, ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'

/**
 * Read the system clipboard text on the main side. The sandboxed renderer's
 * navigator.clipboard.readText() needs a clipboard-read permission that can be
 * flaky, so paste goes through a single IPC path (PRD §24).
 */
export function registerClipboardIpc(): void {
  ipcMain.handle(IPC.CLIPBOARD_READ, () => clipboard.readText())
}

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { discoverShells } from '../terminal/ShellDiscovery'

/** Shell discovery is stateless — fresh result on every request. */
export function registerShellIpc(): void {
  ipcMain.handle(IPC.SHELLS_DISCOVER, () => discoverShells())
}

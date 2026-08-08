import type { BrowserWindow } from 'electron'
import type { PtyController } from '../pty/backend'
import { PluginRuntime } from '../plugins/PluginRuntime'
import { registerAppShellIpc } from './handlers/appShell'
import { registerCredentialIpc } from './handlers/credentials'
import { registerFileIpc } from './handlers/files'
import { registerGitIpc } from './handlers/git'
import { registerPluginIpc } from './handlers/plugins'
import { registerTaskIpc } from './handlers/tasks'
import { createTerminalBackend, registerTerminalIpc } from './handlers/terminals'
import { registerWorkspaceIpc } from './handlers/workspaces'

/**
 * Thin orchestrator: owns the PTY backend lifetime and wires each domain
 * handler module onto `ipcMain`. All behaviour lives in `./handlers/*`, all
 * renderer-input validation in `./pathSafety`.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): PtyController {
  const getSender = (): Electron.WebContents | null => {
    // A destroyed BrowserWindow throws on `.webContents` access, so guard the
    // window itself before touching webContents (fixes "Object has been
    // destroyed" when a PTY flushes during/after window close).
    const win = getWindow()
    if (!win || win.isDestroyed()) return null
    const wc = win.webContents
    return wc && !wc.isDestroyed() ? wc : null
  }

  const backend = createTerminalBackend(getSender)

  registerTerminalIpc(backend, getWindow)
  registerAppShellIpc(getWindow, backend.withBackend)
  registerWorkspaceIpc(getWindow)
  registerCredentialIpc()
  registerFileIpc()
  registerGitIpc()
  registerTaskIpc()
  registerPluginIpc(new PluginRuntime(), getWindow)

  return {
    shutdown(): void {
      backend.dispose()
    }
  }
}

import { statSync } from 'fs'
import { isAbsolute, normalize } from 'path'
import { ipcMain } from 'electron'
import type { RenderMode } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { TerminalManager } from '../terminal/TerminalManager'

/** tabId doğrulama: kısa string'ler dışında hiçbir şey kabul edilmez. */
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 100
}

function validSize(value: unknown, min: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? Math.floor(value) : 0
}

function validCwd(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || value.length > 32767 || !isAbsolute(value)) throw new Error('invalid working directory')
  const cwd = normalize(value)
  try {
    if (!statSync(cwd).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error('working directory does not exist')
  }
  return cwd
}

/**
 * Wire the PTY channels onto ipcMain. create/restart/buffer are invoke-based
 * (the renderer awaits a result); write/resize/kill/mode are fire-and-forget.
 */
export function registerTerminalIpc(manager: TerminalManager): void {
  ipcMain.handle(IPC.PTY_CREATE, (_event, tabId: unknown, profileId: unknown, cols: unknown, rows: unknown, cwd: unknown) => {
    if (!validId(tabId) || !validId(profileId)) throw new Error('invalid tab id')
    const c = validSize(cols, 2) || 120
    const r = validSize(rows, 1) || 30
    return manager.create(tabId, profileId, c, r, validCwd(cwd))
  })

  ipcMain.on(IPC.PTY_WRITE, (_event, tabId: unknown, data: unknown) => {
    if (!validId(tabId) || typeof data !== 'string') return
    manager.write(tabId, data)
  })

  ipcMain.on(IPC.PTY_RESIZE, (_event, tabId: unknown, cols: unknown, rows: unknown) => {
    if (!validId(tabId)) return
    const c = validSize(cols, 2)
    const r = validSize(rows, 1)
    if (c && r) manager.resize(tabId, c, r)
  })

  ipcMain.on(IPC.PTY_KILL, (_event, tabId: unknown) => {
    if (validId(tabId)) manager.kill(tabId)
  })

  ipcMain.on(IPC.PTY_MODE, (_event, tabId: unknown, mode: unknown) => {
    if (!validId(tabId)) return
    if (mode === 'active' || mode === 'passive' || mode === 'buffer') {
      manager.setMode(tabId, mode as RenderMode)
    }
  })

  ipcMain.handle(IPC.PTY_RESTART, (_event, tabId: unknown) => {
    return validId(tabId) ? manager.restart(tabId) : null
  })

  ipcMain.handle(IPC.PTY_BUFFER, (_event, tabId: unknown) => {
    return validId(tabId) ? manager.getBuffer(tabId) : ''
  })
}

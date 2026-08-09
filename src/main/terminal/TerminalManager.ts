import type { BrowserWindow } from 'electron'
import type { AgentSessionRef, AppSettings, PtyEvent, RenderMode, ShellInfo } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import { PtyCore } from './PtyCore'
import { profileToInput, resolveProfileId } from './profileResolver'

/**
 * PTY lifecycle owner (PRD §20). Wraps PtyCore and forwards its events to the
 * renderer over Electron IPC. The manager is transport-agnostic: the only
 * Electron touchpoint is the getWindow() sink used for event delivery.
 */
export class TerminalManager {
  private core: PtyCore
  private shells: ShellInfo[] = []

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly getSettings: () => AppSettings
  ) {
    this.core = new PtyCore((event) => this.handleEvent(event))
  }

  /** Initial discovery result — shells can change later via SETTINGS/reboot. */
  setShells(shells: ShellInfo[]): void {
    this.shells = shells
  }

  /** Resolve a profile id + create the PTY at the measured cell size. */
  create(tabId: string, profileId: string, cols: number, rows: number, cwd?: string, resumeSession?: AgentSessionRef): { pid: number } {
    const settings = this.getSettings()
    const resolvedId = resolveProfileId(profileId, settings, this.shells)
    const input = profileToInput(resolvedId, settings, this.shells, { cols, rows, cwd, resumeSession })
    // Keep the ring buffer limit in sync with the current setting on every
    // spawn so a settings change applies even to terminals created later.
    this.core.setScrollback(settings.scrollback)
    return this.core.create(tabId, input)
  }

  write(id: string, data: string): void {
    this.core.write(id, data)
  }

  resize(id: string, cols: number, rows: number): void {
    this.core.resize(id, cols, rows)
  }

  kill(id: string): void {
    this.core.kill(id)
  }

  setMode(id: string, mode: RenderMode): void {
    this.core.setMode(id, mode)
  }

  restart(id: string): { pid: number } | null {
    return this.core.restart(id)
  }

  getBuffer(id: string): string {
    return this.core.getBuffer(id)
  }

  setScrollback(lines: number): void {
    this.core.setScrollback(lines)
  }

  /** Kill every live PTY (app quit). */
  shutdown(): void {
    this.core.killAll()
  }

  private handleEvent(event: PtyEvent): void {
    const sender = this.getSender()
    if (!sender) return
    switch (event.kind) {
      case 'data':
        sender.send(IPC.PTY_DATA, { ptyId: event.ptyId, data: event.data })
        break
      case 'exit':
        sender.send(IPC.PTY_EXIT, { ptyId: event.ptyId, exitCode: event.exitCode, durationMs: event.durationMs })
        break
      case 'cwd':
        sender.send(IPC.PTY_CWD, { ptyId: event.ptyId, cwd: event.cwd })
        break
    }
  }

  private getSender(): Electron.WebContents | null {
    // A destroyed BrowserWindow throws on `.webContents` access, so guard the
    // window itself before touching webContents (fixes "Object has been
    // destroyed" when a PTY flushes during/after window close).
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return null
    const wc = win.webContents
    return wc && !wc.isDestroyed() ? wc : null
  }
}

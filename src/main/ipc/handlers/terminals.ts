import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import pidusage from 'pidusage'
import {
  IPC,
  type CreateTerminalInput,
  type ProcStats,
  type RenderMode
} from '../../../shared/types'
import * as dbApi from '../../db/database'
import { PtyManager } from '../../pty/PtyManager'
import { DaemonPtyManager } from '../../pty/daemon/DaemonPtyManager'
import { resetDaemonSpawnBudget } from '../../pty/daemon/launcher'
import type { PtyBackend, PtyBackendStatus } from '../../pty/backend'
import { workspaceEnv } from './credentials'

/**
 * PTY backend selection + every terminal-facing channel (create/write/resize,
 * process stats, recording).
 */

const execFileAsync = promisify(execFile)

export interface TerminalBackend {
  ready: Promise<void>
  useBackend(): Promise<PtyBackend>
  withBackend(fn: (backend: PtyBackend) => void): void
  status(): PtyBackendStatus
  shutdownDaemon(): Promise<PtyBackendStatus>
  dispose(): void
}

export function createTerminalBackend(getSender: () => Electron.WebContents | null): TerminalBackend {
  // Preferred: the detached daemon, so shells survive an app restart.
  // Fallback: an in-process PtyManager (sessions die with the app). The
  // renderer is told which one is live so it can surface the degraded mode.
  let daemon: DaemonPtyManager | null = null
  let active: PtyBackend | null = null
  let backendStatus: PtyBackendStatus = { kind: 'in-process', reason: 'starting' }

  // Apply persisted performance settings to whichever backend is live.
  const applySettings = (backend: PtyBackend): void => {
    const settings = dbApi.getSettings()
    backend.setScrollback(settings.scrollback)
    backend.setPassiveInterval(settings.passiveThrottleMs)
  }

  const publishBackend = (): void => {
    getSender()?.send(IPC.PTY_BACKEND_CHANGED, backendStatus)
  }

  const useFallback = (reason: string): PtyBackend => {
    daemon = null
    const manager = new PtyManager(getSender)
    active = manager
    backendStatus = { kind: 'in-process', reason }
    applySettings(manager)
    publishBackend()
    return manager
  }

  const ready: Promise<void> = (async () => {
    // E2E runs use throwaway userData dirs; a detached daemon would outlive the
    // test process, so keep those runs fully in-process.
    if (process.env.TERMFLOW_E2E === '1') {
      useFallback('e2e mode')
      return
    }
    try {
      const { manager, terminals } = await DaemonPtyManager.attach(
        getSender,
        { userDataDir: app.getPath('userData'), daemonEntry: join(__dirname, 'ptyDaemon.js') },
        (reason, daemonPid) => {
          // Connection lost for good — degrade instead of retrying forever.
          if (daemon) {
            if (daemonPid && daemonPid > 0) {
              void execFileAsync('taskkill', ['/PID', String(daemonPid), '/T', '/F']).catch(() => undefined)
            }
            useFallback(reason)
          }
        }
      )
      daemon = manager
      active = manager
      backendStatus = { kind: 'daemon', attached: terminals.map((t) => t.ptyId) }
      applySettings(manager)
      publishBackend()
    } catch (err) {
      useFallback(err instanceof Error ? err.message : 'pty daemon unavailable')
    }
  })()

  const useBackend = async (): Promise<PtyBackend> => {
    await ready
    return active ?? useFallback('pty backend unavailable')
  }

  /** Fire-and-forget helper for the `ipcMain.on` channels. */
  const withBackend = (fn: (backend: PtyBackend) => void): void => {
    void useBackend().then(fn).catch(() => undefined)
  }

  return {
    ready,
    useBackend,
    withBackend,
    status: () => backendStatus,
    async shutdownDaemon(): Promise<PtyBackendStatus> {
      await ready
      if (daemon) {
        await daemon.shutdownDaemon()
        resetDaemonSpawnBudget()
        useFallback('daemon shut down by user')
      } else {
        active?.killAll()
      }
      return backendStatus
    },
    dispose(): void {
      // Daemon-backed sessions must SURVIVE the app: only detach. In-process
      // shells have no owner left, so they are killed.
      if (daemon) daemon.dispose()
      else active?.killAll()
    }
  }
}

/** asciinema v2 serialisation of a recording. */
export function toAsciicast(chunks: Array<{ ts: number; data: string }>): string {
  const lines = [JSON.stringify({ version: 2, width: 120, height: 30 })]
  for (const c of chunks) lines.push(JSON.stringify([c.ts / 1000, 'o', c.data]))
  return lines.join('\n') + '\n'
}

export function registerTerminalIpc(backend: TerminalBackend, getWindow: () => BrowserWindow | null): void {
  const { useBackend, withBackend } = backend

  ipcMain.handle(IPC.PTY_CREATE, async (_e, id: string, input: CreateTerminalInput) => {
    const b = await useBackend()
    return b.create(id, {
      ...input,
      env: { ...(await workspaceEnv(input.workspaceId, input.cleanProviderEnv)), ...(input.env || {}) }
    })
  })
  ipcMain.on(IPC.PTY_WRITE, (_e, id: string, data: string) => withBackend((b) => b.write(id, data)))
  ipcMain.on(IPC.PTY_RESIZE, (_e, id: string, cols: number, rows: number) => withBackend((b) => b.resize(id, cols, rows)))
  ipcMain.on(IPC.PTY_KILL, (_e, id: string) => withBackend((b) => b.kill(id)))
  ipcMain.on(IPC.PTY_MODE, (_e, id: string, mode: RenderMode) => withBackend((b) => b.setMode(id, mode)))
  ipcMain.handle(IPC.PTY_RESTART, async (_e, id: string) => (await useBackend()).restart(id))
  ipcMain.handle(IPC.PTY_BUFFER, async (_e, id: string) => (await useBackend()).getBuffer(id))
  ipcMain.handle(IPC.PTY_BUFFER_INFO, async (_e, id: string) => (await useBackend()).getBufferInfo(id))

  ipcMain.handle(IPC.PTY_BACKEND_STATUS, async (): Promise<PtyBackendStatus> => {
    await backend.ready
    return backend.status()
  })

  // Explicit "kill daemon / shut down all sessions". Afterwards the app keeps
  // working through a fresh in-process backend until it is restarted.
  ipcMain.handle(IPC.PTY_DAEMON_SHUTDOWN, () => backend.shutdownDaemon())

  // ---- Process stats (pidusage) — PRD §33.2 CPU/RAM ----
  ipcMain.handle(IPC.PROC_STATS, async (): Promise<Record<string, ProcStats>> => {
    const list = await (await useBackend()).pids()
    if (list.length === 0) return {}
    const out: Record<string, ProcStats> = {}
    await Promise.all(
      list.map(async ({ id, pid }) => {
        try {
          const st = await pidusage(pid)
          out[id] = { cpu: Math.round(st.cpu), memory: Math.round(st.memory / 1024 / 1024) }
        } catch {
          /* process gone */
        }
      })
    )
    return out
  })

  // ---- Recording ----
  ipcMain.on(IPC.REC_START, (_e, id: string) => withBackend((b) => b.startRecording(id)))
  ipcMain.handle(IPC.REC_STOP, async (_e, id: string) => (await useBackend()).stopRecording(id))
  ipcMain.handle(IPC.REC_SAVE, async (_e, id: string) => {
    const chunks = await (await useBackend()).getRecording(id)
    if (!chunks.length) return
    const res = await dialog.showSaveDialog(getWindow()!, {
      title: 'Save Recording',
      defaultPath: `termflow-recording-${Date.now()}.cast`,
      filters: [{ name: 'Asciinema Cast', extensions: ['cast'] }]
    })
    if (!res.canceled && res.filePath) {
      await writeFile(res.filePath, toAsciicast(chunks), 'utf-8')
    }
  })
}

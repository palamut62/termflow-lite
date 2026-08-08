import type { CreateTerminalInput, RenderMode } from '../../shared/types'
import type { RecordingEntry } from '../../shared/ptyDaemonProtocol'

type MaybePromise<T> = T | Promise<T>

/**
 * The surface registerIpc talks to. Both backends implement it:
 *   - DaemonPtyManager  — sessions survive app restarts (preferred)
 *   - PtyManager        — in-process fallback, sessions die with the app
 * Query methods are allowed to be async because the daemon answers over a pipe.
 */
export interface PtyBackend {
  create(id: string, input: CreateTerminalInput): MaybePromise<{ pid: number }>
  write(id: string, data: string): void
  resize(id: string, cols: number, rows: number): void
  kill(id: string): void
  setMode(id: string, mode: RenderMode): void
  restart(id: string): MaybePromise<{ pid: number } | null>
  getBuffer(id: string): MaybePromise<string>
  getBufferInfo(id: string): MaybePromise<{ data: string; total: number }>
  pids(): MaybePromise<{ id: string; pid: number }[]>
  killAll(): void
  setScrollback(lines: number): void
  setPassiveInterval(ms: number): void
  startRecording(id: string): void
  stopRecording(id: string): MaybePromise<RecordingEntry[]>
  getRecording(id: string): MaybePromise<RecordingEntry[]>
}

export type { PtyBackendKind, PtyBackendStatus } from '../../shared/types'

/** What registerIpc hands back to main/index.ts for shutdown handling. */
export interface PtyController {
  /** Called on app quit: detach from the daemon, or kill in-process shells. */
  shutdown(): void
}

import type { WebContents } from 'electron'
import type { DaemonEvent } from '../../shared/ptyDaemonProtocol'
import { IPC } from '../../shared/types'
import { PtyCore } from './PtyCore'

export type { RecordingEntry } from '../../shared/ptyDaemonProtocol'

/**
 * In-process PTY backend: runs the PtyCore engine inside the Electron main
 * process and forwards its events straight to the renderer over IPC.
 *
 * This is the fallback backend — used when the detached PTY daemon cannot be
 * started or reached. Terminals owned by this backend die with the app.
 */
export class PtyManager extends PtyCore {
  constructor(getSender: () => WebContents | null) {
    super((event: DaemonEvent) => {
      const send = (channel: string, payload: unknown): void => {
        getSender()?.send(channel, payload)
      }
      switch (event.kind) {
        case 'data':
          return send(IPC.PTY_DATA, { id: event.ptyId, data: event.data })
        case 'exit':
          return send(IPC.PTY_EXIT, { id: event.ptyId, exitCode: event.exitCode, durationMs: event.durationMs })
        case 'activity':
          return send(IPC.PTY_ACTIVITY, { id: event.ptyId, error: event.error })
        case 'awaiting':
          return send(IPC.PTY_AWAITING, { id: event.ptyId })
        case 'cwd':
          return send(IPC.PTY_CWD, { id: event.ptyId, cwd: event.cwd })
        case 'recLimit':
          return send(IPC.REC_LIMIT, { id: event.ptyId, reason: event.reason })
      }
    })
  }
}

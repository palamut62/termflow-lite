import type net from 'net'
import type { WebContents } from 'electron'
import type { CreateTerminalInput, RenderMode } from '../../../shared/types'
import { IPC } from '../../../shared/types'
import {
  DAEMON_PROTOCOL_VERSION,
  FrameSplitter,
  encodeFrame,
  parseServerFrame,
  type DaemonEvent,
  type DaemonRequest,
  type DaemonTerminalInfo,
  type RecordingEntry
} from '../../../shared/ptyDaemonProtocol'
import { connectOrStartDaemon, type DaemonConnection, type LaunchOptions } from './launcher'

const REQUEST_TIMEOUT_MS = 15_000
const RECONNECT_BACKOFF_MS = [200, 500, 1500, 4000]

interface Pending {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Daemon-backed PTY backend. Mirrors the PtyManager surface used by registerIpc
 * but every call is a request over the local named pipe, so the shells keep
 * running when TermFlow closes and are re-attached on the next launch.
 */
export class DaemonPtyManager {
  private socket: net.Socket
  private token: string
  private splitter = new FrameSplitter()
  private pending = new Map<number, Pending>()
  private nextRid = 1
  private closed = false
  private reconnecting = false
  private scrollback: number | null = null
  private passiveIntervalMs: number | null = null
  private daemonPid: number | null = null

  private constructor(
    connection: DaemonConnection,
    private readonly getSender: () => WebContents | null,
    private readonly options: LaunchOptions,
    private readonly onLost: (reason: string, daemonPid: number | null) => void
  ) {
    this.socket = connection.socket
    this.token = connection.token
    this.bind()
  }

  /** Connect to (or start) the daemon and perform the protocol handshake. */
  static async attach(
    getSender: () => WebContents | null,
    options: LaunchOptions,
    onLost: (reason: string, daemonPid: number | null) => void
  ): Promise<{ manager: DaemonPtyManager; terminals: DaemonTerminalInfo[] }> {
    const connection = await connectOrStartDaemon(options)
    const manager = new DaemonPtyManager(connection, getSender, options, onLost)
    const hello = (await manager.request({ type: 'hello' })) as {
      version?: number
      pid?: number
      terminals?: DaemonTerminalInfo[]
    }
    if (hello?.version !== DAEMON_PROTOCOL_VERSION) {
      manager.dispose()
      throw new Error('pty daemon protocol mismatch')
    }
    manager.daemonPid = typeof hello.pid === 'number' ? hello.pid : null
    return { manager, terminals: Array.isArray(hello.terminals) ? hello.terminals : [] }
  }

  // ---- Transport ----

  private bind(): void {
    this.splitter = new FrameSplitter()
    this.socket.on('data', (chunk) => this.onChunk(chunk))
    this.socket.on('error', () => this.socket.destroy())
    this.socket.on('close', () => {
      if (this.closed) return
      this.failPending(new Error('pty daemon connection closed'))
      void this.reconnect()
    })
  }

  private onChunk(chunk: Buffer): void {
    const { lines, overflow } = this.splitter.push(chunk)
    for (const line of lines) {
      const parsed = parseServerFrame(line)
      if (!parsed.ok) continue
      const frame = parsed.value
      if (frame.type === 'reply') {
        const entry = this.pending.get(frame.rid)
        if (!entry) continue
        this.pending.delete(frame.rid)
        clearTimeout(entry.timer)
        if (frame.ok) entry.resolve(frame.result)
        else entry.reject(new Error(frame.error))
      } else {
        this.dispatch(frame.event)
      }
    }
    if (overflow) this.socket.destroy()
  }

  private dispatch(event: DaemonEvent): void {
    const send = (channel: string, payload: unknown): void => {
      this.getSender()?.send(channel, payload)
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
  }

  private failPending(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.reject(err)
    }
    this.pending.clear()
  }

  /** Bounded reconnection — never an infinite loop. */
  private async reconnect(): Promise<void> {
    if (this.reconnecting || this.closed) return
    this.reconnecting = true
    for (const wait of RECONNECT_BACKOFF_MS) {
      await new Promise((r) => setTimeout(r, wait))
      if (this.closed) break
      try {
        const connection = await connectOrStartDaemon(this.options)
        this.socket = connection.socket
        this.token = connection.token
        this.bind()
        this.reconnecting = false
        // Re-apply configuration the new/recovered daemon may not know about.
        if (this.scrollback !== null || this.passiveIntervalMs !== null) {
          this.notify({
            type: 'config',
            ...(this.scrollback !== null ? { scrollback: this.scrollback } : {}),
            ...(this.passiveIntervalMs !== null ? { passiveIntervalMs: this.passiveIntervalMs } : {})
          })
        }
        return
      } catch {
        /* try again until the backoff list is exhausted */
      }
    }
    this.reconnecting = false
    if (!this.closed) this.onLost('pty daemon connection lost', this.daemonPid)
  }

  private send(request: DaemonRequest, rid: number): void {
    if (this.closed || this.socket.destroyed) return
    this.socket.write(encodeFrame({ v: DAEMON_PROTOCOL_VERSION, token: this.token, rid, msg: request }))
  }

  /** Fire-and-forget message (no reply expected). */
  private notify(request: DaemonRequest): void {
    this.send(request, 0)
  }

  private request(request: DaemonRequest): Promise<unknown> {
    if (this.closed || this.socket.destroyed) return Promise.reject(new Error('pty daemon not connected'))
    const rid = this.nextRid++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(rid)
        reject(new Error('pty daemon request timed out'))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(rid, { resolve, reject, timer })
      this.send(request, rid)
    })
  }

  // ---- PtyManager-compatible surface ----

  async create(id: string, input: CreateTerminalInput): Promise<{ pid: number }> {
    const result = (await this.request({ type: 'create', ptyId: id, input })) as { pid?: number }
    return { pid: typeof result?.pid === 'number' ? result.pid : 0 }
  }

  write(id: string, data: string): void {
    this.notify({ type: 'write', ptyId: id, data })
  }

  resize(id: string, cols: number, rows: number): void {
    this.notify({ type: 'resize', ptyId: id, cols, rows })
  }

  kill(id: string): void {
    this.notify({ type: 'kill', ptyId: id })
  }

  setMode(id: string, mode: RenderMode): void {
    this.notify({ type: 'setMode', ptyId: id, mode })
  }

  async restart(id: string): Promise<{ pid: number } | null> {
    const result = (await this.request({ type: 'restart', ptyId: id })) as { pid?: number } | null
    return result && typeof result.pid === 'number' ? { pid: result.pid } : null
  }

  async getBuffer(id: string): Promise<string> {
    const info = await this.getBufferInfo(id)
    return info.data
  }

  async getBufferInfo(id: string): Promise<{ data: string; total: number }> {
    const result = (await this.request({ type: 'snapshot', ptyId: id })) as { data?: string; total?: number }
    return { data: typeof result?.data === 'string' ? result.data : '', total: Number(result?.total) || 0 }
  }

  async pids(): Promise<{ id: string; pid: number }[]> {
    const list = (await this.request({ type: 'list' })) as DaemonTerminalInfo[]
    if (!Array.isArray(list)) return []
    return list
      .filter((t) => t && !t.exited && typeof t.pid === 'number' && t.pid > 0)
      .map((t) => ({ id: t.ptyId, pid: t.pid }))
  }

  /** Detach only — the daemon and its shells keep running. */
  killAll(): void {
    /* intentionally a no-op: closing the app must not kill the sessions */
  }

  setScrollback(lines: number): void {
    this.scrollback = lines
    this.notify({ type: 'config', scrollback: lines })
  }

  setPassiveInterval(ms: number): void {
    this.passiveIntervalMs = ms
    this.notify({ type: 'config', passiveIntervalMs: ms })
  }

  startRecording(id: string): void {
    this.notify({ type: 'recStart', ptyId: id })
  }

  async stopRecording(id: string): Promise<RecordingEntry[]> {
    const result = (await this.request({ type: 'recStop', ptyId: id })) as RecordingEntry[]
    return Array.isArray(result) ? result : []
  }

  async getRecording(id: string): Promise<RecordingEntry[]> {
    const result = (await this.request({ type: 'recGet', ptyId: id })) as RecordingEntry[]
    return Array.isArray(result) ? result : []
  }

  /** Explicit "kill daemon / shut down all sessions". */
  async shutdownDaemon(): Promise<void> {
    try {
      await this.request({ type: 'shutdown' })
    } catch {
      /* the daemon may close the socket before the reply lands */
    }
    this.dispose()
  }

  /** Drop the connection without touching the daemon (app quit). */
  dispose(): void {
    this.closed = true
    this.failPending(new Error('pty daemon detached'))
    this.socket.destroy()
  }
}

import * as pty from '@lydell/node-pty'
import type { CreateTerminalInput, RenderMode } from '../../shared/types'
import type { DaemonEvent, DaemonTerminalInfo, RecordingEntry } from '../../shared/ptyDaemonProtocol'
import { resolveShell } from './shells'

const ACTIVE_INTERVAL_MS = 16 // PRD §11.6 IPC batching for the focused terminal
const DEFAULT_SCROLLBACK_LINES = 10000 // PRD §10.9.1
const MAX_RECORDING_MS = 30 * 60 * 1000 // recording buffer cap: 30 minutes
const MAX_RECORDING_BYTES = 50 * 1024 * 1024 // recording buffer cap: 50MB
/**
 * Upper bound on how long a startup command waits for the client to report the
 * real terminal size. Only reached when the caller could not measure its pane
 * (headless/background terminals); the measured path starts immediately.
 */
const STARTUP_FALLBACK_MS = 800

/** Dev-only perf tracing; compiled out of the user's way in production. */
const PERF = process.env.NODE_ENV !== 'production'
function perfLog(message: string): void {
  if (PERF) console.debug(message)
}

// Error/activity detection patterns (PRD §10.9.5)
const ERROR_RE = /\b(error|exception|failed|fatal|traceback|npm ERR|ModuleNotFound|SyntaxError|TypeError|Permission denied)\b/i

// Confirmation-prompt detection for the "agent awaiting approval" desktop
// notification — matches common y/n and tool-permission style prompts.
const AWAITING_RE = /(\(y\/n\)|\[y\/n\]|yes\/no|do you want to proceed|do you want to continue|allow this action|press enter to continue|waiting for (?:approval|confirmation)|confirm\?)/i

// OSC 7 "current working directory" escape sequence, emitted by most modern
// shells (bash/zsh/pwsh prompts, VS Code shell integration, etc.) on every
// prompt redraw: ESC ] 7 ; file://<host>/<path> BEL|ST (deep git / cwd tracking)
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/

export type { RecordingEntry }

interface ManagedPty {
  id: string
  proc: pty.IPty
  input: CreateTerminalInput
  buffer: string[]
  bufferLines: number
  totalEmitted: number
  pending: string
  flushTimer: NodeJS.Timeout | null
  exited: boolean
  exitCode?: number
  mode: RenderMode
  errorSignalled: boolean
  awaitingSignalled: boolean
  createdAt: number
  cwd: string
  startupTimer: NodeJS.Timeout | null
  startupPending: boolean
  /** Last size actually pushed to ConPTY — used to skip no-op rewraps. */
  cols: number
  rows: number
  /** Perf instrumentation: has the first byte been seen yet? */
  sawFirstData: boolean
  // Recording
  recording: boolean
  recordingStart: number
  recordedChunks: RecordingEntry[]
  recordedBytes: number
}

/**
 * The PTY engine: owns all node-pty processes, the per-terminal ring buffer,
 * output batching, asciinema recording, OSC 7 cwd tracking and the error /
 * awaiting-confirmation heuristics.
 *
 * It is deliberately transport-agnostic — it reports everything through an
 * event sink — so the exact same code can run in-process (PtyManager, which
 * forwards to the renderer over Electron IPC) or inside the detached PTY
 * daemon (which forwards over the named pipe).
 *
 * Output is batched at a cadence that depends on each terminal's render mode:
 *   active  -> 16ms live stream
 *   passive -> throttled (configurable, default 250ms)
 *   buffer  -> not streamed at all; the client rehydrates from the ring buffer
 *              when the terminal becomes visible again.
 * A bounded ring buffer per terminal keeps memory flat. (PRD §11, §12, §13.5)
 */
export class PtyCore {
  protected terminals = new Map<string, ManagedPty>()
  private maxLines = DEFAULT_SCROLLBACK_LINES
  private passiveIntervalMs = 250

  constructor(private readonly emit: (event: DaemonEvent) => void) {}

  /**
   * Spawn a terminal. With `reuse` the call is idempotent for a live id: the
   * existing session is returned untouched. That is what makes daemon-backed
   * detach/attach work — reconnecting to a still-running shell must not kill
   * and respawn it.
   */
  create(id: string, input: CreateTerminalInput, reuse = false): { pid: number; attached?: boolean } {
    const existing = this.terminals.get(id)
    if (existing) {
      if (reuse && !existing.exited) return { pid: existing.proc.pid, attached: true }
      this.kill(id)
    }

    const t0 = Date.now()
    const resolved = resolveShell(input)
    // The renderer measures its pane BEFORE calling create, so the PTY can be
    // spawned at the final size and never needs a startup resize/rewrap.
    const cols = input.cols && input.cols > 0 ? Math.floor(input.cols) : 120
    const rows = input.rows && input.rows > 0 ? Math.floor(input.rows) : 30
    const proc = pty.spawn(resolved.shell, resolved.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolved.cwd,
      env: resolved.env,
      useConpty: true
    })

    const managed: ManagedPty = {
      id,
      proc,
      input,
      buffer: [],
      bufferLines: 0,
      totalEmitted: 0,
      pending: '',
      flushTimer: null,
      exited: false,
      mode: 'active',
      errorSignalled: false,
      awaitingSignalled: false,
      createdAt: Date.now(),
      cwd: resolved.cwd,
      startupTimer: null,
      startupPending: !!input.startupCommand,
      cols,
      rows,
      sawFirstData: false,
      recording: false,
      recordingStart: 0,
      recordedChunks: [],
      recordedBytes: 0
    }
    this.terminals.set(id, managed)

    proc.onData((data) => {
      if (!managed.sawFirstData) {
        managed.sawFirstData = true
        perfLog(`[perf] pty ${id} spawn->first-byte ${Date.now() - t0}ms (${cols}x${rows})`)
      }
      this.onData(managed, data)
    })
    proc.onExit(({ exitCode }) => {
      managed.exited = true
      managed.exitCode = exitCode
      this.flush(managed, true)
      const durationMs = Date.now() - managed.createdAt
      this.emit({ kind: 'exit', ptyId: id, exitCode, durationMs })
    })

    // Wait for the client to report the real xterm dimensions before starting
    // full-screen TUIs. Drawing at the 120x30 spawn default and then shrinking
    // corrupts ConPTY's wrapped buffer (broken Claude/Codex borders).
    //
    // When the caller already told us the real cell size (the renderer measures
    // its pane before calling create), the PTY is ALREADY at its final size:
    // there is nothing to wait for and no rewrap can happen, so the command
    // goes in immediately. Otherwise we still wait for the first resize, with a
    // short fallback so headless/background terminals never hang.
    if (input.startupCommand) {
      if (input.cols && input.rows) {
        this.startStartupCommand(managed)
      } else {
        managed.startupTimer = setTimeout(() => {
          managed.startupTimer = null
          this.startStartupCommand(managed)
        }, STARTUP_FALLBACK_MS)
      }
    }

    return { pid: proc.pid }
  }

  private countNewlines(s: string): number {
    let n = 0
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
    return n
  }

  private onData(managed: ManagedPty, data: string): void {
    managed.totalEmitted += data.length
    // Ring buffer (single-pass newline count, also cap chunk count). PRD §11.8
    managed.buffer.push(data)
    managed.bufferLines += this.countNewlines(data)
    while (managed.buffer.length > 1 && (managed.bufferLines > this.maxLines || managed.buffer.length > this.maxLines)) {
      const removed = managed.buffer.shift()!
      managed.bufferLines -= this.countNewlines(removed)
    }
    // A single node-pty chunk can contain many lines, so chunk-count based
    // eviction alone cannot enforce the scrollback limit. Compact oversized
    // chunks and retain only the newest configured number of lines.
    if (managed.bufferLines > this.maxLines) {
      const joined = managed.buffer.join('')
      const parts = joined.split('\n')
      const keep = parts.slice(-(this.maxLines + 1))
      managed.buffer = [keep.join('\n')]
      managed.bufferLines = this.countNewlines(managed.buffer[0])
    }

    // Recording (bounded by duration and total size to keep memory flat)
    if (managed.recording) {
      const elapsed = Date.now() - managed.recordingStart
      const nextBytes = managed.recordedBytes + Buffer.byteLength(data, 'utf8')
      if (elapsed > MAX_RECORDING_MS || nextBytes > MAX_RECORDING_BYTES) {
        managed.recording = false
        this.emit({
          kind: 'recLimit',
          ptyId: managed.id,
          reason: elapsed > MAX_RECORDING_MS ? 'duration' : 'size'
        })
      } else {
        managed.recordedChunks.push({ ts: elapsed, data })
        managed.recordedBytes = nextBytes
      }
    }

    // OSC 7 cwd tracking — shells report their cwd on every prompt redraw, so
    // we pick up `cd`s without polling. (deep git / cwd tracking)
    let osc7Match: RegExpExecArray | null
    const osc7Re = new RegExp(OSC7_RE.source, 'g')
    let lastPath: string | null = null
    while ((osc7Match = osc7Re.exec(data)) !== null) lastPath = osc7Match[1]
    if (lastPath) {
      try {
        const decoded = decodeURIComponent(lastPath)
        // Windows paths arrive as /C:/Users/... over the file:// URI — strip the leading slash.
        const normalized = /^\/[a-zA-Z]:/.test(decoded) ? decoded.slice(1) : decoded
        if (normalized && normalized !== managed.cwd) {
          managed.cwd = normalized
          this.emit({ kind: 'cwd', ptyId: managed.id, cwd: normalized })
        }
      } catch {
        /* malformed OSC 7 payload */
      }
    }

    // Error/activity detection — signal once until cleared. PRD §10.9.5
    if (!managed.errorSignalled && ERROR_RE.test(data)) {
      managed.errorSignalled = true
      this.emit({ kind: 'activity', ptyId: managed.id, error: true })
    }

    // Confirmation-prompt detection — signal once until the user responds
    // (cleared on the next write() to this terminal, see below).
    if (!managed.awaitingSignalled && AWAITING_RE.test(data)) {
      managed.awaitingSignalled = true
      this.emit({ kind: 'awaiting', ptyId: managed.id })
    }

    if (managed.mode === 'buffer') return // no streaming while offscreen/minimized

    managed.pending += data
    if (!managed.flushTimer) {
      const interval = managed.mode === 'active' ? ACTIVE_INTERVAL_MS : this.passiveIntervalMs
      managed.flushTimer = setTimeout(() => this.flush(managed), interval)
    }
  }

  private flush(managed: ManagedPty, force = false): void {
    if (managed.flushTimer) {
      clearTimeout(managed.flushTimer)
      managed.flushTimer = null
    }
    if (!managed.pending) return
    if (managed.mode === 'buffer' && !force) return
    const chunk = managed.pending
    managed.pending = ''
    this.emit({ kind: 'data', ptyId: managed.id, data: chunk })
  }

  setMode(id: string, mode: RenderMode): void {
    const t = this.terminals.get(id)
    if (!t) return
    t.mode = mode
    // Becoming active: flush anything pending immediately for snappy focus.
    if (mode === 'active') this.flush(t, true)
  }

  write(id: string, data: string): void {
    const t = this.terminals.get(id)
    if (t && !t.exited) {
      t.proc.write(data)
      t.awaitingSignalled = false // user responded — clear the confirmation-prompt badge
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const t = this.terminals.get(id)
    if (t && !t.exited && cols > 0 && rows > 0) {
      // A ConPTY resize rewraps the buffer lossily; a no-op resize would do so
      // for nothing (and corrupt TUI frames), so identical sizes are dropped.
      if (t.cols === cols && t.rows === rows) {
        this.startStartupCommand(t)
        return
      }
      try {
        t.proc.resize(cols, rows)
        t.cols = cols
        t.rows = rows
        this.startStartupCommand(t)
      } catch {
        /* pty may have exited between checks */
      }
    }
  }

  private startStartupCommand(t: ManagedPty): void {
    if (!t.startupPending || t.exited || !t.input.startupCommand) return
    t.startupPending = false
    if (t.startupTimer) {
      clearTimeout(t.startupTimer)
      t.startupTimer = null
    }
    t.proc.write(t.input.startupCommand + '\r')
  }

  getBuffer(id: string): string {
    const t = this.terminals.get(id)
    if (!t) return ''
    t.errorSignalled = false // reading buffer clears the error badge
    return t.buffer.join('')
  }

  getBufferInfo(id: string): { data: string; total: number } {
    const t = this.terminals.get(id)
    if (!t) return { data: '', total: 0 }
    t.errorSignalled = false
    return { data: t.buffer.join(''), total: t.totalEmitted }
  }

  restart(id: string): { pid: number } | null {
    const t = this.terminals.get(id)
    if (!t) return null
    const input = t.input
    this.kill(id)
    return this.create(id, input)
  }

  kill(id: string): void {
    const t = this.terminals.get(id)
    if (!t) return
    if (t.flushTimer) clearTimeout(t.flushTimer)
    if (t.startupTimer) clearTimeout(t.startupTimer)
    try {
      if (!t.exited) t.proc.kill()
    } catch {
      /* already dead */
    }
    this.terminals.delete(id)
  }

  killAll(): void {
    for (const id of [...this.terminals.keys()]) this.kill(id)
  }

  pids(): { id: string; pid: number }[] {
    return [...this.terminals.values()]
      .filter((t) => !t.exited && t.proc.pid > 0)
      .map((t) => ({ id: t.id, pid: t.proc.pid }))
  }

  /** Everything an attaching client needs to rebuild its view of the daemon. */
  list(): DaemonTerminalInfo[] {
    return [...this.terminals.values()].map((t) => ({
      ptyId: t.id,
      pid: t.proc.pid,
      exited: t.exited,
      cwd: t.cwd,
      createdAt: t.createdAt,
      input: t.input
    }))
  }

  count(): number {
    return this.terminals.size
  }

  setScrollback(lines: number): void {
    this.maxLines = lines
  }

  setPassiveInterval(ms: number): void {
    this.passiveIntervalMs = ms
  }

  // ---- Recording ----
  startRecording(id: string): void {
    const t = this.terminals.get(id)
    if (t && !t.recording) {
      t.recording = true
      t.recordingStart = Date.now()
      t.recordedChunks = []
      t.recordedBytes = 0
    }
  }

  stopRecording(id: string): RecordingEntry[] {
    const t = this.terminals.get(id)
    if (!t) return []
    t.recording = false
    return [...t.recordedChunks]
  }

  getRecording(id: string): RecordingEntry[] {
    const t = this.terminals.get(id)
    return t ? [...t.recordedChunks] : []
  }
}

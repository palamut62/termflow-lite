import * as pty from '@lydell/node-pty'
import type { CreateTerminalInput, PtyEvent, RenderMode } from '../../shared/types'
import { resolveShell } from './ShellDiscovery'

const ACTIVE_INTERVAL_MS = 16 // PRD §11.6 IPC batching for the focused terminal
const DEFAULT_SCROLLBACK_LINES = 10000 // PRD §10.9.1
/** Kabuk prompt'u hazır olsun diye startupCommand'dan önce beklenen süre. */
const STARTUP_COMMAND_DELAY_MS = 400
/** Agent profili başladıktan sonra kayıtlı girdinin prompt'a gönderilmesi için bekleme. */
const LAUNCH_COMMAND_AFTER_STARTUP_DELAY_MS = 2500

// OSC 7 "current working directory" escape sequence, emitted by most modern
// shells on every prompt redraw: ESC ] 7 ; file://<host>/<path> BEL|ST
const OSC7_RE = /\x1b\]7;file:\/\/[^/]*(\/[^\x07\x1b]*)(?:\x07|\x1b\\)/

interface ManagedPty {
  id: string
  proc: pty.IPty
  input: CreateTerminalInput
  buffer: string[]
  bufferLines: number
  pending: string
  flushTimer: NodeJS.Timeout | null
  /** Profil startupCommand'ını yazan gecikmeli timer (kill'de temizlenir). */
  startupTimer: NodeJS.Timeout | null
  exited: boolean
  exitCode?: number
  mode: RenderMode
  createdAt: number
  cwd: string
  /** Last size actually pushed to ConPTY — used to skip no-op rewraps. */
  cols: number
  rows: number
}

/**
 * The PTY engine: owns all node-pty processes, the per-terminal ring buffer,
 * output batching and OSC 7 cwd tracking. It is transport-agnostic — it
 * reports everything through an event sink (TerminalManager forwards the
 * events to the renderer over Electron IPC).
 *
 * Output is batched at a cadence that depends on each terminal's render mode:
 *   active  -> 16ms live stream
 *   passive -> throttled (default 250ms)
 *   buffer  -> not streamed at all; the client rehydrates from the ring buffer
 *              when the terminal becomes visible again.
 * A bounded ring buffer per terminal keeps memory flat. (PRD §11, §12)
 */
export class PtyCore {
  protected terminals = new Map<string, ManagedPty>()
  private maxLines = DEFAULT_SCROLLBACK_LINES
  private passiveIntervalMs = 250

  constructor(private readonly emit: (event: PtyEvent) => void) {}

  /**
   * Spawn a terminal. The renderer measures its pane BEFORE calling create,
   * so the PTY can be spawned at the final size (120x30 spawn default) and
   * never needs a startup resize/rewrap.
   */
  create(id: string, input: CreateTerminalInput): { pid: number } {
    const existing = this.terminals.get(id)
    if (existing) this.kill(id)

    const resolved = resolveShell(input)
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
      pending: '',
      flushTimer: null,
      startupTimer: null,
      exited: false,
      mode: 'active',
      createdAt: Date.now(),
      cwd: resolved.cwd,
      cols,
      rows
    }
    this.terminals.set(id, managed)

    proc.onData((data) => {
      this.onData(managed, data)
    })
    proc.onExit(({ exitCode }) => {
      if (this.terminals.get(id) !== managed) return
      managed.exited = true
      managed.exitCode = exitCode
      this.flush(managed, true)
      this.emit({ kind: 'exit', ptyId: id, exitCode, durationMs: Date.now() - managed.createdAt })
    })

    // Profil startupCommand'ı: kabuğun ilk prompt'u çizilsin diye kısa bir
    // gecikmeyle yazılır. `input` saklandığı için restart sonrası da çalışır.
    const startupCommand = input.startupCommand?.trim()
    const launchCommand = input.launchCommand?.trim()
    if (startupCommand || launchCommand) {
      managed.startupTimer = setTimeout(() => {
        managed.startupTimer = null
        if (managed.exited) return
        try {
          if (startupCommand) managed.proc.write(`${startupCommand}\r`)
        } catch {
          /* pty may have exited in the meantime */
        }
        if (!launchCommand) return
        if (!startupCommand) {
          try {
            managed.proc.write(`${launchCommand}\r`)
            managed.input.launchCommand = undefined
          } catch {
            /* pty may have exited in the meantime */
          }
          return
        }
        managed.startupTimer = setTimeout(() => {
          managed.startupTimer = null
          if (managed.exited) return
          try {
            managed.proc.write(`${launchCommand}\r`)
            managed.input.launchCommand = undefined
          } catch {
            /* pty may have exited in the meantime */
          }
        }, LAUNCH_COMMAND_AFTER_STARTUP_DELAY_MS)
      }, STARTUP_COMMAND_DELAY_MS)
    }

    return { pid: proc.pid }
  }

  private countNewlines(s: string): number {
    let n = 0
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
    return n
  }

  private onData(managed: ManagedPty, data: string): void {
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

    // OSC 7 cwd tracking — shells report their cwd on every prompt redraw, so
    // we pick up `cd`s without polling.
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
    if (t && !t.exited) t.proc.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const t = this.terminals.get(id)
    if (t && !t.exited && cols > 0 && rows > 0) {
      // A ConPTY resize rewraps the buffer lossily; a no-op resize would do so
      // for nothing (and corrupt TUI frames), so identical sizes are dropped.
      if (t.cols === cols && t.rows === rows) return
      try {
        t.proc.resize(cols, rows)
        t.cols = cols
        t.rows = rows
      } catch {
        /* pty may have exited between checks */
      }
    }
  }

  getBuffer(id: string): string {
    const t = this.terminals.get(id)
    if (!t) return ''
    return t.buffer.join('')
  }

  restart(id: string): { pid: number } | null {
    const t = this.terminals.get(id)
    if (!t) return null
    const input = t.input
    this.kill(id)
    return this.create(id, input)
  }

  restartAt(id: string, cwd: string): { pid: number } | null {
    const terminal = this.terminals.get(id)
    if (!terminal) return null
    const input = { ...terminal.input, cwd }
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

  setScrollback(lines: number): void {
    this.maxLines = lines
  }

  setPassiveInterval(ms: number): void {
    this.passiveIntervalMs = ms
  }
}

/**
 * Shell integration: OSC 133 (FinalTerm "semantic prompt") and the VS Code
 * OSC 633 superset, parsed into command records.
 *
 * Sequences (payload = everything after the `ESC ] <code> ;` introducer):
 *   A                 prompt start
 *   B                 command input start (end of prompt)
 *   C                 command output start (the shell is about to execute)
 *   D[;<exitcode>]    command finished
 *   E;<commandline>   (633 only) the command line that is about to run
 *   P;<Key>=<Value>   (633 only) property, e.g. `Cwd=C:\src`
 *
 * The module is deliberately free of any xterm dependency: it only ever sees a
 * numeric buffer line, so it can be unit-tested on its own. Everything is
 * defensive — malformed, partial or out-of-order sequences are ignored rather
 * than throwing, because they arrive straight from an untrusted process.
 */

/** How many commands are remembered per terminal before the oldest is dropped. */
export const DEFAULT_COMMAND_LIMIT = 200

export interface CommandRecord {
  /** Monotonic per-tracker id. */
  id: number
  /** Buffer line of the prompt start (OSC 133;A). */
  promptLine: number
  /** Buffer line where the typed command starts (OSC 133;B), -1 when unknown. */
  inputLine: number
  /** Buffer line where the command output starts (OSC 133;C), -1 when unknown. */
  startLine: number
  /** Buffer line where the command finished (OSC 133;D), -1 while running. */
  endLine: number
  /** Exit code from `D;<code>`; undefined when the shell did not report one. */
  exitCode?: number
  /** Timestamp of the prompt, overwritten with the real exec time on `C`. */
  startedAt: number
  endedAt?: number
  durationMs?: number
  /** The command line, when the shell reports it (OSC 633;E). */
  commandText?: string
  /** Working directory reported via OSC 633;P;Cwd=... */
  cwd?: string
  /** True between `C` and `D`. */
  running: boolean
}

export type ShellIntegrationEvent =
  | { type: 'promptStart'; record: CommandRecord }
  | { type: 'commandStart'; record: CommandRecord }
  | { type: 'commandFinish'; record: CommandRecord }

/** The OSC identifiers this module understands. */
export const OSC_SEMANTIC_PROMPT = 133
export const OSC_VSCODE = 633

/**
 * Decode a VS Code OSC 633 value: backslash escapes with `\xHH` for control
 * characters, `;` and `\` itself. Unknown/short escapes are kept verbatim so a
 * truncated payload never loses data or throws.
 */
export function decodeVsCodeValue(value: string): string {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = value[i + 1]
    if (next === '\\') {
      out += '\\'
      i += 1
    } else if (next === 'x' || next === 'X') {
      const hex = value.slice(i + 2, i + 4)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out += String.fromCharCode(parseInt(hex, 16))
        i += 3
      } else {
        out += ch
      }
    } else if (next === 'n') {
      out += '\n'
      i += 1
    } else if (next === 'r') {
      out += '\r'
      i += 1
    } else {
      out += ch
    }
  }
  return out
}

export interface ParsedSequence {
  /** The single-letter command, uppercased. Empty when the payload is unusable. */
  letter: string
  /** Remaining `;`-separated arguments (still escaped). */
  args: string[]
}

/** Split an OSC 133/633 payload into its letter and raw arguments. */
export function parsePayload(payload: string): ParsedSequence | null {
  if (typeof payload !== 'string') return null
  const parts = payload.split(';')
  const letter = (parts[0] ?? '').trim().toUpperCase()
  if (!/^[A-Z]$/.test(letter)) return null
  return { letter, args: parts.slice(1) }
}

function parseExitCode(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return undefined
  return Math.trunc(value)
}

export interface TrackerOptions {
  /** Max remembered commands (default 200). */
  limit?: number
  /** Clock injection for tests. */
  now?: () => number
}

/**
 * Per-terminal command tracker. Feed it every OSC 133/633 payload together with
 * the buffer line the sequence was seen on; it maintains a bounded list of
 * command records.
 */
export class ShellIntegrationTracker {
  private records: CommandRecord[] = []
  private open: CommandRecord | null = null
  private nextId = 1
  private readonly limit: number
  private readonly clock: () => number

  constructor(options: TrackerOptions = {}) {
    const limit = options.limit ?? DEFAULT_COMMAND_LIMIT
    this.limit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : DEFAULT_COMMAND_LIMIT
    this.clock = options.now ?? (() => Date.now())
  }

  /** All remembered commands, oldest first. */
  get commands(): readonly CommandRecord[] {
    return this.records
  }

  /** The record currently being built (prompt shown or command running). */
  get current(): CommandRecord | null {
    return this.open
  }

  /** The most recent finished command, if any. */
  lastFinished(): CommandRecord | null {
    for (let i = this.records.length - 1; i >= 0; i--) {
      if (!this.records[i].running && this.records[i].endLine >= 0) return this.records[i]
    }
    return null
  }

  reset(): void {
    this.records = []
    this.open = null
  }

  /**
   * Handle one OSC payload. Returns an event when the sequence advanced a
   * command's lifecycle, otherwise null. Never throws.
   */
  handle(code: number, payload: string, line: number): ShellIntegrationEvent | null {
    if (code !== OSC_SEMANTIC_PROMPT && code !== OSC_VSCODE) return null
    const parsed = parsePayload(payload)
    if (!parsed) return null
    const safeLine = Number.isFinite(line) ? Math.max(0, Math.trunc(line)) : 0

    switch (parsed.letter) {
      case 'A':
        return this.onPromptStart(safeLine)
      case 'B':
        if (this.open) this.open.inputLine = safeLine
        return null
      case 'C':
        return this.onCommandStart(safeLine)
      case 'D':
        return this.onCommandFinish(safeLine, parseExitCode(parsed.args[0]))
      case 'E': {
        if (code !== OSC_VSCODE) return null
        const record = this.open ?? this.onPromptStart(safeLine).record
        const text = decodeVsCodeValue(parsed.args[0] ?? '')
        if (text) record.commandText = text
        return null
      }
      case 'P': {
        if (code !== OSC_VSCODE) return null
        for (const arg of parsed.args) {
          const eq = arg.indexOf('=')
          if (eq <= 0) continue
          const key = arg.slice(0, eq).trim().toLowerCase()
          const value = decodeVsCodeValue(arg.slice(eq + 1))
          if (key === 'cwd' && this.open) this.open.cwd = value
        }
        return null
      }
      default:
        return null
    }
  }

  private onPromptStart(line: number): { type: 'promptStart'; record: CommandRecord } {
    // A prompt that arrives while a command is still open means the shell never
    // sent its `D` (crash, Ctrl+C at an odd moment, reset). Close it silently
    // with an unknown exit code so the list stays consistent.
    if (this.open) {
      this.open.running = false
      if (this.open.endLine < 0) this.open.endLine = line
      this.open = null
    }
    const record: CommandRecord = {
      id: this.nextId++,
      promptLine: line,
      inputLine: -1,
      startLine: -1,
      endLine: -1,
      startedAt: this.clock(),
      running: false
    }
    this.records.push(record)
    this.trim()
    this.open = record
    return { type: 'promptStart', record }
  }

  private onCommandStart(line: number): ShellIntegrationEvent | null {
    // `C` without a preceding `A` still marks a command — synthesise a record
    // so partially instrumented shells are not silently dropped.
    const record = this.open ?? this.onPromptStart(line).record
    record.startLine = line
    record.startedAt = this.clock()
    record.running = true
    return { type: 'commandStart', record }
  }

  private onCommandFinish(line: number, exitCode: number | undefined): ShellIntegrationEvent | null {
    const record = this.open
    if (!record) return null
    // A `D` before any `C` is an empty prompt (the user just pressed Enter).
    const wasRunning = record.running
    record.endLine = line
    record.endedAt = this.clock()
    record.durationMs = Math.max(0, record.endedAt - record.startedAt)
    record.exitCode = exitCode
    record.running = false
    this.open = null
    if (!wasRunning && record.startLine < 0) {
      // Nothing was executed: drop the empty prompt record instead of showing
      // an exit-code badge for it.
      this.records = this.records.filter((r) => r !== record)
      return null
    }
    return { type: 'commandFinish', record }
  }

  private trim(): void {
    while (this.records.length > this.limit) this.records.shift()
  }
}

// ---- Per-terminal registry -------------------------------------------------
// TerminalView owns the xterm instance, so it registers a reader here that the
// command palette can call without importing anything xterm-related.

/** A finished (or running) command as the blocks UI sees it. */
export interface CommandBlock {
  id: number
  command: string
  exitCode?: number
  durationMs?: number
  startedAt: number
  running: boolean
}

/** Project a record onto the view model — no xterm, no React. */
export function toCommandBlock(record: CommandRecord): CommandBlock {
  return {
    id: record.id,
    command: record.commandText ?? '',
    exitCode: record.exitCode,
    durationMs: record.durationMs,
    startedAt: record.startedAt,
    running: record.running
  }
}

/**
 * Commands worth listing: the shell has to have told us what ran. Newest first,
 * because that is the order the panel shows them in.
 */
export function commandBlocksOf(records: readonly CommandRecord[]): CommandBlock[] {
  return records
    .filter((record) => (record.commandText ?? '').trim().length > 0)
    .map(toCommandBlock)
    .reverse()
}

export interface CommandOutputReader {
  /** Text of the last finished command's output, or null when unavailable. */
  lastOutput: () => string | null
  /** Every listable command, newest first. */
  blocks: () => CommandBlock[]
  /** Output text of one block, or null when it is no longer in the buffer. */
  outputFor: (blockId: number) => string | null
  /** Scroll the terminal to where that command was run. */
  scrollToBlock: (blockId: number) => void
}

const readers = new Map<string, CommandOutputReader>()
// Listeners are keyed by terminal: a panel only ever watches the pane it shows.
const blockListeners = new Map<string, Set<() => void>>()

export function registerCommandOutputReader(terminalId: string, reader: CommandOutputReader): () => void {
  readers.set(terminalId, reader)
  return () => {
    if (readers.get(terminalId) === reader) readers.delete(terminalId)
  }
}

export function readLastCommandOutput(terminalId: string): string | null {
  try {
    return readers.get(terminalId)?.lastOutput() ?? null
  } catch {
    return null
  }
}

export function getCommandBlocks(terminalId: string): CommandBlock[] {
  try {
    return readers.get(terminalId)?.blocks() ?? []
  } catch {
    return []
  }
}

export function getCommandOutput(terminalId: string, blockId: number): string | null {
  try {
    return readers.get(terminalId)?.outputFor(blockId) ?? null
  } catch {
    return null
  }
}

export function scrollToCommandBlock(terminalId: string, blockId: number): void {
  try {
    readers.get(terminalId)?.scrollToBlock(blockId)
  } catch {
    /* the terminal went away between render and click */
  }
}

/** Subscribe to "a command finished in this terminal". Returns an unsubscribe. */
export function onCommandBlocksChanged(terminalId: string, cb: () => void): () => void {
  const set = blockListeners.get(terminalId) ?? new Set<() => void>()
  set.add(cb)
  blockListeners.set(terminalId, set)
  return () => {
    const current = blockListeners.get(terminalId)
    if (!current) return
    current.delete(cb)
    if (!current.size) blockListeners.delete(terminalId)
  }
}

export function notifyCommandBlocksChanged(terminalId: string): void {
  const set = blockListeners.get(terminalId)
  if (!set) return
  for (const cb of [...set]) {
    try { cb() } catch { /* a bad listener must not break the others */ }
  }
}

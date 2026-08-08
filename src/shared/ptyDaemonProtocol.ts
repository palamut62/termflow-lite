import type { CreateTerminalInput, RenderMode, ShellKind } from './types'

// ---------------------------------------------------------------------------
// Wire protocol between the Electron main process (client) and the detached
// PTY daemon (server). Transport is a local Windows named pipe carrying
// newline-delimited JSON. There is no network socket and no TCP port.
//
// Every client frame carries the session token that was generated when the
// daemon was launched; the daemon drops any connection that sends a frame with
// a missing/incorrect token. The token lives in a 0600 file inside the app's
// userData directory (see daemon/launcher.ts).
//
// This module is intentionally pure (no I/O, no Node APIs beyond Buffer) so the
// framing and validation logic can be unit tested in isolation.
// ---------------------------------------------------------------------------

/** Bumped whenever the message shapes change incompatibly. */
export const DAEMON_PROTOCOL_VERSION = 1

/** Hard cap on a single newline-delimited frame. Anything larger is treated as
 *  a protocol violation and kills the connection. */
export const MAX_FRAME_BYTES = 8 * 1024 * 1024

/** The daemon exits after this long with no PTYs and no attached clients. */
export const DEFAULT_DAEMON_IDLE_MS = 24 * 60 * 60 * 1000

const SHELL_KINDS: ShellKind[] = [
  'powershell',
  'pwsh',
  'cmd',
  'wsl',
  'gitbash',
  'claude',
  'codex',
  'opencode',
  'ollama',
  'ssh',
  'custom'
]

const RENDER_MODES: RenderMode[] = ['active', 'passive', 'buffer']

// ---- Messages ------------------------------------------------------------

export interface RecordingEntry {
  ts: number
  data: string
}

export interface DaemonTerminalInfo {
  ptyId: string
  pid: number
  exited: boolean
  cwd: string
  createdAt: number
  input: CreateTerminalInput
}

export type DaemonRequest =
  | { type: 'hello' }
  | { type: 'list' }
  | { type: 'create'; ptyId: string; input: CreateTerminalInput }
  | { type: 'write'; ptyId: string; data: string }
  | { type: 'resize'; ptyId: string; cols: number; rows: number }
  | { type: 'kill'; ptyId: string }
  | { type: 'killAll' }
  | { type: 'setMode'; ptyId: string; mode: RenderMode }
  | { type: 'restart'; ptyId: string }
  | { type: 'snapshot'; ptyId: string }
  | { type: 'config'; scrollback?: number; passiveIntervalMs?: number }
  | { type: 'recStart'; ptyId: string }
  | { type: 'recStop'; ptyId: string }
  | { type: 'recGet'; ptyId: string }
  | { type: 'shutdown' }

export type DaemonEvent =
  | { kind: 'data'; ptyId: string; data: string }
  | { kind: 'exit'; ptyId: string; exitCode: number; durationMs: number }
  | { kind: 'activity'; ptyId: string; error: boolean }
  | { kind: 'awaiting'; ptyId: string }
  | { kind: 'cwd'; ptyId: string; cwd: string }
  | { kind: 'recLimit'; ptyId: string; reason: 'duration' | 'size' }

/** Client -> daemon envelope. `rid` correlates a reply; 0 means "no reply". */
export interface ClientFrame {
  v: number
  token: string
  rid: number
  msg: DaemonRequest
}

export type ServerFrame =
  | { v: number; type: 'reply'; rid: number; ok: true; result: unknown }
  | { v: number; type: 'reply'; rid: number; ok: false; error: string }
  | { v: number; type: 'event'; event: DaemonEvent }

// ---- Framing -------------------------------------------------------------

/** Serialise one frame including its trailing newline. */
export function encodeFrame(frame: ClientFrame | ServerFrame): string {
  return JSON.stringify(frame) + '\n'
}

export interface FramerResult {
  lines: string[]
  /** A single frame exceeded MAX_FRAME_BYTES — the caller must drop the peer. */
  overflow: boolean
}

/**
 * Incremental newline-delimited frame splitter with a bounded pending buffer.
 * Once `overflow` is reported the framer stays poisoned and returns no more
 * lines, so a caller that ignores the flag cannot be fed partial garbage.
 */
export class FrameSplitter {
  private pending = ''
  private poisoned = false

  constructor(private readonly maxBytes = MAX_FRAME_BYTES) {}

  push(chunk: string | Buffer): FramerResult {
    if (this.poisoned) return { lines: [], overflow: true }
    this.pending += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    const lines: string[] = []
    let index = this.pending.indexOf('\n')
    while (index !== -1) {
      const line = this.pending.slice(0, index)
      this.pending = this.pending.slice(index + 1)
      if (line.length > this.maxBytes) {
        this.poisoned = true
        return { lines, overflow: true }
      }
      if (line.trim()) lines.push(line)
      index = this.pending.indexOf('\n')
    }
    if (this.pending.length > this.maxBytes) {
      this.poisoned = true
      this.pending = ''
      return { lines, overflow: true }
    }
    return { lines, overflow: false }
  }
}

// ---- Validation ----------------------------------------------------------

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'json' | 'shape' | 'version' | 'auth' | 'unknown-type' }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStr(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isStr)
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every(isStr)
}

/** Structural validation of an untrusted CreateTerminalInput payload. */
export function validateCreateInput(value: unknown): CreateTerminalInput | null {
  if (!isRecord(value)) return null
  if (!isStr(value.workspaceId) || !isStr(value.name)) return null
  if (!isStr(value.kind) || !SHELL_KINDS.includes(value.kind as ShellKind)) return null
  if (value.shell !== undefined && !isStr(value.shell)) return null
  if (value.args !== undefined && !isStringArray(value.args)) return null
  if (value.cwd !== undefined && !isStr(value.cwd)) return null
  if (value.env !== undefined && !isStringRecord(value.env)) return null
  if (value.cleanProviderEnv !== undefined && typeof value.cleanProviderEnv !== 'boolean') return null
  if (value.startupCommand !== undefined && !isStr(value.startupCommand)) return null
  if (value.cols !== undefined && !isFiniteNum(value.cols)) return null
  if (value.rows !== undefined && !isFiniteNum(value.rows)) return null
  const out: CreateTerminalInput = {
    workspaceId: value.workspaceId,
    name: value.name,
    kind: value.kind as ShellKind
  }
  if (isStr(value.shell)) out.shell = value.shell
  if (isStringArray(value.args)) out.args = value.args
  if (isStr(value.cwd)) out.cwd = value.cwd
  if (isStringRecord(value.env)) out.env = value.env
  if (typeof value.cleanProviderEnv === 'boolean') out.cleanProviderEnv = value.cleanProviderEnv
  if (isStr(value.startupCommand)) out.startupCommand = value.startupCommand
  if (isFiniteNum(value.cols)) out.cols = value.cols
  if (isFiniteNum(value.rows)) out.rows = value.rows
  return out
}

function validateRequest(value: unknown): DaemonRequest | null {
  if (!isRecord(value) || !isStr(value.type)) return null
  const ptyId = isStr(value.ptyId) && value.ptyId.length > 0 && value.ptyId.length <= 256 ? value.ptyId : null
  switch (value.type) {
    case 'hello':
      return { type: 'hello' }
    case 'list':
      return { type: 'list' }
    case 'killAll':
      return { type: 'killAll' }
    case 'shutdown':
      return { type: 'shutdown' }
    case 'create': {
      const input = validateCreateInput(value.input)
      return ptyId && input ? { type: 'create', ptyId, input } : null
    }
    case 'write':
      return ptyId && isStr(value.data) ? { type: 'write', ptyId, data: value.data } : null
    case 'resize':
      return ptyId && isFiniteNum(value.cols) && isFiniteNum(value.rows)
        ? { type: 'resize', ptyId, cols: Math.trunc(value.cols), rows: Math.trunc(value.rows) }
        : null
    case 'kill':
      return ptyId ? { type: 'kill', ptyId } : null
    case 'setMode':
      return ptyId && isStr(value.mode) && RENDER_MODES.includes(value.mode as RenderMode)
        ? { type: 'setMode', ptyId, mode: value.mode as RenderMode }
        : null
    case 'restart':
      return ptyId ? { type: 'restart', ptyId } : null
    case 'snapshot':
      return ptyId ? { type: 'snapshot', ptyId } : null
    case 'recStart':
      return ptyId ? { type: 'recStart', ptyId } : null
    case 'recStop':
      return ptyId ? { type: 'recStop', ptyId } : null
    case 'recGet':
      return ptyId ? { type: 'recGet', ptyId } : null
    case 'config': {
      const out: DaemonRequest = { type: 'config' }
      if (isFiniteNum(value.scrollback)) out.scrollback = Math.trunc(value.scrollback)
      if (isFiniteNum(value.passiveIntervalMs)) out.passiveIntervalMs = Math.trunc(value.passiveIntervalMs)
      return out
    }
    default:
      return null
  }
}

/**
 * Parse and authenticate one client frame. `expectedToken` is compared with a
 * length-independent equality check; a mismatch is reported as 'auth' so the
 * daemon can drop the connection instead of silently ignoring the frame.
 */
export function parseClientFrame(line: string, expectedToken: string): ParseResult<ClientFrame> {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return { ok: false, reason: 'json' }
  }
  if (!isRecord(raw)) return { ok: false, reason: 'shape' }
  if (!isFiniteNum(raw.v)) return { ok: false, reason: 'shape' }
  if (raw.v !== DAEMON_PROTOCOL_VERSION) return { ok: false, reason: 'version' }
  if (!isStr(raw.token) || !timingSafeEqualString(raw.token, expectedToken)) {
    return { ok: false, reason: 'auth' }
  }
  if (!isFiniteNum(raw.rid)) return { ok: false, reason: 'shape' }
  const msg = validateRequest(raw.msg)
  if (!msg) return { ok: false, reason: 'unknown-type' }
  return { ok: true, value: { v: raw.v, token: raw.token, rid: Math.trunc(raw.rid), msg } }
}

/** Constant-time-ish string comparison (no early return on the first mismatch). */
export function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

function validateEvent(value: unknown): DaemonEvent | null {
  if (!isRecord(value) || !isStr(value.kind) || !isStr(value.ptyId)) return null
  const ptyId = value.ptyId
  switch (value.kind) {
    case 'data':
      return isStr(value.data) ? { kind: 'data', ptyId, data: value.data } : null
    case 'exit':
      return isFiniteNum(value.exitCode) && isFiniteNum(value.durationMs)
        ? { kind: 'exit', ptyId, exitCode: value.exitCode, durationMs: value.durationMs }
        : null
    case 'activity':
      return typeof value.error === 'boolean' ? { kind: 'activity', ptyId, error: value.error } : null
    case 'awaiting':
      return { kind: 'awaiting', ptyId }
    case 'cwd':
      return isStr(value.cwd) ? { kind: 'cwd', ptyId, cwd: value.cwd } : null
    case 'recLimit':
      return value.reason === 'duration' || value.reason === 'size'
        ? { kind: 'recLimit', ptyId, reason: value.reason }
        : null
    default:
      return null
  }
}

/** Parse one daemon -> client frame. The daemon is trusted less than a peer we
 *  wrote ourselves would suggest: it may be a stale build, so validate shapes. */
export function parseServerFrame(line: string): ParseResult<ServerFrame> {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return { ok: false, reason: 'json' }
  }
  if (!isRecord(raw) || !isFiniteNum(raw.v)) return { ok: false, reason: 'shape' }
  if (raw.v !== DAEMON_PROTOCOL_VERSION) return { ok: false, reason: 'version' }
  if (raw.type === 'reply') {
    if (!isFiniteNum(raw.rid) || typeof raw.ok !== 'boolean') return { ok: false, reason: 'shape' }
    if (raw.ok) {
      return { ok: true, value: { v: raw.v, type: 'reply', rid: Math.trunc(raw.rid), ok: true, result: raw.result } }
    }
    return {
      ok: true,
      value: {
        v: raw.v,
        type: 'reply',
        rid: Math.trunc(raw.rid),
        ok: false,
        error: isStr(raw.error) ? raw.error : 'daemon error'
      }
    }
  }
  if (raw.type === 'event') {
    const event = validateEvent(raw.event)
    return event ? { ok: true, value: { v: raw.v, type: 'event', event } } : { ok: false, reason: 'shape' }
  }
  return { ok: false, reason: 'unknown-type' }
}

/** Build the local pipe path for a given random suffix. Windows only. */
export function daemonPipePath(suffix: string): string {
  return `\\\\.\\pipe\\termflow-daemon-${suffix}`
}

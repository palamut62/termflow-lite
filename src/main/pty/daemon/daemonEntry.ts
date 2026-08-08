// ---------------------------------------------------------------------------
// TermFlow PTY daemon.
//
// Runs as a DETACHED child of the Electron main process, launched through
// Electron's own binary with ELECTRON_RUN_AS_NODE=1 so the @lydell/node-pty
// prebuild keeps the exact same ABI as the app. It outlives the app window:
// closing TermFlow detaches, reopening it re-attaches to the same shells.
//
// It listens on a local Windows named pipe only — no TCP port is ever opened —
// and every inbound frame must carry the session token that was handed to this
// process through its environment. See ../../shared/ptyDaemonProtocol.ts.
//
// IMPORTANT: this file must never import `electron`; it runs in plain Node mode.
// ---------------------------------------------------------------------------
import net from 'net'
import { appendFileSync } from 'fs'
import {
  DAEMON_PROTOCOL_VERSION,
  DEFAULT_DAEMON_IDLE_MS,
  FrameSplitter,
  encodeFrame,
  parseClientFrame,
  type ClientFrame,
  type DaemonEvent,
  type ServerFrame
} from '../../../shared/ptyDaemonProtocol'
import { PtyCore } from '../PtyCore'
import { warmPathCache } from '../shells'

// Same warm-up as the main process: the daemon spawns shells too.
warmPathCache()

const token =process.env.TERMFLOW_DAEMON_TOKEN || ''
const pipePath = process.env.TERMFLOW_DAEMON_PIPE || ''
const logPath = process.env.TERMFLOW_DAEMON_LOG || ''
const idleMs = Number(process.env.TERMFLOW_DAEMON_IDLE_MS) || DEFAULT_DAEMON_IDLE_MS

/** Diagnostics only. Never receives PTY output, env vars or the session token. */
function log(message: string): void {
  if (!logPath) return
  try {
    appendFileSync(logPath, `${new Date().toISOString()} ${message}\n`, 'utf8')
  } catch {
    /* logging must never take the daemon down */
  }
}

if (!token || !pipePath) {
  log('refusing to start: missing pipe/token configuration')
  process.exit(2)
}

const clients = new Set<net.Socket>()
let lastActivity = Date.now()

function broadcast(event: DaemonEvent): void {
  if (clients.size === 0) return
  const frame: ServerFrame = { v: DAEMON_PROTOCOL_VERSION, type: 'event', event }
  const line = encodeFrame(frame)
  for (const socket of clients) {
    if (!socket.destroyed) socket.write(line)
  }
}

const core = new PtyCore(broadcast)

function reply(socket: net.Socket, rid: number, result: unknown): void {
  if (rid === 0 || socket.destroyed) return
  socket.write(encodeFrame({ v: DAEMON_PROTOCOL_VERSION, type: 'reply', rid, ok: true, result }))
}

function replyError(socket: net.Socket, rid: number, error: string): void {
  if (rid === 0 || socket.destroyed) return
  socket.write(encodeFrame({ v: DAEMON_PROTOCOL_VERSION, type: 'reply', rid, ok: false, error }))
}

function shutdown(killTerminals: boolean): void {
  if (killTerminals) core.killAll()
  for (const socket of clients) socket.destroy()
  try {
    server.close()
  } catch {
    /* already closing */
  }
  log(`shutting down (killTerminals=${killTerminals})`)
  // Give buffered writes a tick to drain before tearing the process down.
  setTimeout(() => process.exit(0), 50)
}

function handle(socket: net.Socket, frame: ClientFrame): void {
  lastActivity = Date.now()
  const { rid, msg } = frame
  switch (msg.type) {
    case 'hello':
      return reply(socket, rid, { version: DAEMON_PROTOCOL_VERSION, pid: process.pid, terminals: core.list() })
    case 'list':
      return reply(socket, rid, core.list())
    case 'create':
      // `reuse` makes attach idempotent: reconnecting to a live shell must not
      // kill and respawn it.
      return reply(socket, rid, core.create(msg.ptyId, msg.input, true))
    case 'write':
      return core.write(msg.ptyId, msg.data)
    case 'resize':
      return core.resize(msg.ptyId, msg.cols, msg.rows)
    case 'kill':
      return core.kill(msg.ptyId)
    case 'killAll':
      return core.killAll()
    case 'setMode':
      return core.setMode(msg.ptyId, msg.mode)
    case 'restart':
      return reply(socket, rid, core.restart(msg.ptyId))
    case 'snapshot':
      return reply(socket, rid, core.getBufferInfo(msg.ptyId))
    case 'config':
      if (msg.scrollback !== undefined && msg.scrollback > 0) core.setScrollback(msg.scrollback)
      if (msg.passiveIntervalMs !== undefined && msg.passiveIntervalMs > 0) core.setPassiveInterval(msg.passiveIntervalMs)
      return
    case 'recStart':
      return core.startRecording(msg.ptyId)
    case 'recStop':
      return reply(socket, rid, core.stopRecording(msg.ptyId))
    case 'recGet':
      return reply(socket, rid, core.getRecording(msg.ptyId))
    case 'shutdown':
      reply(socket, rid, { ok: true })
      return shutdown(true)
  }
}

const server = net.createServer((socket) => {
  socket.setNoDelay(true)
  clients.add(socket)
  lastActivity = Date.now()
  const splitter = new FrameSplitter()

  socket.on('data', (chunk) => {
    const { lines, overflow } = splitter.push(chunk)
    for (const line of lines) {
      const parsed = parseClientFrame(line, token)
      if (!parsed.ok) {
        // A bad token or a wrong protocol version is fatal for the connection;
        // malformed/unknown frames are simply skipped.
        if (parsed.reason === 'auth' || parsed.reason === 'version') {
          log(`dropping client: ${parsed.reason}`)
          socket.destroy()
          return
        }
        continue
      }
      try {
        handle(socket, parsed.value)
      } catch (err) {
        log(`handler failure: ${err instanceof Error ? err.name : 'unknown'}`)
      }
    }
    if (overflow) {
      log('dropping client: oversized frame')
      socket.destroy()
    }
  })

  const drop = (): void => {
    clients.delete(socket)
    lastActivity = Date.now()
  }
  socket.on('close', drop)
  socket.on('error', drop)
})

server.on('error', (err) => {
  log(`server error: ${(err as NodeJS.ErrnoException).code || 'unknown'}`)
  process.exit(3)
})

server.listen(pipePath, () => {
  log(`listening (pid ${process.pid})`)
})

// Idle reaper: exit once there is nothing left to keep alive — no PTYs, no
// attached clients, and the idle window has elapsed.
const IDLE_CHECK_MS = 60_000
setInterval(() => {
  if (core.count() > 0 || clients.size > 0) {
    lastActivity = Date.now()
    return
  }
  if (Date.now() - lastActivity >= idleMs) shutdown(false)
}, IDLE_CHECK_MS).unref?.()

// Keep the process alive even without an interval reference.
process.on('uncaughtException', (err) => {
  log(`uncaught: ${err instanceof Error ? err.name : 'unknown'}`)
})
process.on('SIGTERM', () => shutdown(true))

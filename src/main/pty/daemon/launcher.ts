import net from 'net'
import { spawn } from 'child_process'
import { randomBytes } from 'crypto'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'fs'
import { join } from 'path'
import {
  DAEMON_PROTOCOL_VERSION,
  DEFAULT_DAEMON_IDLE_MS,
  daemonPipePath
} from '../../../shared/ptyDaemonProtocol'

/**
 * Session file describing the currently running daemon. It contains the shared
 * secret, so it is written with 0600 and lives in the per-user userData folder
 * (already ACL'd to the current Windows account).
 */
interface DaemonSession {
  version: number
  pipe: string
  token: string
}

export interface DaemonConnection {
  socket: net.Socket
  token: string
  pipe: string
}

const SESSION_FILE = 'pty-daemon.json'
const CONNECT_TIMEOUT_MS = 2000
/** Bounded, exponentially spaced attempts — never an infinite restart loop. */
const CONNECT_BACKOFF_MS = [150, 300, 600, 1200, 2400]
const MAX_SPAWNS_PER_APP_RUN = 3

let spawnsThisRun = 0

function sessionPath(userDataDir: string): string {
  return join(userDataDir, SESSION_FILE)
}

function readSession(userDataDir: string): DaemonSession | null {
  const file = sessionPath(userDataDir)
  if (!existsSync(file)) return null
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<DaemonSession>
    if (typeof raw.token !== 'string' || raw.token.length < 32) return null
    if (typeof raw.pipe !== 'string' || !raw.pipe.startsWith('\\\\.\\pipe\\')) return null
    if (raw.version !== DAEMON_PROTOCOL_VERSION) return null
    return { version: raw.version, pipe: raw.pipe, token: raw.token }
  } catch {
    return null
  }
}

function writeSession(userDataDir: string, session: DaemonSession): void {
  const file = sessionPath(userDataDir)
  writeFileSync(file, JSON.stringify(session), { encoding: 'utf8', mode: 0o600 })
  try {
    // Best effort on Windows (POSIX bits are only partially honoured there);
    // the real protection is the per-user userData ACL.
    chmodSync(file, 0o600)
  } catch {
    /* non-POSIX filesystem */
  }
}

function tryConnect(pipe: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(pipe)
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(new Error('daemon connect timeout'))
    }, timeoutMs)
    socket.once('connect', () => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.setNoDelay(true)
      resolve(socket)
    })
    socket.once('error', (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      reject(err)
    })
  })
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function spawnDaemon(session: DaemonSession, daemonEntry: string, logPath: string, idleMs: number): void {
  const child = spawn(process.execPath, [daemonEntry], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      // Run Electron's bundled Node directly so the node-pty prebuild keeps the
      // same ABI as the app process.
      ELECTRON_RUN_AS_NODE: '1',
      TERMFLOW_DAEMON_TOKEN: session.token,
      TERMFLOW_DAEMON_PIPE: session.pipe,
      TERMFLOW_DAEMON_LOG: logPath,
      TERMFLOW_DAEMON_IDLE_MS: String(idleMs)
    }
  })
  child.unref()
}

export interface LaunchOptions {
  userDataDir: string
  /** Absolute path to the built daemon entry (out/main/ptyDaemon.js). */
  daemonEntry: string
  idleMs?: number
}

/**
 * Packaged builds keep the daemon under app.asar.unpacked (see
 * electron-builder.yml) so the detached Node process can read it as a real
 * file. Prefer that copy whenever it exists.
 */
function resolveDaemonEntry(entry: string): string {
  if (!entry.includes('app.asar')) return entry
  const unpacked = entry.replace('app.asar', 'app.asar.unpacked')
  return existsSync(unpacked) ? unpacked : entry
}

/**
 * Attach to the running PTY daemon, starting a new one if none is reachable.
 * Throws (so the caller can fall back to the in-process backend) instead of
 * retrying forever: attempts are capped both per call and per app run.
 */
export async function connectOrStartDaemon(options: LaunchOptions): Promise<DaemonConnection> {
  const idleMs = options.idleMs ?? DEFAULT_DAEMON_IDLE_MS
  const logPath = join(options.userDataDir, 'pty-daemon.log')

  const existing = readSession(options.userDataDir)
  if (existing) {
    try {
      const socket = await tryConnect(existing.pipe)
      return { socket, token: existing.token, pipe: existing.pipe }
    } catch {
      /* stale session file — fall through and start a fresh daemon */
    }
  }

  if (spawnsThisRun >= MAX_SPAWNS_PER_APP_RUN) {
    throw new Error('pty daemon start attempts exhausted')
  }
  const daemonEntry = resolveDaemonEntry(options.daemonEntry)
  if (!existsSync(daemonEntry)) {
    throw new Error('pty daemon entry not found')
  }
  spawnsThisRun++

  const session: DaemonSession = {
    version: DAEMON_PROTOCOL_VERSION,
    pipe: daemonPipePath(randomBytes(12).toString('hex')),
    token: randomBytes(32).toString('hex')
  }
  writeSession(options.userDataDir, session)
  spawnDaemon(session, daemonEntry, logPath, idleMs)

  let lastError: unknown
  for (const wait of CONNECT_BACKOFF_MS) {
    await delay(wait)
    try {
      const socket = await tryConnect(session.pipe)
      return { socket, token: session.token, pipe: session.pipe }
    } catch (err) {
      lastError = err
    }
  }
  throw new Error(`pty daemon unreachable: ${lastError instanceof Error ? lastError.message : 'unknown'}`)
}

/** Reset the per-run spawn budget (used after an explicit daemon shutdown). */
export function resetDaemonSpawnBudget(): void {
  spawnsThisRun = 0
}

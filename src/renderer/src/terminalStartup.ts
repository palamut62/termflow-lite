/**
 * Optimistic-terminal-startup plumbing.
 *
 * A new pane is rendered BEFORE its PTY exists, so xterm mounts, measures its
 * real cell grid and reports it here. `awaitTerminalSize` lets the store hand
 * that measurement straight to `pty.create`, which then spawns ConPTY at the
 * final size — no startup resize, no rewrap, and full-screen TUIs (claude,
 * codex, opencode) draw their very first frame at the correct width.
 *
 * Everything is time-bounded: if the pane cannot be measured (hidden tab,
 * layout not settled) the wait falls through and the PTY spawns at the default
 * size exactly like before.
 */

export interface TerminalSize {
  cols: number
  rows: number
}

const measured = new Map<string, TerminalSize>()
const waiters = new Map<string, ((size: TerminalSize | null) => void)[]>()

/** Called by TerminalView as soon as it has a valid fit measurement. */
export function reportTerminalSize(terminalId: string, cols: number, rows: number): void {
  if (!(cols > 0) || !(rows > 0)) return
  measured.set(terminalId, { cols, rows })
  const pending = waiters.get(terminalId)
  if (pending) {
    waiters.delete(terminalId)
    for (const resolve of pending) resolve({ cols, rows })
  }
}

/** Drop bookkeeping for a terminal that is going away. */
export function forgetTerminalSize(terminalId: string): void {
  measured.delete(terminalId)
  const pending = waiters.get(terminalId)
  if (pending) {
    waiters.delete(terminalId)
    for (const resolve of pending) resolve(null)
  }
}

/**
 * Resolve with the pane's measured size, waiting at most `timeoutMs` for the
 * freshly mounted xterm to report it. Never rejects.
 */
export function awaitTerminalSize(terminalId: string, timeoutMs = 120): Promise<TerminalSize | null> {
  const known = measured.get(terminalId)
  if (known) return Promise.resolve(known)
  return new Promise((resolve) => {
    let settled = false
    const done = (size: TerminalSize | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(size)
    }
    const timer = setTimeout(() => {
      const list = waiters.get(terminalId)
      if (list) {
        const idx = list.indexOf(done)
        if (idx >= 0) list.splice(idx, 1)
        if (!list.length) waiters.delete(terminalId)
      }
      done(null)
    }, timeoutMs)
    const list = waiters.get(terminalId)
    if (list) list.push(done)
    else waiters.set(terminalId, [done])
  })
}

// ---- Perf instrumentation (dev only) ----
// Measures the user-visible latency: the moment the store asks for a terminal
// until the first PTY byte is painted in the renderer.

const PERF_ENABLED = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV

const startedAt = new Map<string, { t0: number; label: string }>()

export function markTerminalCreateStart(terminalId: string, label: string): void {
  if (!PERF_ENABLED) return
  startedAt.set(terminalId, { t0: performance.now(), label })
}

export function markTerminalCreateReturned(terminalId: string): void {
  if (!PERF_ENABLED) return
  const entry = startedAt.get(terminalId)
  if (entry) console.debug(`[perf] ${entry.label} create() returned in ${Math.round(performance.now() - entry.t0)}ms`)
}

export function markTerminalFirstData(terminalId: string): void {
  if (!PERF_ENABLED) return
  const entry = startedAt.get(terminalId)
  if (!entry) return
  startedAt.delete(terminalId)
  console.debug(`[perf] ${entry.label} create()->first output ${Math.round(performance.now() - entry.t0)}ms`)
}

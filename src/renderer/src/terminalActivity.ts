// Per-terminal output "busyness" tracker.
//
// When running CLI AI agents (claude, codex, opencode, grok, gemini …) across
// several panes, the single hardest thing is knowing *which* pane is actually
// working right now versus which one has finished and is waiting for you. The
// PTY process status (running/exited) can't answer that — the shell stays
// "running" the whole time. What actually distinguishes "the agent is thinking"
// from "the agent is done" is the flow of output: an agent that is working
// streams tokens; an agent that is waiting for input goes quiet.
//
// So we watch the raw PTY output. While chunks keep arriving a terminal is
// `busy`; after a short quiet window it flips to `idle`. The UI turns that into
// a small pulse badge on each pane so you can glance across a grid of agents and
// see at a glance who is still crunching.

export type ActivityState = 'busy' | 'idle'

// How long the output must stay quiet before we call an agent idle. Agents
// stream in bursts (a line, a pause to call a tool, another line), so this has
// to be long enough not to flicker between bursts but short enough to feel
// responsive when the agent genuinely stops and hands control back.
const IDLE_AFTER_MS = 800

// A busy stretch shorter than this is a quick shell command (`ls`, `git status`,
// a build line) — not worth flagging. Only a sustained stretch looks like a real
// agent turn (thinking, editing, running tools), and *that* is what's worth
// telling you about when it finishes in a pane you weren't watching.
const ATTENTION_MIN_BUSY_MS = 4000

const lastDataAt = new Map<string, number>()
// When the current busy stretch began (cleared on going idle). Used to measure
// how long a turn ran so we can distinguish agent work from quick commands.
const busyStartedAt = new Map<string, number>()
// Terminals that finished a long turn and haven't been looked at since.
const attention = new Set<string>()
const listeners = new Set<() => void>()
// Fired once at the moment a terminal newly enters the attention state — used to
// raise an OS notification when the app isn't focused. Distinct from `listeners`
// (which fire on every state change) so a one-shot side effect isn't run on
// every idle sweep.
const attentionRaisedListeners = new Set<(terminalId: string) => void>()
let sweepTimer: ReturnType<typeof setTimeout> | null = null

function notify(): void {
  for (const cb of listeners) {
    try {
      cb()
    } catch {
      // A broken listener must not stop the others from being told.
    }
  }
}

// A single shared timer sweeps busy → idle rather than one timer per terminal:
// with a dozen panes streaming that would be a dozen timers churning. The sweep
// only runs while at least one terminal is still busy.
function scheduleSweep(): void {
  if (sweepTimer) return
  sweepTimer = setTimeout(() => {
    sweepTimer = null
    const now = Date.now()
    let anyBusy = false
    for (const [id, at] of lastDataAt) {
      if (now - at < IDLE_AFTER_MS) {
        anyBusy = true
        continue
      }
      // This terminal just went quiet. If it was busy long enough to be a real
      // agent turn, flag it for attention — the UI shows the flag only on panes
      // that aren't currently focused, and focusing one clears it.
      const start = busyStartedAt.get(id)
      if (start != null) {
        if (now - start >= ATTENTION_MIN_BUSY_MS && !attention.has(id)) {
          attention.add(id)
          for (const cb of attentionRaisedListeners) {
            try {
              cb(id)
            } catch {
              // A broken listener must not stop the others.
            }
          }
        }
        busyStartedAt.delete(id)
      }
    }
    notify()
    if (anyBusy) scheduleSweep()
  }, IDLE_AFTER_MS)
}

/** Record that output just arrived for a terminal. Cheap; call it per chunk. */
export function pulseActivity(terminalId: string): void {
  const was = getActivityState(terminalId)
  lastDataAt.set(terminalId, Date.now())
  if (was !== 'busy') {
    // Start of a new busy stretch — remember when so we can time the turn.
    busyStartedAt.set(terminalId, Date.now())
    notify()
  }
  scheduleSweep()
}

export function getActivityState(terminalId: string): ActivityState {
  const at = lastDataAt.get(terminalId)
  if (at == null) return 'idle'
  return Date.now() - at < IDLE_AFTER_MS ? 'busy' : 'idle'
}

/**
 * How long the current busy stretch has run, in ms — or null if the terminal
 * isn't busy right now. Lets the UI show a live "this agent has been working for
 * N seconds" timer so a stuck turn is obvious.
 */
export function getBusyElapsedMs(terminalId: string): number | null {
  if (getActivityState(terminalId) !== 'busy') return null
  const start = busyStartedAt.get(terminalId)
  if (start == null) return null
  return Math.max(0, Date.now() - start)
}

/** Forget a terminal when its pane closes. */
export function clearActivity(terminalId: string): void {
  busyStartedAt.delete(terminalId)
  const hadAttention = attention.delete(terminalId)
  if (lastDataAt.delete(terminalId) || hadAttention) notify()
}

/** True if a long agent turn finished here and the pane hasn't been looked at. */
export function hasAttention(terminalId: string): boolean {
  return attention.has(terminalId)
}

/** Clear the attention flag — call when the pane is focused/activated. */
export function acknowledgeAttention(terminalId: string): void {
  if (attention.delete(terminalId)) notify()
}

/**
 * Reset all module state. Only for tests — production never tears down its
 * timers, but vitest swaps the fake clock between cases, which would otherwise
 * strand the shared sweep-timer handle.
 */
export function _resetActivityForTests(): void {
  if (sweepTimer) clearTimeout(sweepTimer)
  sweepTimer = null
  lastDataAt.clear()
  busyStartedAt.clear()
  attention.clear()
  listeners.clear()
  attentionRaisedListeners.clear()
}

/** Subscribe to any activity change. Returns an unsubscribe fn. */
export function onActivityChanged(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * Subscribe to the one-shot "a long agent turn just finished" event. Fires with
 * the terminal id at the moment it enters the attention state — the hook for
 * raising an OS notification when the app isn't focused. Returns an unsubscribe.
 */
export function onAttentionRaised(cb: (terminalId: string) => void): () => void {
  attentionRaisedListeners.add(cb)
  return () => {
    attentionRaisedListeners.delete(cb)
  }
}

import type { AppSettings, WindowDef } from '../../../shared/types'
import { getLeafTerminalIds } from '../paneUtils'

// Desktop notifications for long-running commands, error output, and a
// generic output-pattern trigger — the terminal printed something that looks
// like it is waiting for input (a confirmation/prompt). No profile is
// special-cased: any terminal can raise it. Fires
// even while the window is minimized/hidden to the tray — the native
// Notification API keeps working in a backgrounded renderer, and clicking a
// notification asks main to restore/focus the window before selecting the
// originating node.

interface NotifyStore {
  getState: () => {
    settings: AppSettings
    nodes: WindowDef[]
    setActiveNode: (nodeId: string | null) => void
  }
}

let store: NotifyStore | null = null
let permissionRequested = false

export function registerNotificationStore(s: NotifyStore): void {
  store = s
}

function ensurePermission(): void {
  if (permissionRequested) return
  permissionRequested = true
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {
      /* ignored — user declined or platform unsupported */
    })
  }
}

function findNodeForTerminal(nodes: WindowDef[], terminalId: string): WindowDef | undefined {
  return nodes.find((n) => n.terminalId === terminalId || (n.panes ? getLeafTerminalIds(n.panes).includes(terminalId) : false))
}

function fire(title: string, body: string, terminalId: string): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  let n: Notification
  try {
    n = new Notification(title, { body, silent: false })
  } catch {
    return // some platforms throw if notifications are unsupported/disabled
  }
  n.onclick = () => {
    window.termflow.window.focus()
    window.focus()
    const st = store?.getState()
    const node = st ? findNodeForTerminal(st.nodes, terminalId) : undefined
    if (node) st!.setActiveNode(node.id)
    n.close()
  }
}

export function initNotifications(): void {
  ensurePermission()
}

export function notifyLongCommandDone(terminalId: string, terminalName: string, exitCode: number, durationMs: number): void {
  const s = store?.getState().settings
  if (!s?.notificationsEnabled || !s.notifyOnLongCommand) return
  if (durationMs < s.longCommandThresholdMs) return
  ensurePermission()
  const seconds = Math.round(durationMs / 1000)
  fire(`${terminalName} finished`, `Exit code ${exitCode} · took ${seconds}s`, terminalId)
}

export function notifyError(terminalId: string, terminalName: string): void {
  const s = store?.getState().settings
  if (!s?.notificationsEnabled || !s.notifyOnError) return
  ensurePermission()
  fire(`${terminalName}: error detected`, 'An error pattern was detected in the terminal output.', terminalId)
}

// A long agent turn finished. Unlike notifyLongCommandDone (which keys off
// shell-integration command boundaries), CLI agents like claude run as one
// long-lived process, so their per-turn work is invisible to shell integration.
// This fires off the output-activity tracker instead. We only raise it when the
// app isn't focused — if you're already looking at TermFlow the in-app amber
// activity dot is enough, and a desktop toast would just be noise. Gated on the
// same notifyOnLongCommand setting (it is the "a long task finished" toggle).
export function notifyAgentTurnDone(terminalId: string, terminalName: string): void {
  const s = store?.getState().settings
  if (!s?.notificationsEnabled || !s.notifyOnLongCommand) return
  // Skip when TermFlow has focus — the user is already here and can see the dot.
  if (typeof document !== 'undefined' && document.hasFocus()) return
  ensurePermission()
  fire(`${terminalName} finished`, 'The agent finished its turn and is waiting for you.', terminalId)
}

// Generic output-pattern notification: the terminal's output matched the
// "waiting for input" pattern. Settings key is still notifyOnAgentWaiting for
// backwards compatibility with stored settings.
export function notifyOutputPattern(terminalId: string, terminalName: string): void {
  const s = store?.getState().settings
  if (!s?.notificationsEnabled || !s.notifyOnAgentWaiting) return
  ensurePermission()
  fire(`${terminalName}: waiting for input`, 'The terminal output matched the "waiting for input" pattern.', terminalId)
}

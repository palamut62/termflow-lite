import { useEffect } from 'react'
import { useSyncExternalStore } from 'react'
import {
  getActivityState,
  getBusyElapsedMs,
  hasAttention,
  acknowledgeAttention,
  onActivityChanged,
  type ActivityState
} from '../terminalActivity'

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Subscribes a component to one terminal's output activity. Re-renders only when
// that terminal (or the shared sweep) fires a change.
export function useActivityState(terminalId: string): ActivityState {
  return useSyncExternalStore(onActivityChanged, () => getActivityState(terminalId))
}

function useAttention(terminalId: string): boolean {
  return useSyncExternalStore(onActivityChanged, () => hasAttention(terminalId))
}

// A small dot that reflects the pane's agent state:
//   • busy   → pulsing accent  (an AI CLI is actively streaming output)
//   • needs-you → steady amber (a long turn finished in a pane you weren't on)
//   • idle   → dim + still     (quiet / waiting)
// The attention flag is cleared the moment the pane becomes active, so it only
// ever draws your eye to *background* panes that finished work.
export function ActivityBadge({
  terminalId,
  active = false,
  showElapsed = false,
  size = 7
}: {
  terminalId: string
  active?: boolean
  showElapsed?: boolean
  size?: number
}): JSX.Element {
  const state = useActivityState(terminalId)
  const attention = useAttention(terminalId)

  useEffect(() => {
    if (active) acknowledgeAttention(terminalId)
  }, [active, terminalId, state])

  const busy = state === 'busy'
  const needsYou = attention && !active
  const cls = busy ? 'activity-dot busy' : needsYou ? 'activity-dot attention' : 'activity-dot'
  const label = busy ? 'Agent working' : needsYou ? 'Finished — waiting for you' : 'Idle'
  // Only surface the timer once a turn has run long enough to be worth watching —
  // avoids a "0:00" flicker on every quick command.
  const elapsedMs = busy && showElapsed ? getBusyElapsedMs(terminalId) : null
  const elapsed = elapsedMs != null && elapsedMs >= 1500 ? formatElapsed(elapsedMs) : null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        className={cls}
        aria-label={label}
        title={busy ? 'Working…' : needsYou ? 'Finished — waiting for you' : 'Idle'}
        style={{ width: size, height: size }}
      />
      {elapsed && <span className="activity-elapsed" title="Time on the current turn">{elapsed}</span>}
    </span>
  )
}

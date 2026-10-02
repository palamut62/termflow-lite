// Rows for the compact widget, derived only from real session state (tab
// activity, process state, the latest agent event). Nothing is invented: a
// state the data cannot back up shows as idle/unknown, never as running.

import type { AgentEventKind, TerminalTab } from '../../../shared/types'

export type WidgetRowState = 'running' | 'done' | 'needs-you' | 'failed' | 'idle' | 'unknown'

export interface WidgetRow {
  tabId: string
  state: WidgetRowState
  /** Symbol + word, so the state never relies on color alone. */
  label: string
  task: string
  time: string
}

export interface WidgetSummary {
  running: number
  done: number
  needsYou: number
  failed: number
}

export const STATE_LABELS: Record<WidgetRowState, string> = {
  running: '* running',
  done: '✓ done',
  'needs-you': '! needs you',
  failed: '× failed',
  idle: '- idle',
  unknown: '? unknown'
}

/** The widget state of one tab. `eventKind` is the tab's latest agent event. */
export function widgetRowState(tab: Pick<TerminalTab, 'activity' | 'running'>, eventKind?: AgentEventKind): WidgetRowState {
  if (tab.activity === 'error') return 'failed'
  if (tab.activity === 'completed') return 'done'
  if (tab.activity === 'running' || tab.activity === 'unread') return tab.running ? 'running' : 'unknown'
  if (tab.activity === 'waiting') return eventKind === 'approval' || eventKind === 'question' ? 'needs-you' : 'idle'
  return 'unknown'
}

/** mm:ss, or h:mm:ss past an hour. */
export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return hours > 0 ? `${hours}:${mmss}` : mmss
}

function basename(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
}

/** "Claude Code / build": the profile, then the folder it works in. */
export function taskName(profileName: string, tab: Pick<TerminalTab, 'cwd' | 'launchCwd' | 'title'>): string {
  const folder = basename(tab.cwd || tab.launchCwd || '')
  const name = profileName || tab.title
  return folder ? `${name} / ${folder}` : name
}

export function widgetRows(
  tabs: TerminalTab[],
  profileName: (tab: TerminalTab) => string,
  eventKind: (tabId: string) => AgentEventKind | undefined,
  now: number
): WidgetRow[] {
  return tabs.map((tab) => {
    const state = widgetRowState(tab, eventKind(tab.id))
    const since = tab.busySince ?? tab.startedAt
    const time = state === 'running' ? formatClock(now - since)
      : state === 'done' ? (tab.busyUntil ? formatClock(tab.busyUntil - since) : '--:--')
        : state === 'needs-you' ? 'waiting'
          : state === 'failed' ? 'failed'
            : state === 'idle' ? 'idle'
              : '--'
    return { tabId: tab.id, state, label: STATE_LABELS[state], task: taskName(profileName(tab), tab), time }
  })
}

export function widgetSummary(rows: WidgetRow[]): WidgetSummary {
  return {
    running: rows.filter((row) => row.state === 'running').length,
    done: rows.filter((row) => row.state === 'done').length,
    needsYou: rows.filter((row) => row.state === 'needs-you').length,
    failed: rows.filter((row) => row.state === 'failed').length
  }
}

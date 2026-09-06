// Grouping logic for the session rail: long-lived agent sessions are easier to
// scan as a repository -> checkout -> session tree than as a row of tabs that
// stops being readable past six or seven entries.

import type { TabActivity, TerminalTab } from '../../shared/types'

export interface RailSession {
  id: string
  title: string
  activity: TabActivity
  /** Branch of the isolated checkout this session runs in, when it has one. */
  branch?: string
  active: boolean
}

export interface RailGroup {
  /** Stable identity: the repository root, a plain path, or '' when unknown. */
  key: string
  /** Human label — the last path segment, or 'No folder'. */
  label: string
  /** Full path, shown as the row tooltip. */
  path: string
  sessions: RailSession[]
}

export const NO_FOLDER_LABEL = 'No folder'

/** Trailing segment of a path, tolerating either separator and trailing slashes. */
export function pathLabel(path: string): string {
  const trimmed = String(path ?? '').replace(/[\\/]+$/, '')
  if (!trimmed) return NO_FOLDER_LABEL
  const segments = trimmed.split(/[\\/]/)
  const last = segments[segments.length - 1]
  // A drive root ('C:') has no trailing segment of its own.
  return last || trimmed
}

/**
 * Path a tab belongs to. Worktree tabs are attributed to their repository so
 * every checkout of one project stays in the same group, rather than each
 * isolated checkout forming its own top-level entry.
 */
export function groupPathFor(tab: TerminalTab, repoRoots: Map<string, string> = new Map()): string {
  if (tab.worktree) return tab.worktree.repoRoot
  const cwd = tab.launchCwd || tab.cwd || ''
  return repoRoots.get(cwd) || cwd
}

/**
 * Build the rail tree. Groups appear in the order their first session does, so
 * the list never reshuffles under the user as activity changes.
 *
 * `repoRoots` maps a tab cwd to its resolved git repository root; unresolved
 * paths simply group by themselves.
 */
export function buildRailGroups(
  tabs: TerminalTab[],
  activeTabId: string | null,
  repoRoots: Map<string, string> = new Map()
): RailGroup[] {
  const groups = new Map<string, RailGroup>()
  for (const tab of tabs) {
    const path = groupPathFor(tab, repoRoots)
    let group = groups.get(path)
    if (!group) {
      group = { key: path, label: pathLabel(path), path, sessions: [] }
      groups.set(path, group)
    }
    group.sessions.push({
      id: tab.id,
      title: tab.title,
      activity: tab.activity,
      branch: tab.worktree?.branch,
      active: tab.id === activeTabId
    })
  }
  return [...groups.values()]
}

/** Activity worth surfacing on a collapsed group header. */
const ATTENTION: TabActivity[] = ['error', 'waiting', 'unread']

/**
 * Most urgent activity inside a group, or null when nothing needs attention —
 * this is what a collapsed group shows instead of its sessions.
 */
export function groupAttention(group: RailGroup): TabActivity | null {
  for (const activity of ATTENTION) {
    if (group.sessions.some((session) => session.activity === activity)) return activity
  }
  return null
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, GitBranch, X } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { buildRailGroups, groupAttention, type RailGroup } from '../sessionRail'
import { TabIcon } from '../tabs/TabIcon'

const MIN_WIDTH = 150
const MAX_WIDTH = 420

/**
 * Repository -> session tree along the left edge. The tab bar stops being
 * readable past a handful of long-lived agent sessions; this keeps every
 * session addressable with its activity state visible at a glance.
 *
 * Repository roots are resolved once per working directory and cached, so
 * scrolling the rail never re-runs git.
 */
export function SessionRail(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const width = useSettingsStore((s) => s.settings.sessionRailWidth)
  const [repoRoots, setRepoRoots] = useState<Map<string, string>>(new Map())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Distinct launch directories that still need a repository lookup.
  const pendingPaths = useMemo(() => {
    const paths = new Set<string>()
    for (const tab of tabs) {
      const cwd = tab.worktree ? '' : tab.launchCwd || tab.cwd || ''
      if (cwd && !repoRoots.has(cwd)) paths.add(cwd)
    }
    return [...paths]
  }, [tabs, repoRoots])

  useEffect(() => {
    if (pendingPaths.length === 0) return
    let cancelled = false
    void (async () => {
      const resolved: [string, string][] = []
      for (const path of pendingPaths) {
        const info = await window.termflow.worktree.repoInfo(path)
        // Cache the miss as the path itself so a non-repo folder is asked once.
        resolved.push([path, info?.root ?? path])
      }
      if (cancelled) return
      setRepoRoots((previous) => {
        const next = new Map(previous)
        for (const [key, value] of resolved) next.set(key, value)
        return next
      })
    })()
    return () => { cancelled = true }
  }, [pendingPaths])

  const groups = useMemo(() => buildRailGroups(tabs, activeTabId, repoRoots), [tabs, activeTabId, repoRoots])

  const toggle = (key: string): void => {
    setCollapsed((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="session-rail" style={{ width }} aria-label="Sessions">
      <div className="session-rail-list" role="tree">
        {groups.map((group) => (
          <RailGroupRow
            key={group.key}
            group={group}
            collapsed={collapsed.has(group.key)}
            onToggle={() => toggle(group.key)}
          />
        ))}
      </div>
      <RailResizer width={width} />
    </div>
  )
}

function RailGroupRow({ group, collapsed, onToggle }: { group: RailGroup; collapsed: boolean; onToggle: () => void }): React.JSX.Element {
  const attention = groupAttention(group)
  return (
    <div className="session-rail-group" role="treeitem" aria-expanded={!collapsed}>
      <button className="session-rail-group-header" onClick={onToggle} title={group.path}>
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <span className="session-rail-group-label">{group.label}</span>
        {/* A collapsed group still has to show that something needs the user. */}
        {collapsed && attention && <span className={`tab-process-indicator tab-activity-${attention}`} aria-label={`Activity: ${attention}`} />}
        <span className="session-rail-count">{group.sessions.length}</span>
      </button>
      {!collapsed && group.sessions.map((session) => (
        <div key={session.id} className={`session-rail-item${session.active ? ' session-rail-item-active' : ''}`}>
          <button
            className="session-rail-select"
            onClick={() => useTerminalStore.getState().setActiveTab(session.id)}
            title={session.branch ? `${session.title} — ${session.branch}` : session.title}
          >
            <TabIcon shellId={sessionProfileId(session.id)} />
            <span className="session-rail-title">{session.title}</span>
            {session.branch && (
              <span className="session-rail-branch"><GitBranch size={10} /><span>{session.branch}</span></span>
            )}
            <span className={`tab-process-indicator tab-activity-${session.activity}`} aria-label={`Activity: ${session.activity}`} />
          </button>
          <button
            className="session-rail-close"
            onClick={() => useTerminalStore.getState().requestCloseTab(session.id)}
            aria-label={`Close ${session.title}`}
            title="Close session"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  )
}

/** Profile of a session, read on demand so RailSession stays presentational. */
function sessionProfileId(tabId: string): string {
  return useTerminalStore.getState().tabs.find((tab) => tab.id === tabId)?.profileId ?? ''
}

/** Drag handle on the rail's right edge; the width is persisted on release. */
function RailResizer({ width }: { width: number }): React.JSX.Element {
  const startRef = useRef<{ x: number; width: number } | null>(null)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    startRef.current = { x: event.clientX, width }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = startRef.current
    if (!start) return
    const next = Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, start.width + (event.clientX - start.x))))
    useSettingsStore.getState().update({ sessionRailWidth: next })
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    startRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div
      className="session-rail-resizer"
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Maximize2, Pin, PinOff } from 'lucide-react'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import type { AgentEventKind } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentEventStore } from '../store/agentEventStore'
import { useWidgetStore } from './widgetStore'
import { widgetRows, widgetSummary, type WidgetSummary } from './widgetModel'
import '../styles/widget.css'

/** Rows that fit the 260 px widget; the rest is counted in the summary. */
const MAX_ROWS = 6

/** Windows draws its window controls over the top-right corner of the window. */
const WINDOWS_CONTROLS_WIDTH = 138

function Summary({ summary }: { summary: WidgetSummary }): React.JSX.Element {
  const parts: React.JSX.Element[] = []
  if (summary.running) parts.push(<span key="r" className="tf-c-run">* {summary.running} running</span>)
  if (summary.done) parts.push(<span key="d" className="tf-c-done">✓ {summary.done} done</span>)
  if (summary.needsYou) parts.push(<span key="n" className="tf-c-warn">! {summary.needsYou} needs you</span>)
  if (summary.failed) parts.push(<span key="f" className="tf-c-alert">× {summary.failed} failed</span>)
  if (!parts.length) parts.push(<span key="i" className="tf-c-muted">no active sessions</span>)
  return (
    <>
      {parts.flatMap((part, i) => (i ? [<span key={`s${i}`} className="tf-c-muted" aria-hidden="true">·</span>, part] : [part]))}
    </>
  )
}

/**
 * Compact status widget (TermFlow widget spec): one terminal-style line per
 * session with its real state, a sweeping character meter and its time.
 * Clicking a line opens that terminal in the full window; it never answers
 * an approval by itself.
 */
export function WidgetView(): React.JSX.Element {
  const tabs = useTerminalStore((state) => state.tabs)
  const settings = useSettingsStore((state) => state.settings)
  const events = useAgentEventStore((state) => state.events)
  const { collapsed, pinned, exit, toggleCollapsed, togglePinned } = useWidgetStore()
  const [now, setNow] = useState(Date.now())

  // Times tick once a second; the meters animate in CSS.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const latestKind = useMemo(() => {
    const map = new Map<string, AgentEventKind>()
    for (const event of events) map.set(event.tabId, event.kind)
    return map
  }, [events])

  const profiles = useMemo(() => mergeProfiles(settings.profiles), [settings.profiles])
  const rows = widgetRows(
    tabs,
    (tab) => providerFromProfileId(settings, tab.profileId)?.name || profiles.find((profile) => profile.id === tab.profileId)?.name || tab.title,
    (tabId) => latestKind.get(tabId),
    now
  )
  const summary = widgetSummary(rows)
  const visible = rows.slice(0, MAX_ROWS)
  const hidden = rows.length - visible.length
  const controlsInset = window.termflow?.system.platform === 'win32' ? { paddingRight: WINDOWS_CONTROLS_WIDTH } : undefined

  const buttons = (
    <>
      <button type="button" className="tf-icon" onClick={() => void togglePinned()} aria-pressed={pinned} aria-label={pinned ? 'Unpin widget' : 'Keep widget on top'} title={pinned ? 'Unpin (stop keeping on top)' : 'Keep on top'}>
        {pinned ? <Pin size={13} /> : <PinOff size={13} />}
      </button>
      <button type="button" className="tf-icon" onClick={() => void toggleCollapsed()} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand widget' : 'Collapse widget'} title={collapsed ? 'Expand' : 'Collapse'}>
        {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
      <button type="button" className="tf-icon" onClick={() => void exit()} aria-label="Open full window" title="Full window">
        <Maximize2 size={13} />
      </button>
    </>
  )

  return (
    <div className={`tf-widget${collapsed ? ' is-collapsed' : ''}`} role="region" aria-label="TermFlow widget">
      <header className="tf-header" style={controlsInset}>
        <span className="tf-title"><span className="tf-c-muted">&gt;_</span> {collapsed ? 'termflow' : 'termflow lite'}</span>
        {collapsed && (
          <span className="tf-inline-summary"><span className="tf-c-muted" aria-hidden="true">|</span> <Summary summary={summary} /></span>
        )}
        {!collapsed && <span className="tf-grip" aria-hidden="true">:::::</span>}
        {buttons}
      </header>
      <div className="tf-body">
        {visible.map((row) => (
          <button
            key={row.tabId}
            type="button"
            className="tf-row"
            data-state={row.state}
            onClick={() => void exit(row.tabId)}
            aria-label={`${row.task}: ${row.label.slice(2)}, ${row.time}. Open terminal.`}
          >
            <span className="tf-state">{row.label}</span>
            <span className="tf-task">{row.task}</span>
            <span className="tf-meter" aria-hidden="true" />
            <span className="tf-time">{row.time}</span>
          </button>
        ))}
        {rows.length === 0 && <div className="tf-empty">No terminals open.</div>}
        <div className="tf-summary">
          <Summary summary={summary} />
          {hidden > 0 && <span className="tf-c-muted">+{hidden} more</span>}
          <button type="button" className="tf-expand" onClick={() => void exit()}>/expand</button>
        </div>
      </div>
    </div>
  )
}

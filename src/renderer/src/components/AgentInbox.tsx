import { useEffect, useMemo } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, ShieldAlert, Trash2, X } from 'lucide-react'
import { useAgentEventStore } from '../store/agentEventStore'
import { useTerminalStore } from '../store/terminalStore'

export function AgentInbox(): React.JSX.Element {
  const events = useAgentEventStore((state) => state.events)
  const hide = useAgentEventStore((state) => state.hide)
  const tabs = useTerminalStore((state) => state.tabs)

  useEffect(() => { void useAgentEventStore.getState().load() }, [])

  const sessions = useMemo(() => {
    const byTab = new Map<string, typeof events>()
    for (const event of events) byTab.set(event.tabId, [...(byTab.get(event.tabId) ?? []), event])
    return [...byTab.entries()].map(([tabId, values]) => ({
      tabId,
      events: values,
      latest: values.at(-1)!,
      tab: tabs.find((tab) => tab.id === tabId)
    })).sort((a, b) => b.latest.createdAt - a.latest.createdAt)
  }, [events, tabs])

  return <aside className="agent-inbox-panel" aria-label="Agent inbox">
    <header className="history-header">
      <span>Agent Inbox</span>
      <div className="agent-session-header-actions">
        <button className="history-icon-btn" onClick={() => useAgentEventStore.getState().clear()} title="Clear event log"><Trash2 size={14} /></button>
        <button className="history-icon-btn" onClick={hide} aria-label="Close agent inbox"><X size={15} /></button>
      </div>
    </header>
    <div className="agent-inbox-summary">
      <span>{sessions.filter((item) => item.tab?.running).length} active</span>
      <span>{sessions.filter((item) => item.latest.kind === 'approval' || item.latest.kind === 'question').length} waiting</span>
      <span>{events.length} events</span>
    </div>
    <div className="agent-inbox-list">
      {sessions.length === 0 && <div className="history-empty">No agent activity recorded yet</div>}
      {sessions.map(({ tabId, tab, latest, events: sessionEvents }) => <button
        key={tabId}
        className="agent-inbox-entry"
        onClick={() => { if (tab) useTerminalStore.getState().setActiveTab(tabId); hide() }}
        disabled={!tab}
      >
        <span className={`agent-inbox-icon agent-inbox-${latest.kind}`}>{iconFor(latest.kind)}</span>
        <span className="agent-inbox-copy">
          <strong>{tab?.title ?? `${latest.agent} session`}</strong>
          <span>{latest.title}</span>
          <small>{latest.permissionMode} · {sessionEvents.length} events · {new Date(latest.createdAt).toLocaleTimeString()}</small>
        </span>
      </button>)}
    </div>
  </aside>
}

function iconFor(kind: string): React.JSX.Element {
  if (kind === 'approval' || kind === 'question') return <ShieldAlert size={16} />
  if (kind === 'error') return <AlertTriangle size={16} />
  if (kind === 'completed') return <CheckCircle2 size={16} />
  return <Clock3 size={16} />
}

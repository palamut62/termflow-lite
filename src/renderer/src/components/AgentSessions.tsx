import { useEffect, useMemo, useState } from 'react'
import { Bot, Folder, LoaderCircle, Play, RefreshCw, Search, X } from 'lucide-react'
import type { AgentKind, AgentSession } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useAgentSessionStore } from '../store/agentSessionStore'
import { agentProfileOptions, continueAgentSession } from '../agentHandover'
import { useHandoverStore } from '../store/handoverStore'

const LABELS: Record<AgentKind, string> = { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode' }

function relativeTime(timestamp: number): string {
  const diff = Math.max(0, Date.now() - timestamp)
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function AgentSessions(): React.JSX.Element {
  const hide = useAgentSessionStore((state) => state.hide)
  const settings = useSettingsStore((state) => state.settings)
  const [sessions, setSessions] = useState<AgentSession[]>([])
  const [query, setQuery] = useState('')
  const [agent, setAgent] = useState<AgentKind | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({})
  const [continuing, setContinuing] = useState('')
  const handoverResult = useHandoverStore(s => s.result)
  const profiles = useMemo(() => agentProfileOptions(settings), [settings])

  const refresh = (): void => {
    setLoading(true)
    setError('')
    void window.termflow.agentSessions.list({ limit: 100 }).then(async sessions => { setSessions(sessions); setWarnings(await window.termflow.agentSessions.warnings()) }).catch(() => {
      setError('Sessions could not be read')
    }).finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const filtered = sessions.filter((session) => {
    if (agent !== 'all' && session.agent !== agent) return false
    const haystack = `${session.title} ${session.cwd ?? ''} ${session.id}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  const resume = async (session: AgentSession): Promise<void> => {
    const key = `${session.agent}:${session.id}`
    const original = profiles.find((profile) => profile.id === session.profileId)
      ?? profiles.find((profile) => profile.agent === session.agent)
    const target = profiles.find((profile) => profile.id === selectedProfiles[key]) ?? original
    if (!target) return
    setContinuing(key)
    try {
      const id = await continueAgentSession(session, target, session.cwd, settings.defaultAgentPermissionMode)
      if (id) hide()
    } catch {
      setError('Session could not be continued')
    } finally {
      setContinuing('')
    }
  }

  return <aside className="agent-sessions-panel" aria-label="Agent sessions">
    <header className="history-header">
      <span><Bot size={15} /> Agent Sessions</span>
      <div className="agent-session-header-actions">
        <button className="history-icon-btn" onClick={refresh} aria-label="Refresh agent sessions"><RefreshCw size={14} /></button>
        <button className="history-icon-btn" onClick={hide} aria-label="Close agent sessions"><X size={15} /></button>
      </div>
    </header>
    <div className="agent-session-toolbar">
      <label className="history-search"><Search size={13} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sessions, folders..." /></label>
      <select value={agent} onChange={(event) => setAgent(event.target.value as AgentKind | 'all')} aria-label="Filter agent sessions">
        <option value="all">All agents</option>
        <option value="claude">Claude</option><option value="codex">Codex</option><option value="opencode">OpenCode</option>
      </select>
    </div>
    <div className="agent-session-list">
      {handoverResult && <p role="status">{handoverResult}</p>}
      {warnings.map(warning => <p role="status" key={warning}>{warning}</p>)}
      {loading && <div className="history-empty"><LoaderCircle className="session-spinner" size={17} /> Loading sessions...</div>}
      {!loading && error && <div className="history-empty">{error}</div>}
      {!loading && !error && filtered.length === 0 && <div className="history-empty">No saved agent sessions</div>}
      {!loading && filtered.map((session) => {
        const key = `${session.agent}:${session.id}`
        const original = profiles.find((profile) => profile.id === session.profileId)
          ?? profiles.find((profile) => profile.agent === session.agent)
        const selected = selectedProfiles[key] || original?.id || ''
        const target = profiles.find((profile) => profile.id === selected)
        const isNativeResume = target?.agent === session.agent
        return <article className="agent-session-entry" key={key}>
          <div className="agent-session-main">
            <strong>{session.title}</strong>
            <div className="history-meta"><span>{LABELS[session.agent]}</span><span title={session.cwd}><Folder size={11} />{session.cwd || 'Unknown folder'}</span><time title={new Date(session.updatedAt).toLocaleString()}>{relativeTime(session.updatedAt)}</time></div>
          </div>
          <select value={selected} onChange={(event) => setSelectedProfiles((state) => ({ ...state, [key]: event.target.value }))} aria-label={`Profile for ${session.title}`}>
            {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name} ({LABELS[profile.agent]})</option>)}
          </select>
          <button className="agent-session-resume" onClick={() => void resume(session)} disabled={!selected || continuing === key} title={isNativeResume ? 'Resume the native session in a new tab' : 'Hand work over to another agent'}>
            {continuing === key ? <LoaderCircle className="session-spinner" size={12} /> : <Play size={12} />}{isNativeResume ? 'Resume' : 'Hand over'}
          </button>
        </article>
      })}
    </div>
  </aside>
}

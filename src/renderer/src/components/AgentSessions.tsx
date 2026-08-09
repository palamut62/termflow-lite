import { useEffect, useMemo, useState } from 'react'
import { Bot, Folder, LoaderCircle, Play, RefreshCw, Search, X } from 'lucide-react'
import type { AgentKind, AgentSession } from '../../../shared/types'
import { mergeProfiles, providerProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentSessionStore } from '../store/agentSessionStore'

const LABELS: Record<AgentKind, string> = { claude: 'Claude', codex: 'Codex', opencode: 'OpenCode' }

function commandAgent(command: string, fallback = ''): AgentKind | null {
  const text = `${fallback} ${command}`.toLowerCase()
  if (/\bclaude(?:\.cmd|\.exe)?\b/.test(text)) return 'claude'
  if (/\bcodex(?:\.cmd|\.exe)?\b/.test(text)) return 'codex'
  if (/\bopencode(?:\.cmd|\.exe)?\b/.test(text)) return 'opencode'
  return null
}

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
  const [selectedProfiles, setSelectedProfiles] = useState<Partial<Record<AgentKind, string>>>({})

  const profiles = useMemo(() => {
    const commandProfiles = mergeProfiles(settings.profiles).flatMap((profile) => {
      const kind = commandAgent(profile.startupCommand || profile.command, profile.id)
      return kind ? [{ id: profile.id, name: profile.name, agent: kind }] : []
    })
    const providers = settings.providerProfiles.flatMap((provider) => {
      const kind = commandAgent(provider.command)
      return kind ? [{ id: providerProfileId(provider.id), name: provider.name, agent: kind }] : []
    })
    return [...commandProfiles, ...providers]
  }, [settings.profiles, settings.providerProfiles])

  const refresh = (): void => {
    setLoading(true)
    setError('')
    void window.termflow.agentSessions.list({ limit: 100 }).then(setSessions).catch(() => {
      setError('Sessions could not be read')
    }).finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const filtered = sessions.filter((session) => {
    if (agent !== 'all' && session.agent !== agent) return false
    const haystack = `${session.title} ${session.cwd ?? ''} ${session.id}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  const resume = (session: AgentSession): void => {
    const compatible = profiles.filter((profile) => profile.agent === session.agent)
    const profileId = selectedProfiles[session.agent] || compatible[0]?.id
    if (!profileId) return
    useTerminalStore.getState().resumeAgentSession(profileId, { agent: session.agent, id: session.id }, session.cwd)
    hide()
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
      {loading && <div className="history-empty"><LoaderCircle className="session-spinner" size={17} /> Loading sessions...</div>}
      {!loading && error && <div className="history-empty">{error}</div>}
      {!loading && !error && filtered.length === 0 && <div className="history-empty">No saved agent sessions</div>}
      {!loading && filtered.map((session) => {
        const compatible = profiles.filter((profile) => profile.agent === session.agent)
        const selected = selectedProfiles[session.agent] || compatible[0]?.id || ''
        return <article className="agent-session-entry" key={`${session.agent}:${session.id}`}>
          <div className="agent-session-main">
            <strong>{session.title}</strong>
            <div className="history-meta"><span>{LABELS[session.agent]}</span><span title={session.cwd}><Folder size={11} />{session.cwd || 'Unknown folder'}</span><time title={new Date(session.updatedAt).toLocaleString()}>{relativeTime(session.updatedAt)}</time></div>
          </div>
          <select value={selected} onChange={(event) => setSelectedProfiles((state) => ({ ...state, [session.agent]: event.target.value }))} aria-label={`Profile for ${session.title}`}>
            {compatible.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
          </select>
          <button className="agent-session-resume" onClick={() => resume(session)} disabled={!selected} title="Resume in a new tab"><Play size={12} /> Resume</button>
        </article>
      })}
    </div>
  </aside>
}

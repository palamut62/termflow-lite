import { useEffect, useState } from 'react'
import { Clock3, Folder, ShieldCheck, Sparkles } from 'lucide-react'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentEventStore } from '../store/agentEventStore'

const activityLabels = {
  running: 'Running',
  waiting: 'Waiting for input',
  unread: 'New output',
  completed: 'Completed',
  error: 'Error'
} as const

function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}

interface Props {
  tabId: string
  onChangeCwd: (cwd: string) => Promise<boolean>
}

export function AgentWorkPanel({ tabId, onChangeCwd }: Props): React.JSX.Element | null {
  const tab = useTerminalStore((state) => state.tabs.find((item) => item.id === tabId))
  const settings = useSettingsStore((state) => state.settings)
  const [now, setNow] = useState(Date.now())
  const [savingCwd, setSavingCwd] = useState(false)
  const profile = tab ? mergeProfiles(settings.profiles).find((item) => item.id === tab.profileId) : undefined
  const provider = tab ? providerFromProfileId(settings, tab.profileId) : undefined
  const isAgent = !!provider || !!profile?.startupCommand
  const latestEvent = useAgentEventStore((state) => {
    for (let index = state.events.length - 1; index >= 0; index -= 1) {
      if (state.events[index].tabId === tabId) return state.events[index]
    }
    return undefined
  })

  useEffect(() => {
    if (!tab?.running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [tab?.running])

  if (!tab) return null
  const permissionMode = tab.permissionMode ?? settings.defaultAgentPermissionMode
  const name = provider?.name || profile?.name || tab.title
  const cwd = tab.cwd || tab.launchCwd || 'Default directory'

  const selectCwd = async (): Promise<void> => {
    if (savingCwd) return
    const nextCwd = await window.termflow.dialog.openDir()
    if (!nextCwd) return
    setSavingCwd(true)
    try {
      await onChangeCwd(nextCwd)
    } finally {
      setSavingCwd(false)
    }
  }

  return (
    <section className="agent-work-panel" aria-label={isAgent ? 'Agent work session' : 'Terminal work session'}>
      <span className="agent-work-primary"><strong>{name}</strong></span>
      {isAgent && (provider?.model || profile?.model) && <span title="Active model"><Sparkles size={12} />{provider?.model || profile?.model}</span>}
      <span className={`agent-work-state status-process agent-work-${tab.activity}`}>{activityLabels[tab.activity]}</span>
      <span title="Session duration"><Clock3 size={12} />{formatDuration(now - tab.startedAt)}</span>
      {isAgent && <span className={permissionMode === 'full' ? 'agent-work-full' : ''} title="Permission mode"><ShieldCheck size={12} />{permissionMode === 'safe' ? 'Safe' : permissionMode === 'workspace' ? 'Workspace' : 'Full access'}</span>}
      {isAgent && latestEvent && <span className={`agent-work-event agent-work-event-${latestEvent.kind}`} title={latestEvent.detail}>{latestEvent.title}</span>}
      <button className="agent-work-cwd" type="button" title={`${cwd} - click to select a folder`} disabled={savingCwd} onClick={() => { void selectCwd() }}><Folder size={12} /><span>{cwd}</span></button>
    </section>
  )
}

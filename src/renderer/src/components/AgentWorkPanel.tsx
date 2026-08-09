import { useEffect, useState } from 'react'
import { Clock3, Folder, ShieldCheck, Sparkles } from 'lucide-react'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'

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

export function AgentWorkPanel(): React.JSX.Element | null {
  const active = useTerminalStore((state) => state.tabs.find((tab) => tab.id === state.activeTabId))
  const settings = useSettingsStore((state) => state.settings)
  const [now, setNow] = useState(Date.now())
  const profile = active ? mergeProfiles(settings.profiles).find((item) => item.id === active.profileId) : undefined
  const provider = active ? providerFromProfileId(settings, active.profileId) : undefined
  const isAgent = !!provider || !!profile?.startupCommand

  useEffect(() => {
    if (!isAgent || !active?.running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active?.running, isAgent])

  if (!active || !isAgent) return null
  const fullPermissions = provider ? provider.fullPermissions !== false : profile?.fullPermissions !== false
  const name = provider?.name || profile?.name || active.title
  const cwd = active.cwd || active.launchCwd || 'Default directory'

  return (
    <section className="agent-work-panel" aria-label="Agent work session">
      <span className="agent-work-primary"><strong>{name}</strong></span>
      {(provider?.model || profile?.model) && <span title="Active model"><Sparkles size={12} />{provider?.model || profile?.model}</span>}
      <span className={`agent-work-state agent-work-${active.activity}`}>{activityLabels[active.activity]}</span>
      <span title="Session duration"><Clock3 size={12} />{formatDuration(now - active.startedAt)}</span>
      <span className={fullPermissions ? 'agent-work-full' : ''} title="Permission mode"><ShieldCheck size={12} />{fullPermissions ? 'Full access' : 'Standard access'}</span>
      <span className="agent-work-cwd" title={cwd}><Folder size={12} />{cwd}</span>
    </section>
  )
}

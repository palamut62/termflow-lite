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

interface Props {
  tabId: string
  onChangeCwd: (cwd: string) => Promise<boolean>
}

export function AgentWorkPanel({ tabId, onChangeCwd }: Props): React.JSX.Element | null {
  const tab = useTerminalStore((state) => state.tabs.find((item) => item.id === tabId))
  const settings = useSettingsStore((state) => state.settings)
  const [now, setNow] = useState(Date.now())
  const [editingCwd, setEditingCwd] = useState(false)
  const [cwdDraft, setCwdDraft] = useState('')
  const [cwdError, setCwdError] = useState('')
  const [savingCwd, setSavingCwd] = useState(false)
  const profile = tab ? mergeProfiles(settings.profiles).find((item) => item.id === tab.profileId) : undefined
  const provider = tab ? providerFromProfileId(settings, tab.profileId) : undefined
  const isAgent = !!provider || !!profile?.startupCommand

  useEffect(() => {
    if (!tab?.running) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [tab?.running])

  if (!tab) return null
  const fullPermissions = provider ? provider.fullPermissions !== false : profile?.fullPermissions !== false
  const name = provider?.name || profile?.name || tab.title
  const cwd = tab.cwd || tab.launchCwd || 'Default directory'

  const openEditor = (): void => {
    setCwdDraft(tab.cwd || tab.launchCwd || '')
    setCwdError('')
    setEditingCwd(true)
  }

  const applyCwd = async (): Promise<void> => {
    const nextCwd = cwdDraft.trim()
    if (!nextCwd) {
      setCwdError('Enter a folder path.')
      return
    }
    setSavingCwd(true)
    setCwdError('')
    const changed = await onChangeCwd(nextCwd)
    setSavingCwd(false)
    if (changed) setEditingCwd(false)
    else setCwdError('Folder not found or cannot be opened.')
  }

  return (
    <>
      <section className="agent-work-panel" aria-label={isAgent ? 'Agent work session' : 'Terminal work session'}>
        <span className="agent-work-primary"><strong>{name}</strong></span>
        {isAgent && (provider?.model || profile?.model) && <span title="Active model"><Sparkles size={12} />{provider?.model || profile?.model}</span>}
        <span className={`agent-work-state status-process agent-work-${tab.activity}`}>{activityLabels[tab.activity]}</span>
        <span title="Session duration"><Clock3 size={12} />{formatDuration(now - tab.startedAt)}</span>
        {isAgent && <span className={fullPermissions ? 'agent-work-full' : ''} title="Permission mode"><ShieldCheck size={12} />{fullPermissions ? 'Full access' : 'Standard access'}</span>}
        <button className="agent-work-cwd" type="button" title={`${cwd} - click to change`} onClick={openEditor}><Folder size={12} /><span>{cwd}</span></button>
      </section>
      {editingCwd && (
        <div className="cwd-editor-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditingCwd(false) }}>
          <form className="cwd-editor" role="dialog" aria-modal="true" aria-label={`Change working directory for ${name}`} onSubmit={(event) => { event.preventDefault(); void applyCwd() }}>
            <h3>Change working directory</h3>
            <p>This restarts only the <strong>{name}</strong> session in the selected folder.</p>
            <label htmlFor={`cwd-editor-${tabId}`}>Folder path</label>
            <input id={`cwd-editor-${tabId}`} className="settings-input" value={cwdDraft} onChange={(event) => setCwdDraft(event.target.value)} autoFocus />
            {cwdError && <span className="cwd-editor-error" role="alert">{cwdError}</span>}
            <div className="cwd-editor-actions">
              <button className="settings-btn" type="button" onClick={() => setEditingCwd(false)}>Cancel</button>
              <button className="settings-btn settings-btn-primary" type="submit" disabled={savingCwd}>{savingCwd ? 'Changing...' : 'Change and restart'}</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}

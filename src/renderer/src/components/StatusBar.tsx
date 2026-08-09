import { useEffect, useState } from 'react'
import { Bot, CircleDot, Folder, GitBranch, ShieldCheck, TerminalSquare } from 'lucide-react'
import type { GitStatus } from '../../../shared/ipc'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'

export function StatusBar(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const settings = useSettingsStore((s) => s.settings)
  const active = tabs.find((tab) => tab.id === activeTabId)
  const profile = active ? mergeProfiles(settings.profiles).find((item) => item.id === active.profileId) : undefined
  const provider = active ? providerFromProfileId(settings, active.profileId) : undefined
  const cwd = active?.cwd || active?.launchCwd || ''
  const [git, setGit] = useState<GitStatus | null>(null)
  const fullPermissions = provider
    ? provider.fullPermissions !== false
    : !!profile?.startupCommand && profile.fullPermissions !== false

  useEffect(() => {
    let current = true
    const refresh = (): void => {
      if (!cwd) {
        setGit(null)
        return
      }
      void window.termflow.git.status(cwd).then((value) => {
        if (current) setGit(value)
      })
    }
    refresh()
    const timer = window.setInterval(refresh, 5000)
    return () => {
      current = false
      window.clearInterval(timer)
    }
  }, [cwd])

  return (
    <footer className="status-bar" aria-label="Terminal status">
      <span className="status-item"><TerminalSquare size={12} />{active?.title ?? 'Terminal'}</span>
      <span className={`status-item status-process${active?.running ? ' status-process-running' : ''}`} title={active?.running ? 'Process running' : 'Process stopped'}><CircleDot size={12} />{active?.running ? 'Running' : 'Stopped'}</span>
      {provider && <span className="status-item" title={`Active provider model: ${provider.model}`}><Bot size={12} />{provider.model}</span>}
      {fullPermissions && <span className="status-item status-full" title="This command profile launches with full permissions"><ShieldCheck size={12} />FULL</span>}
      <span className="status-spacer" />
      {git && <span className="status-item status-git" title={`${git.changedFiles} changed file${git.changedFiles === 1 ? '' : 's'}`}><GitBranch size={12} />{git.branch}{git.changedFiles > 0 ? ` (${git.changedFiles})` : ''}</span>}
      <span className="status-item status-cwd" title={cwd}><Folder size={12} />{cwd || 'Ready'}</span>
      <span className="status-item">{tabs.length} tab{tabs.length === 1 ? '' : 's'}</span>
    </footer>
  )
}

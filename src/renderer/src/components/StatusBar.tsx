import { useEffect, useState } from 'react'
import { Bot, Braces, CircleDot, Clock3, Command, Folder, GitBranch, ShieldCheck, TerminalSquare } from 'lucide-react'
import type { GitStatus, ProjectInfo } from '../../../shared/ipc'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useCommandHistoryStore } from '../store/commandHistoryStore'
import { useAgentSessionStore } from '../store/agentSessionStore'
import { useTaskPaletteStore } from '../store/taskPaletteStore'

export function StatusBar(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const settings = useSettingsStore((s) => s.settings)
  const active = tabs.find((tab) => tab.id === activeTabId)
  const profile = active ? mergeProfiles(settings.profiles).find((item) => item.id === active.profileId) : undefined
  const provider = active ? providerFromProfileId(settings, active.profileId) : undefined
  const isAgent = !!provider || !!profile?.startupCommand
  const cwd = active?.cwd || active?.launchCwd || ''
  const [git, setGit] = useState<GitStatus | null>(null)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const fullPermissions = provider
    ? provider.fullPermissions !== false
    : !!profile?.startupCommand && profile.fullPermissions !== false
  const activityLabel = active?.activity === 'waiting'
    ? 'Waiting'
    : active?.activity === 'unread'
      ? 'New output'
      : active?.activity === 'completed'
        ? 'Completed'
        : active?.activity === 'error'
          ? 'Error'
          : 'Running'

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

  useEffect(() => {
    let current = true
    if (!cwd) {
      setProject(null)
      return
    }
    void window.termflow.project.detect(cwd).then((value) => {
      if (current) setProject(value)
    })
    return () => { current = false }
  }, [cwd])

  return (
    <footer className="status-bar" aria-label="Terminal status">
      {!isAgent && <span className="status-item"><TerminalSquare size={12} />{active?.title ?? 'Terminal'}</span>}
      {!isAgent && <span className={`status-item status-process status-activity-${active?.activity ?? 'completed'}`} title={`Process activity: ${activityLabel}`}><CircleDot size={12} />{activityLabel}</span>}
      {!isAgent && fullPermissions && <span className="status-item status-full" title="This command profile launches with full permissions"><ShieldCheck size={12} />FULL</span>}
      <button className="status-action" onClick={() => useCommandHistoryStore.getState().show()} title="Command history (Ctrl+Shift+H)"><Clock3 size={12} />History</button>
      <button className="status-action" onClick={() => useAgentSessionStore.getState().show()} title="Saved agent sessions"><Bot size={12} />Sessions</button>
      <button className="status-action" onClick={() => useTaskPaletteStore.getState().show()} title="Command palette (Ctrl+Shift+P)"><Command size={12} />Commands</button>
      <span className="status-spacer" />
      {project && <span className="status-item status-project" title={`Detected project: ${project.technologies.join(', ')}`}><Braces size={12} />{project.technologies.join(' · ')}</span>}
      {git && <span className="status-item status-git" title={`${git.changedFiles} changed file${git.changedFiles === 1 ? '' : 's'}`}><GitBranch size={12} />{git.branch}{git.changedFiles > 0 ? ` (${git.changedFiles})` : ''}</span>}
      {!isAgent && <span className="status-item status-cwd" title={cwd}><Folder size={12} />{cwd || 'Ready'}</span>}
      <span className="status-item">{tabs.length} tab{tabs.length === 1 ? '' : 's'}</span>
    </footer>
  )
}

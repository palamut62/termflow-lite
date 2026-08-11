import { useEffect, useState } from 'react'
import { Bot, Braces, Clock3, Command, GitBranch, Radio, Server } from 'lucide-react'
import type { GitStatus, ProjectInfo } from '../../../shared/ipc'
import { sshFromProfileId } from '../../../shared/profiles'
import { sshTarget } from '../../../shared/sshArgs'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useCommandHistoryStore } from '../store/commandHistoryStore'
import { useAgentSessionStore } from '../store/agentSessionStore'
import { useTaskPaletteStore } from '../store/taskPaletteStore'

export function StatusBar(): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const broadcastInput = useTerminalStore((s) => s.broadcastInput)
  const settings = useSettingsStore((s) => s.settings)
  const active = tabs.find((tab) => tab.id === activeTabId)
  const ssh = active ? sshFromProfileId(settings, active.profileId) : undefined
  const cwd = active?.cwd || active?.launchCwd || ''
  const [git, setGit] = useState<GitStatus | null>(null)
  const [project, setProject] = useState<ProjectInfo | null>(null)
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
      <button className="status-action" onClick={() => useCommandHistoryStore.getState().show()} title="Command history (Ctrl+Shift+H)"><Clock3 size={12} />History</button>
      <button className="status-action" onClick={() => useAgentSessionStore.getState().show()} title="Saved agent sessions"><Bot size={12} />Sessions</button>
      <button className="status-action" onClick={() => useTaskPaletteStore.getState().show()} title="Command palette (Ctrl+Shift+P)"><Command size={12} />Commands</button>
      <span className="status-spacer" />
      {/* Yanlışlıkla açık kalmasın diye belirgin rozet; tıklama kapatır. */}
      {broadcastInput && (
        <button
          className="status-item status-broadcast"
          onClick={() => useTerminalStore.getState().toggleBroadcastInput()}
          title="Input is sent to every split pane — click to turn off (Ctrl+Alt+B)"
        >
          <Radio size={12} />BROADCAST
        </button>
      )}
      {ssh && <span className="status-item status-ssh" title={`SSH connection: ${ssh.name}`}><Server size={12} />{sshTarget(ssh)}</span>}
      {project && <span className="status-item status-project" title={`Detected project: ${project.technologies.join(', ')}`}><Braces size={12} />{project.technologies.join(' · ')}</span>}
      {git && <span className="status-item status-git" title={`${git.changedFiles} changed file${git.changedFiles === 1 ? '' : 's'}`}><GitBranch size={12} />{git.branch}{git.changedFiles > 0 ? ` (${git.changedFiles})` : ''}</span>}
      <span className="status-item">{tabs.length} tab{tabs.length === 1 ? '' : 's'}</span>
    </footer>
  )
}

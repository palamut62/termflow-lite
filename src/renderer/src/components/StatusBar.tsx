import { useEffect, useState } from 'react'
import { Bookmark, Bot, Braces, Clock3, Command, Download, GitBranch, Loader2, Radio, RefreshCw, Server, ShieldCheck, X } from 'lucide-react'
import type { AgentPermissionMode } from '../../../shared/types'
import type { GitStatus, ProjectInfo } from '../../../shared/ipc'
import { sshFromProfileId } from '../../../shared/profiles'
import { sshTarget } from '../../../shared/sshArgs'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useCommandHistoryStore } from '../store/commandHistoryStore'
import { useAgentSessionStore } from '../store/agentSessionStore'
import { useTaskPaletteStore } from '../store/taskPaletteStore'
import { useSavedCommandStore } from '../store/savedCommandStore'
import { useAgentEventStore } from '../store/agentEventStore'
import { initUpdateStatusBridge, shouldShowUpdateBadge, updateBadgeLabel, updateBadgeTitle, useUpdateStore } from '../store/updateStore'

const PERMISSION_MODES: AgentPermissionMode[] = ['safe', 'workspace', 'full']
const PERMISSION_LABELS: Record<AgentPermissionMode, string> = {
  safe: 'Safe',
  workspace: 'Workspace',
  full: 'Full access'
}

const CONFIRM_RESET_MS = 6000

/** Sağ blokta güncelleme rozeti; 'downloaded' durumunda kurulum iki aşamalı onaylanır. */
function UpdateBadge(): React.JSX.Element | null {
  const status = useUpdateStore((s) => s.status)
  const dismissedVersion = useUpdateStore((s) => s.dismissedVersion)
  const confirmingInstall = useUpdateStore((s) => s.confirmingInstall)

  useEffect(() => {
    if (!confirmingInstall) return
    const timer = window.setTimeout(() => useUpdateStore.getState().setConfirmingInstall(false), CONFIRM_RESET_MS)
    return () => window.clearTimeout(timer)
  }, [confirmingInstall])

  if (!shouldShowUpdateBadge(status, dismissedVersion)) return null

  const title = updateBadgeTitle(status)
  const label = confirmingInstall && status.state === 'downloaded' ? 'Click again to restart' : updateBadgeLabel(status)
  const onClick = (): void => {
    if (status.state === 'available') void window.termflow.updater.download()
    else if (status.state === 'downloaded') {
      if (confirmingInstall) void window.termflow.updater.install()
      else useUpdateStore.getState().setConfirmingInstall(true)
    }
  }

  return (
    <span className="status-item status-update-group">
      <button
        className={`status-action status-update${status.state === 'downloaded' ? ' status-update-downloaded' : ''}`}
        onClick={onClick}
        disabled={status.state === 'downloading'}
        title={title}
        aria-label={title}
      >
        {status.state === 'available' && <Download size={12} />}
        {status.state === 'downloading' && <Loader2 size={12} className="status-update-spin" />}
        {status.state === 'downloaded' && <RefreshCw size={12} />}
        {label}
      </button>
      {status.state === 'available' && (
        <button
          className="status-action status-update-dismiss"
          onClick={() => useUpdateStore.getState().dismiss()}
          title="Dismiss update notification"
          aria-label="Dismiss update notification"
        >
          <X size={10} />
        </button>
      )}
    </span>
  )
}

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
  const permissionMode = settings.defaultAgentPermissionMode
  const cyclePermissionMode = (): void => {
    const currentIndex = PERMISSION_MODES.indexOf(permissionMode)
    const next = PERMISSION_MODES[(currentIndex + 1) % PERMISSION_MODES.length]
    void useSettingsStore.getState().update({ defaultAgentPermissionMode: next })
  }
  useEffect(() => initUpdateStatusBridge(), [])

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
    // Interval yalnızca aynı dizindeki dosya değişimlerini yakalamak içindir;
    // dizin değişimi effect restart'ı ([cwd]) ile zaten anında yenilenir.
    const timer = window.setInterval(() => {
      if (document.hidden) return
      refresh()
    }, 30_000)
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
      <button className="status-action" onClick={() => useSavedCommandStore.getState().show()} title="Saved commands"><Bookmark size={12} />Saved</button>
      <button className="status-action" onClick={() => useAgentSessionStore.getState().show()} title="Saved agent sessions"><Bot size={12} />Sessions</button>
      <button className="status-action" onClick={() => useAgentEventStore.getState().show()} title="Live agent activity and timeline"><Radio size={12} />Agents</button>
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
      <UpdateBadge />
      <button
        className={`status-action status-security status-security-${permissionMode}`}
        onClick={cyclePermissionMode}
        title={`Agent security profile: ${PERMISSION_LABELS[permissionMode]}. Click to change.`}
        aria-label={`Agent security profile: ${PERMISSION_LABELS[permissionMode]}`}
      >
        <ShieldCheck size={12} />{PERMISSION_LABELS[permissionMode]}
      </button>
    </footer>
  )
}

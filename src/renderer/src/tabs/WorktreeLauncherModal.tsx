import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, FolderOpen, GitBranch, Loader2, X } from 'lucide-react'
import { mergeProfiles, providerProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import type { AgentPermissionMode } from '../../../shared/types'

/** Short, collision-resistant suffix so parallel agents never share a branch. */
function branchSuffix(): string {
  return Math.random().toString(36).slice(2, 7)
}

/**
 * Starts an agent (or shell) in its own git worktree — an isolated checkout of
 * the same repository. Two agents can then edit the same project in parallel
 * without overwriting each other. Closing the tab offers to remove the
 * checkout again (WorktreeCleanupDialog).
 */
export function WorktreeLauncherModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const shells = useSettingsStore((s) => s.shells)
  const settings = useSettingsStore((s) => s.settings)
  const options = useMemo(() => [
    ...mergeProfiles(settings.profiles).map((profile) => ({ id: profile.id, name: profile.name, group: 'Profiles' })),
    ...settings.providerProfiles.map((provider) => ({ id: providerProfileId(provider.id), name: provider.name, group: 'Providers' })),
    ...shells.map((shell) => ({ id: shell.id, name: shell.name, group: 'Shells' }))
  ], [settings.profiles, settings.providerProfiles, shells])

  const [profileId, setProfileId] = useState(options[0]?.id ?? settings.defaultProfileId)
  const [permissionMode, setPermissionMode] = useState<AgentPermissionMode>(settings.defaultAgentPermissionMode)
  const [repoPath, setRepoPath] = useState(useTerminalStore.getState().workspaceCwd ?? '')
  const [repo, setRepo] = useState<{ root: string; branch: string } | null>(null)
  const [repoError, setRepoError] = useState('')
  const [branch, setBranch] = useState(`tf/agent-${branchSuffix()}`)
  const [baseRef, setBaseRef] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !busy) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  // Resolve the repository whenever the path settles, so the dialog can show
  // the real root (which may be an ancestor of what the user typed).
  useEffect(() => {
    const path = repoPath.trim()
    if (!path) { setRepo(null); setRepoError(''); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      const info = await window.termflow.worktree.repoInfo(path)
      if (cancelled) return
      setRepo(info)
      setRepoError(info ? '' : 'Not a git repository.')
      if (info && !baseRef.trim()) setBaseRef(info.branch)
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
    // baseRef is only seeded once; re-running on its change would fight the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath])

  const create = async (): Promise<void> => {
    if (!repo || busy) return
    setBusy(true)
    setError('')
    const result = await window.termflow.worktree.create({
      repoRoot: repo.root,
      branch: branch.trim(),
      baseRef: baseRef.trim() || undefined
    })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    useTerminalStore.getState().addTab(profileId, true, undefined, undefined, permissionMode, {
      repoRoot: repo.root,
      path: result.worktree.path,
      branch: result.worktree.branch ?? branch.trim(),
      createdByApp: true
    })
    onClose()
  }

  const canCreate = !!repo && branch.trim().length > 0 && !busy

  return createPortal(
    <div className="settings-backdrop path-launch-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
      <div className="path-launch-panel" role="dialog" aria-modal="true" aria-label="New worktree session">
        <header className="settings-header">
          <span className="settings-header-title"><GitBranch size={16} /> New worktree session</span>
          <button className="settings-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={16} /></button>
        </header>
        <div className="path-launch-content">
          <label className="path-launch-label" htmlFor="worktree-repo"><FolderOpen size={14} /> Repository</label>
          <div className="path-launch-row">
            <input
              id="worktree-repo"
              className="settings-input"
              value={repoPath}
              onChange={(event) => setRepoPath(event.target.value)}
              placeholder="C:\\projects\\my-app"
              autoFocus
            />
            <button className="settings-btn" onClick={async () => { const path = await window.termflow.dialog.openDir(); if (path) setRepoPath(path) }}>
              <FolderOpen size={13} /> Browse
            </button>
          </div>
          <p className="path-launch-hint">
            {repo ? `${repo.root} — on ${repo.branch}` : repoError || 'Pick a folder inside a git repository.'}
          </p>

          <label className="path-launch-label" htmlFor="worktree-branch"><GitBranch size={14} /> New branch</label>
          <input id="worktree-branch" className="settings-input" value={branch} onChange={(event) => setBranch(event.target.value)} />

          <label className="path-launch-label" htmlFor="worktree-base">Start from</label>
          <input id="worktree-base" className="settings-input" value={baseRef} onChange={(event) => setBaseRef(event.target.value)} placeholder="HEAD" />

          <label className="path-launch-label" htmlFor="worktree-profile"><Bot size={14} /> Agent, provider or shell</label>
          <select id="worktree-profile" className="settings-input settings-select path-launch-select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {['Profiles', 'Providers', 'Shells'].map((group) => (
              <optgroup label={group} key={group}>
                {options.filter((option) => option.group === group).map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
              </optgroup>
            ))}
          </select>

          <label className="path-launch-label" htmlFor="worktree-permission">Agent permission mode</label>
          <select id="worktree-permission" className="settings-input settings-select path-launch-select" value={permissionMode} onChange={(event) => setPermissionMode(event.target.value as AgentPermissionMode)}>
            <option value="safe">Safe - read only</option><option value="workspace">Workspace - project writes</option><option value="full">Full Access</option>
          </select>

          {error && <p className="path-launch-error" role="alert">{error}</p>}
        </div>
        <div className="path-launch-actions">
          <button className="settings-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="settings-btn settings-btn-primary" disabled={!canCreate} onClick={create}>
            {busy ? <><Loader2 size={13} className="spin" /> Creating...</> : 'Create & open'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

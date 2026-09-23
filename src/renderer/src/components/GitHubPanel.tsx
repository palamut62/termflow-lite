import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, GitPullRequest, Github, Loader2, Lock, RefreshCw, X } from 'lucide-react'
import { mergeProfiles, providerProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import type { GitHubPullRequest, GitHubRepo, GitHubStatus } from '../../../shared/ipc'

type Tab = 'prs' | 'repos'

/** Electron wraps main-process errors as "Error invoking remote method '...': Error: <msg>". */
function ipcErrorMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/**
 * GitHub panel backed by the user's own `gh` CLI — TermFlow never asks for or
 * stores a token. Its one opinionated action is "open a PR in its own
 * worktree", which pairs the review with an isolated checkout and an agent.
 */
export function GitHubPanel({ onClose }: { onClose: () => void }): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const shells = useSettingsStore((s) => s.shells)
  const workspaceCwd = useTerminalStore((s) => s.workspaceCwd)
  const activeCwd = useTerminalStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.cwd)

  const [status, setStatus] = useState<GitHubStatus | null>(null)
  const [tab, setTab] = useState<Tab>('prs')
  const [repo, setRepo] = useState('')
  const [prs, setPrs] = useState<GitHubPullRequest[]>([])
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [loading, setLoading] = useState(false)
  const [busyPr, setBusyPr] = useState<number | null>(null)
  const [error, setError] = useState('')

  const profileOptions = [
    ...mergeProfiles(settings.profiles).map((p) => ({ id: p.id, name: p.name })),
    ...settings.providerProfiles.map((p) => ({ id: providerProfileId(p.id), name: p.name })),
    ...shells.map((s) => ({ id: s.id, name: s.name }))
  ]
  const [profileId, setProfileId] = useState(profileOptions[0]?.id ?? settings.defaultProfileId)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape' && busyPr === null) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busyPr])

  // Probe gh once, then seed the repository from whatever is checked out.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await window.termflow.github.status()
      if (cancelled) return
      setStatus(next)
      if (!next.authenticated) return
      const cwd = activeCwd || workspaceCwd
      if (cwd) {
        const detected = await window.termflow.github.currentRepo(cwd)
        if (!cancelled && detected) setRepo(detected)
      }
    })()
    return () => { cancelled = true }
    // Probing once per open is deliberate; gh state rarely changes mid-dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadPrs = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setPrs(await window.termflow.github.pullRequests(repo, activeCwd || workspaceCwd))
    } catch (err) {
      setPrs([])
      setError(ipcErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const loadRepos = async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      setRepos(await window.termflow.github.repos(50))
    } catch (err) {
      setRepos([])
      setError(ipcErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!status?.authenticated) return
    if (tab === 'repos' && repos.length === 0) void loadRepos()
    if (tab !== 'prs' || !repo) return
    // Debounced so typing "owner/name" does not spawn a gh call per keystroke.
    const timer = setTimeout(() => void loadPrs(), 400)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tab, repo])

  /**
   * Create a detached worktree, let `gh` check the PR out into it (which also
   * handles forks), then open the chosen profile there. On a failed checkout
   * the empty worktree is removed again so nothing is left behind.
   */
  const openPrInWorktree = async (pr: GitHubPullRequest): Promise<void> => {
    const cwd = activeCwd || workspaceCwd
    if (!cwd) { setError('Open a terminal inside the repository first.'); return }
    setBusyPr(pr.number)
    setError('')

    const info = await window.termflow.worktree.repoInfo(cwd)
    if (!info) {
      setError('The active terminal is not inside a git repository.')
      setBusyPr(null)
      return
    }

    const created = await window.termflow.worktree.create({ repoRoot: info.root, branch: `pr-${pr.number}`, detach: true })
    if (!created.ok) { setError(created.error); setBusyPr(null); return }

    const checkout = await window.termflow.github.checkoutPr(created.worktree.path, pr.number, repo || undefined)
    if (!checkout.ok) {
      await window.termflow.worktree.remove({ repoRoot: info.root, path: created.worktree.path, force: true })
      setError(checkout.error)
      setBusyPr(null)
      return
    }

    useTerminalStore.getState().addTab(profileId, true, undefined, undefined, undefined, {
      repoRoot: info.root,
      path: created.worktree.path,
      branch: `pr-${pr.number}`,
      createdByApp: true
    })
    setBusyPr(null)
    onClose()
  }

  const unavailable = status && (!status.installed || !status.authenticated)

  return createPortal(
    <div className="settings-backdrop path-launch-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && busyPr === null) onClose() }}>
      <div className="path-launch-panel github-panel" role="dialog" aria-modal="true" aria-label="GitHub">
        <header className="settings-header">
          <span className="settings-header-title"><Github size={16} /> GitHub{status?.account ? ` — ${status.account}` : ''}</span>
          <button className="settings-icon-btn" onClick={onClose} aria-label="Close" disabled={busyPr !== null}><X size={16} /></button>
        </header>

        {!status && <div className="path-launch-content"><p className="path-launch-hint"><Loader2 size={13} className="spin" /> Checking GitHub CLI...</p></div>}

        {unavailable && (
          <div className="path-launch-content">
            <p className="path-launch-error" role="alert">{status.error}</p>
            <p className="path-launch-hint">
              TermFlow uses your GitHub CLI session and never stores a token of its own.
              {!status.installed
                ? ' Install the GitHub CLI, then reopen this panel.'
                : ' Run "gh auth login" in a terminal, then reopen this panel.'}
            </p>
          </div>
        )}

        {status?.authenticated && (
          <>
            <div className="github-tabs" role="tablist">
              <button className={`github-tab${tab === 'prs' ? ' github-tab-active' : ''}`} role="tab" aria-selected={tab === 'prs'} onClick={() => setTab('prs')}>
                <GitPullRequest size={13} /> Pull requests
              </button>
              <button className={`github-tab${tab === 'repos' ? ' github-tab-active' : ''}`} role="tab" aria-selected={tab === 'repos'} onClick={() => setTab('repos')}>
                Repositories
              </button>
              <span className="path-launch-hint github-tabs-spacer" />
              <button className="settings-icon-btn" onClick={() => (tab === 'prs' ? loadPrs() : loadRepos())} aria-label="Refresh" title="Refresh">
                <RefreshCw size={13} />
              </button>
            </div>

            <div className="path-launch-content">
              {tab === 'prs' && (
                <>
                  <label className="path-launch-label" htmlFor="github-repo">Repository</label>
                  <input id="github-repo" className="settings-input" value={repo} onChange={(event) => setRepo(event.target.value)} placeholder="owner/name" />
                  <label className="path-launch-label" htmlFor="github-profile">Open pull requests with</label>
                  <select id="github-profile" className="settings-input settings-select path-launch-select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                    {profileOptions.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                  </select>
                  <p className="path-launch-hint">Each pull request opens in its own worktree, so reviewing one never disturbs your working copy.</p>
                </>
              )}

              {error && <p className="path-launch-error" role="alert">{error}</p>}
              {loading && <p className="path-launch-hint"><Loader2 size={13} className="spin" /> Loading...</p>}

              <ul className="github-list">
                {tab === 'prs' && !loading && !error && prs.length === 0 && <li className="github-empty">{repo ? 'No open pull requests.' : 'Enter a repository (owner/name) to list its pull requests.'}</li>}
                {tab === 'prs' && prs.map((pr) => (
                  <li key={pr.number} className="github-row">
                    <span className="github-row-main">
                      <span className="github-row-title">#{pr.number} {pr.title}</span>
                      <span className="github-row-meta">
                        {pr.author && `${pr.author} · `}<GitBranch size={10} /> {pr.headRefName}{pr.isDraft ? ' · draft' : ''}
                      </span>
                    </span>
                    <button className="settings-btn" disabled={busyPr !== null} onClick={() => openPrInWorktree(pr)}>
                      {busyPr === pr.number ? <><Loader2 size={12} className="spin" /> Opening</> : 'Open in worktree'}
                    </button>
                  </li>
                ))}

                {tab === 'repos' && !loading && !error && repos.length === 0 && <li className="github-empty">No repositories found.</li>}
                {tab === 'repos' && repos.map((item) => (
                  <li key={item.nameWithOwner} className="github-row">
                    <span className="github-row-main">
                      <span className="github-row-title">{item.nameWithOwner} {item.isPrivate && <Lock size={10} />}</span>
                      {item.description && <span className="github-row-meta">{item.description}</span>}
                    </span>
                    <button className="settings-btn" onClick={() => { setRepo(item.nameWithOwner); setTab('prs') }}>
                      Pull requests
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}

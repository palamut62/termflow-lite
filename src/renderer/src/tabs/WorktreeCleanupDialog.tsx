import { useState } from 'react'
import { createPortal } from 'react-dom'
import { GitBranch, Loader2 } from 'lucide-react'
import { useTerminalStore } from '../store/terminalStore'

/**
 * Shown after the last tab using a TermFlow-created worktree closes. The
 * checkout is never removed silently — uncommitted agent work lives there.
 */
export function WorktreeCleanupDialog(): React.JSX.Element | null {
  const worktree = useTerminalStore((s) => s.pendingWorktreeCleanup)
  const dismiss = useTerminalStore((s) => s.dismissWorktreeCleanup)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!worktree) return null

  const remove = async (deleteBranch: boolean): Promise<void> => {
    setBusy(true)
    setError('')
    const result = await window.termflow.worktree.remove({
      repoRoot: worktree.repoRoot,
      path: worktree.path,
      // The tab is already gone, so an interactive re-check is not possible;
      // the user chose removal knowing the work is discarded.
      force: true,
      deleteBranch,
      branch: worktree.branch
    })
    if (!result.ok) {
      setError(result.error)
      setBusy(false)
      return
    }
    setBusy(false)
    dismiss()
  }

  return createPortal(
    <div className="settings-backdrop path-launch-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) dismiss() }}>
      <div className="path-launch-panel" role="dialog" aria-modal="true" aria-label="Worktree cleanup">
        <header className="settings-header">
          <span className="settings-header-title"><GitBranch size={16} /> Session closed</span>
        </header>
        <div className="path-launch-content">
          <p className="path-launch-hint">
            This session ran in its own worktree on <strong>{worktree.branch}</strong>.
          </p>
          <p className="path-launch-hint path-launch-mono">{worktree.path}</p>
          <p className="path-launch-hint">
            Removing the checkout discards any uncommitted changes it still holds.
          </p>
          {error && <p className="path-launch-error" role="alert">{error}</p>}
        </div>
        <div className="path-launch-actions">
          <button className="settings-btn" onClick={dismiss} disabled={busy}>Keep everything</button>
          <button className="settings-btn" onClick={() => remove(false)} disabled={busy}>
            {busy ? <Loader2 size={13} className="spin" /> : null} Remove checkout, keep branch
          </button>
          <button className="settings-btn settings-btn-danger" onClick={() => remove(true)} disabled={busy}>
            Remove checkout & branch
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

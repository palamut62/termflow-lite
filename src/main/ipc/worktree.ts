import { ipcMain } from 'electron'
import {
  IPC,
  type GitRepoInfo,
  type WorktreeCreateRequest,
  type WorktreeEntry,
  type WorktreeOutcome,
  type WorktreeRemoveOutcome,
  type WorktreeRemoveRequest
} from '../../shared/ipc'
import { createWorktree, listWorktrees, readRepoInfo, removeWorktree } from '../worktree'

/**
 * Worktree isolation channels (Cube-style "a worktree per agent"). Every
 * handler validates its own payload: the renderer is sandboxed but these
 * commands touch the filesystem, so nothing is trusted by shape alone.
 */
export function registerWorktreeIpc(): void {
  ipcMain.handle(IPC.WORKTREE_REPO_INFO, async (_event, cwd: string): Promise<GitRepoInfo | null> => {
    if (typeof cwd !== 'string') return null
    return readRepoInfo(cwd)
  })

  ipcMain.handle(IPC.WORKTREE_LIST, async (_event, repoRoot: string): Promise<WorktreeEntry[]> => {
    if (typeof repoRoot !== 'string') return []
    return listWorktrees(repoRoot)
  })

  ipcMain.handle(IPC.WORKTREE_CREATE, async (_event, request: WorktreeCreateRequest): Promise<WorktreeOutcome> => {
    if (!request || typeof request.repoRoot !== 'string' || typeof request.branch !== 'string') {
      return { ok: false, error: 'Invalid worktree request.' }
    }
    return createWorktree({
      repoRoot: request.repoRoot,
      branch: request.branch,
      baseRef: typeof request.baseRef === 'string' ? request.baseRef : undefined,
      path: typeof request.path === 'string' ? request.path : undefined,
      detach: request.detach === true
    })
  })

  ipcMain.handle(IPC.WORKTREE_REMOVE, async (_event, request: WorktreeRemoveRequest): Promise<WorktreeRemoveOutcome> => {
    if (!request || typeof request.repoRoot !== 'string' || typeof request.path !== 'string') {
      return { ok: false, error: 'Invalid worktree request.' }
    }
    return removeWorktree({
      repoRoot: request.repoRoot,
      path: request.path,
      force: request.force === true,
      deleteBranch: request.deleteBranch === true,
      branch: typeof request.branch === 'string' ? request.branch : undefined
    })
  })
}

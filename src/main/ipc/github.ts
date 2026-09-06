import { ipcMain } from 'electron'
import {
  IPC,
  type GhOutcome,
  type GitHubPullRequest,
  type GitHubRepo,
  type GitHubStatus
} from '../../shared/ipc'
import { checkoutPullRequest, cloneRepo, currentRepo, listPullRequests, listRepos, readStatus } from '../github'

/**
 * GitHub channels backed by the user's own `gh` CLI. No token ever reaches
 * TermFlow, so there is nothing here to store or leak; an unavailable or
 * logged-out `gh` surfaces as a status, not as a credential prompt.
 */
export function registerGithubIpc(): void {
  ipcMain.handle(IPC.GITHUB_STATUS, async (): Promise<GitHubStatus> => readStatus())

  ipcMain.handle(IPC.GITHUB_REPOS, async (_event, limit: number): Promise<GitHubRepo[]> =>
    listRepos(typeof limit === 'number' ? limit : 50))

  ipcMain.handle(IPC.GITHUB_CURRENT_REPO, async (_event, cwd: string): Promise<string> =>
    typeof cwd === 'string' ? currentRepo(cwd) : '')

  ipcMain.handle(IPC.GITHUB_PULL_REQUESTS, async (_event, repo: string, cwd?: string): Promise<GitHubPullRequest[]> =>
    listPullRequests(typeof repo === 'string' ? repo : '', typeof cwd === 'string' ? cwd : undefined))

  ipcMain.handle(IPC.GITHUB_PR_CHECKOUT, async (_event, worktreePath: string, number: number, repo?: string): Promise<GhOutcome> => {
    if (typeof worktreePath !== 'string' || typeof number !== 'number') return { ok: false, error: 'Invalid checkout request.' }
    return checkoutPullRequest(worktreePath, number, typeof repo === 'string' && repo ? repo : undefined)
  })

  ipcMain.handle(IPC.GITHUB_CLONE, async (_event, nameWithOwner: string, targetPath: string): Promise<GhOutcome> => {
    if (typeof nameWithOwner !== 'string' || typeof targetPath !== 'string') return { ok: false, error: 'Invalid clone request.' }
    return cloneRepo(nameWithOwner, targetPath)
  })
}

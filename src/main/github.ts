// GitHub integration through the user's own `gh` CLI.
//
// TermFlow never stores a GitHub token: exactly like the SSH support, which
// defers to the system OpenSSH client, this defers to `gh` and whatever
// account the user already authenticated there. If `gh` is missing or logged
// out, the feature reports that instead of asking for credentials.

import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { isAbsolute } from 'path'
import { promisify } from 'util'
import type { GitHubPullRequest, GitHubRepo, GitHubStatus } from '../shared/ipc'

const execFileAsync = promisify(execFile)

const GH_TIMEOUT_MS = 20000
const GH_MAX_BUFFER = 4 * 1024 * 1024

/** `owner/name` — also rules out values `gh` would read as a flag. */
const REPO_NAME = /^[\w.-]+\/[\w.-]+$/

function isValidRepo(value: unknown): value is string {
  return typeof value === 'string' && REPO_NAME.test(value) && !value.startsWith('-')
}

function isUsableDir(path: unknown): path is string {
  return typeof path === 'string' && isAbsolute(path) && existsSync(path) && statSync(path).isDirectory()
}

async function gh(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync('gh', args, {
    cwd: isUsableDir(cwd) ? cwd : undefined,
    windowsHide: true,
    timeout: GH_TIMEOUT_MS,
    maxBuffer: GH_MAX_BUFFER
  })
  return stdout
}

/** Short message from a failed `gh` run, without leaking the whole stack. */
export function ghError(error: unknown): string {
  const err = error as { stderr?: string; message?: string; code?: string }
  if (err?.code === 'ENOENT') return 'GitHub CLI (gh) is not installed.'
  const text = (err?.stderr || err?.message || 'gh command failed').toString().trim()
  return text.split(/\r?\n/).filter(Boolean).slice(0, 3).join(' ').slice(0, 400)
}

// ---- Pure normalizers (unit tested) ----

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/** `gh repo list --json ...` -> repos, dropping entries without an owner/name. */
export function parseRepos(stdout: string): GitHubRepo[] {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => !!entry && typeof entry.nameWithOwner === 'string' && entry.nameWithOwner.includes('/'))
    .map((entry) => ({
      nameWithOwner: entry.nameWithOwner as string,
      name: str(entry.name) || (entry.nameWithOwner as string).split('/')[1],
      description: str(entry.description),
      isPrivate: entry.isPrivate === true,
      updatedAt: str(entry.updatedAt)
    }))
}

/** `gh pr list --json ...` -> pull requests, dropping entries without a number. */
export function parsePullRequests(stdout: string): GitHubPullRequest[] {
  let raw: unknown
  try {
    raw = JSON.parse(stdout)
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => entry as Record<string, unknown>)
    .filter((entry) => !!entry && Number.isInteger(entry.number) && (entry.number as number) > 0)
    .map((entry) => ({
      number: entry.number as number,
      title: str(entry.title, '(untitled)'),
      author: str((entry.author as Record<string, unknown> | undefined)?.login),
      headRefName: str(entry.headRefName),
      isDraft: entry.isDraft === true,
      updatedAt: str(entry.updatedAt)
    }))
}

/**
 * `gh auth status` output -> the account login. Both the current wording
 * ("account <login>") and the older one ("as <login>") are recognised.
 */
export function parseAuthAccount(stderrOrStdout: string): string {
  const match = /Logged in to \S+ (?:account|as) (\S+)/.exec(String(stderrOrStdout ?? ''))
  return match?.[1] ?? ''
}

/**
 * Local branch name for a PR checkout. Used as the worktree directory name, so
 * it must stay stable and filesystem-safe regardless of the PR title.
 */
export function prBranchName(number: number): string {
  return `pr-${Math.trunc(Math.abs(number)) || 0}`
}

// ---- Commands ----

/** Whether `gh` exists and is logged in — the gate for every other call. */
export async function readStatus(): Promise<GitHubStatus> {
  try {
    await gh(['--version'])
  } catch (error) {
    return { installed: false, authenticated: false, account: '', error: ghError(error) }
  }
  try {
    // `gh auth status` writes to stderr on some versions and exits non-zero
    // when logged out, so both streams are inspected.
    const stdout = await gh(['auth', 'status'])
    const account = parseAuthAccount(stdout)
    return { installed: true, authenticated: true, account, error: '' }
  } catch (error) {
    const text = (error as { stdout?: string; stderr?: string }).stdout ?? (error as { stderr?: string }).stderr ?? ''
    const account = parseAuthAccount(text)
    if (account) return { installed: true, authenticated: true, account, error: '' }
    return { installed: true, authenticated: false, account: '', error: 'Not logged in. Run: gh auth login' }
  }
}

export async function listRepos(limit = 50): Promise<GitHubRepo[]> {
  const bounded = Math.max(1, Math.min(200, Math.trunc(limit) || 50))
  try {
    return parseRepos(await gh(['repo', 'list', '--json', 'name,nameWithOwner,description,isPrivate,updatedAt', '--limit', String(bounded)]))
  } catch (error) {
    // Surfaced to the panel so a network/auth failure is not shown as "no repos".
    throw new Error(ghError(error))
  }
}

/** `owner/name` of the repository checked out at `cwd`, or '' when unknown. */
export async function currentRepo(cwd: string): Promise<string> {
  try {
    const parsed = JSON.parse(await gh(['repo', 'view', '--json', 'nameWithOwner'], cwd)) as { nameWithOwner?: unknown }
    return str(parsed?.nameWithOwner)
  } catch {
    return ''
  }
}

export async function listPullRequests(repo: string, cwd?: string, limit = 30): Promise<GitHubPullRequest[]> {
  const bounded = Math.max(1, Math.min(100, Math.trunc(limit) || 30))
  const args = ['pr', 'list', '--state', 'open', '--json', 'number,title,author,headRefName,isDraft,updatedAt', '--limit', String(bounded)]
  if (repo) {
    if (!isValidRepo(repo)) throw new Error('Invalid repository name.')
    args.push('--repo', repo)
  }
  try {
    return parsePullRequests(await gh(args, cwd))
  } catch (error) {
    throw new Error(ghError(error))
  }
}

export type GhOutcome = { ok: true } | { ok: false; error: string }

/**
 * Check a pull request out inside an existing worktree directory. `gh` handles
 * forks and cross-repository PRs, which a plain `git fetch` would not.
 */
export async function checkoutPullRequest(worktreePath: string, number: number, repo?: string): Promise<GhOutcome> {
  if (!isUsableDir(worktreePath)) return { ok: false, error: 'Worktree path does not exist.' }
  if (!Number.isInteger(number) || number <= 0) return { ok: false, error: 'Invalid pull request number.' }
  const args = ['pr', 'checkout', String(number), '--branch', prBranchName(number)]
  if (repo) {
    if (!isValidRepo(repo)) return { ok: false, error: 'Invalid repository name.' }
    args.push('--repo', repo)
  }
  try {
    await gh(args, worktreePath)
    return { ok: true }
  } catch (error) {
    return { ok: false, error: ghError(error) }
  }
}

/** Clone `nameWithOwner` into `targetPath`, which must not exist yet. */
export async function cloneRepo(nameWithOwner: string, targetPath: string): Promise<GhOutcome> {
  if (!isValidRepo(nameWithOwner)) return { ok: false, error: 'Invalid repository name.' }
  if (!isAbsolute(targetPath)) return { ok: false, error: 'Clone path must be absolute.' }
  if (existsSync(targetPath)) return { ok: false, error: `Path already exists: ${targetPath}` }
  try {
    await gh(['repo', 'clone', nameWithOwner, targetPath])
    return { ok: true }
  } catch (error) {
    return { ok: false, error: ghError(error) }
  }
}

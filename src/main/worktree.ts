// Git worktree isolation for agent sessions (Cube-style "a worktree per agent").
//
// Every agent tab can get its own checkout of the repository so that two agents
// working on the same project never overwrite each other's files. The pure
// helpers below (parsing/naming) are unit tested; the exported async functions
// are thin `git` wrappers around them.

import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { isAbsolute, join, dirname, basename } from 'path'
import { promisify } from 'util'
import type { GitRepoInfo, WorktreeEntry } from '../shared/ipc'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 15000
const GIT_MAX_BUFFER = 1024 * 1024

/** Directory (next to the repo) that holds every TermFlow-created worktree. */
export const WORKTREE_CONTAINER = '.termflow-worktrees'

function isUsableDir(path: unknown): path is string {
  return typeof path === 'string' && isAbsolute(path) && existsSync(path) && statSync(path).isDirectory()
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    windowsHide: true,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER
  })
  return stdout
}

/**
 * Turn free text into a git ref path segment that `git check-ref-format` will
 * accept. Returns '' when nothing usable is left, so callers can reject early
 * instead of handing git a name it will refuse.
 */
export function sanitizeBranchName(input: string): string {
  const cleaned = String(input ?? '')
    // Strip ASCII control characters, which git refs may never contain.
    .split('').filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127).join('')
    .replace(/@\{/g, '-')
    .replace(/[\s~^:?*[\]\\]+/g, '-')
    .replace(/\.\.+/g, '.')
    .replace(/\/{2,}/g, '/')
    .replace(/^[/.-]+/, '')
    .replace(/[/.]+$/, '')
    .replace(/\.lock(?=$|\/)/g, 'lock')
    .replace(/-{2,}/g, '-')
  return cleaned === '@' ? '' : cleaned
}

/**
 * Comparable form of a path. `git worktree list` reports forward slashes even
 * on Windows, where `path.join` produces backslashes, so the two never match
 * literally; drive letters also vary in case.
 */
export function normalizePath(path: string): string {
  return String(path ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** Filesystem-safe directory name for a branch (`tf/foo` -> `tf-foo`). */
export function worktreeDirName(branch: string): string {
  return sanitizeBranchName(branch).replace(/\//g, '-').toLowerCase() || 'session'
}

/**
 * Where a worktree for `branch` lives: a sibling container directory next to
 * the repository, so the checkout never lands inside the repo itself (which
 * would make it show up as an untracked path in every `git status`).
 */
export function defaultWorktreePath(repoRoot: string, branch: string): string {
  return join(dirname(repoRoot), WORKTREE_CONTAINER, basename(repoRoot), worktreeDirName(branch))
}

/** `git worktree list --porcelain` -> structured entries. */
export function parseWorktreeList(stdout: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = []
  let current: WorktreeEntry | null = null
  for (const raw of String(stdout ?? '').split(/\r?\n/)) {
    const line = raw.trimEnd()
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current)
      current = { path: line.slice('worktree '.length), head: '', branch: null, detached: false, bare: false, locked: false }
      continue
    }
    if (!current) continue
    if (line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length)
    else if (line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '')
    else if (line === 'detached') current.detached = true
    else if (line === 'bare') current.bare = true
    else if (line === 'locked' || line.startsWith('locked ')) current.locked = true
  }
  if (current) entries.push(current)
  return entries.filter((entry) => entry.path.length > 0)
}

/** Repository root + current branch for any path inside a work tree, else null. */
export async function readRepoInfo(cwd: string): Promise<GitRepoInfo | null> {
  if (!isUsableDir(cwd)) return null
  try {
    const root = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
    if (!root) return null
    let branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    if (!branch || branch === 'HEAD') branch = (await git(cwd, ['rev-parse', '--short', 'HEAD'])).trim() || 'HEAD'
    return { root, branch }
  } catch {
    return null
  }
}

export async function listWorktrees(repoRoot: string): Promise<WorktreeEntry[]> {
  if (!isUsableDir(repoRoot)) return []
  try {
    return parseWorktreeList(await git(repoRoot, ['worktree', 'list', '--porcelain']))
  } catch {
    return []
  }
}

export interface WorktreeCreateInput {
  repoRoot: string
  branch: string
  /** Commit-ish the new branch starts from; defaults to the repo's current HEAD. */
  baseRef?: string
  /** Explicit checkout location; defaults to `defaultWorktreePath`. */
  path?: string
  /**
   * Check out on a detached HEAD instead of creating/reusing a branch. Used
   * when something else (e.g. `gh pr checkout`) picks the branch afterwards.
   */
  detach?: boolean
}

export type WorktreeOutcome = { ok: true; worktree: WorktreeEntry } | { ok: false; error: string }

/** Message from a failed `git` child process, without leaking the whole stack. */
function gitError(error: unknown): string {
  const err = error as { stderr?: string; message?: string }
  const text = (err?.stderr || err?.message || 'git command failed').toString().trim()
  return text.split(/\r?\n/).filter(Boolean).slice(0, 3).join(' ').slice(0, 400)
}

/**
 * Create an isolated checkout on a new branch. Existing branches are reused
 * (checked out without `-b`) so that reopening a session lands on its own work
 * instead of failing.
 */
export async function createWorktree(input: WorktreeCreateInput): Promise<WorktreeOutcome> {
  const repoRoot = input.repoRoot
  if (!isUsableDir(repoRoot)) return { ok: false, error: 'Repository path does not exist.' }
  const branch = sanitizeBranchName(input.branch)
  if (!branch) return { ok: false, error: 'Branch name is empty after sanitizing.' }

  const path = input.path?.trim() || defaultWorktreePath(repoRoot, branch)
  if (!isAbsolute(path)) return { ok: false, error: 'Worktree path must be absolute.' }
  if (existsSync(path)) return { ok: false, error: `Path already exists: ${path}` }

  try {
    const branchExists = input.detach
      ? false
      : await git(repoRoot, ['branch', '--list', branch]).then((out) => out.trim().length > 0).catch(() => false)
    let args: string[]
    if (input.detach) args = ['worktree', 'add', '--detach', path, ...(input.baseRef?.trim() ? [input.baseRef.trim()] : [])]
    else if (branchExists) args = ['worktree', 'add', path, branch]
    else args = ['worktree', 'add', '-b', branch, path, ...(input.baseRef?.trim() ? [input.baseRef.trim()] : [])]
    await git(repoRoot, args)
  } catch (error) {
    return { ok: false, error: gitError(error) }
  }

  const created = (await listWorktrees(repoRoot)).find((entry) => normalizePath(entry.path) === normalizePath(path))
  // Keep the caller's own path spelling; only the metadata comes from git.
  return created
    ? { ok: true, worktree: { ...created, path } }
    : { ok: true, worktree: { path, head: '', branch: input.detach ? null : branch, detached: input.detach === true, bare: false, locked: false } }
}

export interface WorktreeRemoveInput {
  repoRoot: string
  path: string
  /** Discard uncommitted changes in the worktree. */
  force?: boolean
  /** Also delete the branch the worktree was on (`git branch -D`). */
  deleteBranch?: boolean
  branch?: string
}

export async function removeWorktree(input: WorktreeRemoveInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const { repoRoot, path } = input
  if (!isUsableDir(repoRoot)) return { ok: false, error: 'Repository path does not exist.' }
  if (!isAbsolute(path)) return { ok: false, error: 'Worktree path must be absolute.' }
  // Refuse to touch the main working tree — removing it would delete the repo.
  const known = await listWorktrees(repoRoot)
  const target = normalizePath(path)
  if (known.length > 0 && normalizePath(known[0].path) === target) return { ok: false, error: 'Refusing to remove the main working tree.' }
  if (normalizePath(repoRoot) === target) return { ok: false, error: 'Refusing to remove the main working tree.' }

  try {
    await git(repoRoot, ['worktree', 'remove', ...(input.force ? ['--force'] : []), path])
  } catch (error) {
    return { ok: false, error: gitError(error) }
  }
  if (input.deleteBranch) {
    const branch = sanitizeBranchName(input.branch ?? '')
    // A failed branch delete is not fatal: the checkout is already gone and the
    // branch is still recoverable, so the caller keeps its success path.
    if (branch) await git(repoRoot, ['branch', '-D', branch]).catch(() => undefined)
  }
  return { ok: true }
}

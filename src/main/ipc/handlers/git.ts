import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { IPC, type GitStatus, type GitWorkbenchState } from '../../../shared/types'
import { validateCwd } from '../pathSafety'

/**
 * Git IPC. Every call goes through `execFile` with an argument array — never a
 * shell string — so `&&`, `|`, `;`, backticks and `$()` in user input stay
 * literal data. Path arguments are additionally passed after `--`.
 */

const execFileAsync = promisify(execFile)

// Kısa süreli cache: aynı cwd için ardışık git:status çağrılarında gereksiz process spawn'ı önler.
const GIT_STATUS_CACHE_TTL_MS = 1500
const GIT_STATUS_CACHE_MAX = 100
const gitStatusCache = new Map<string, { result: GitStatus | null; timestamp: number }>()

function setGitStatusCache(cwd: string, entry: { result: GitStatus | null; timestamp: number }): void {
  gitStatusCache.set(cwd, entry)
  // Bounded LRU: evict the oldest (first-inserted) entries beyond the cap.
  while (gitStatusCache.size > GIT_STATUS_CACHE_MAX) {
    const oldest = gitStatusCache.keys().next().value
    if (oldest === undefined) break
    gitStatusCache.delete(oldest)
  }
}

export function clearGitStatusCache(): void {
  gitStatusCache.clear()
}

const MAX_GIT_PATHS = 500
const MAX_COMMIT_MESSAGE = 240

/**
 * Pathspecs coming from the renderer. Rejects non-strings, NUL bytes and
 * leading `-` (option injection) even though callers also pass `--`.
 */
export function validateGitPaths(paths: unknown): string[] | null {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_GIT_PATHS) return null
  const out: string[] = []
  for (const item of paths) {
    if (typeof item !== 'string' || !item || item.length > 4096) return null
    if (item.includes('\0') || item.startsWith('-')) return null
    out.push(item)
  }
  return out
}

export async function gitStatus(rawCwd: unknown): Promise<GitStatus | null> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return null
  const cached = gitStatusCache.get(cwd)
  if (cached && Date.now() - cached.timestamp < GIT_STATUS_CACHE_TTL_MS) return cached.result
  let result: GitStatus | null
  try {
    const [{ stdout: branchOut }, { stdout: statusOut }] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8', timeout: 3000 }),
      execFileAsync('git', ['status', '--porcelain'], { cwd, encoding: 'utf-8', timeout: 3000 })
    ])
    result = { branch: branchOut.trim(), dirty: statusOut.length > 0 }
    // Ahead/behind vs upstream — best-effort, missing upstream just leaves these undefined.
    try {
      const { stdout: aheadBehindOut } = await execFileAsync(
        'git',
        ['rev-list', '--left-right', '--count', 'HEAD...@{u}'],
        { cwd, encoding: 'utf-8', timeout: 3000 }
      )
      const [ahead, behind] = aheadBehindOut.trim().split(/\s+/).map(Number)
      if (!Number.isNaN(ahead) && !Number.isNaN(behind)) {
        result.ahead = ahead
        result.behind = behind
      }
    } catch {
      /* no upstream configured, ignore */
    }
  } catch {
    result = null
  }
  setGitStatusCache(cwd, { result, timestamp: Date.now() })
  return result
}

export async function gitFetch(rawCwd: unknown): Promise<{ ok: boolean; message: string }> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return { ok: false, message: 'cwd is outside known workspaces' }
  try {
    await execFileAsync('git', ['fetch'], { cwd, encoding: 'utf-8', timeout: 15000 })
    gitStatusCache.delete(cwd)
    return { ok: true, message: 'git fetch tamamlandı' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'git fetch başarısız' }
  }
}

export async function gitWorkbench(rawCwd: unknown): Promise<GitWorkbenchState> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return { branch: '', status: '', diff: '', isRepo: false }
  // A non-git folder is a normal state, not an error — detect it first and
  // return a friendly "not a repo" result instead of throwing a raw dump.
  try {
    await execFileAsync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, encoding: 'utf-8', timeout: 5000 })
  } catch {
    return { branch: '', status: '', diff: '', isRepo: false }
  }
  try {
    const [{ stdout: branch }, { stdout: status }, { stdout: diff }] = await Promise.all([
      execFileAsync('git', ['branch', '--show-current'], { cwd, encoding: 'utf-8', timeout: 5000 }),
      execFileAsync('git', ['status', '--short'], { cwd, encoding: 'utf-8', timeout: 5000 }),
      execFileAsync('git', ['diff', '--no-ext-diff', '--stat', '--patch'], {
        cwd,
        encoding: 'utf-8',
        timeout: 10000,
        maxBuffer: 2 * 1024 * 1024
      })
    ])
    return { branch: branch.trim(), status, diff, isRepo: true }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message.split('\n')[0] : 'git workbench failed')
  }
}

export async function gitStage(rawCwd: unknown, paths: unknown): Promise<{ ok: boolean; message: string }> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return { ok: false, message: 'cwd is outside known workspaces' }
  const safePaths = validateGitPaths(paths)
  if (!safePaths) return { ok: false, message: 'Path list is invalid' }
  try {
    await execFileAsync('git', ['add', '--', ...safePaths], { cwd, timeout: 10000 })
    gitStatusCache.delete(cwd)
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message.split('\n')[0] : 'git add failed' }
  }
}

export async function gitUnstage(rawCwd: unknown, paths: unknown): Promise<{ ok: boolean; message: string }> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return { ok: false, message: 'cwd is outside known workspaces' }
  const safePaths = validateGitPaths(paths)
  if (!safePaths) return { ok: false, message: 'Path list is invalid' }
  try {
    await execFileAsync('git', ['restore', '--staged', '--', ...safePaths], { cwd, timeout: 10000 })
    gitStatusCache.delete(cwd)
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message.split('\n')[0] : 'git restore failed' }
  }
}

export async function gitCommit(rawCwd: unknown, message: unknown): Promise<{ ok: boolean; message: string }> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return { ok: false, message: 'cwd is outside known workspaces' }
  if (typeof message !== 'string' || !message.trim() || message.length > MAX_COMMIT_MESSAGE) {
    return { ok: false, message: 'Commit message is invalid' }
  }
  try {
    const { stdout } = await execFileAsync('git', ['commit', '-m', message.trim()], {
      cwd,
      encoding: 'utf-8',
      timeout: 30000
    })
    gitStatusCache.delete(cwd)
    return { ok: true, message: stdout }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message.split('\n')[0] : 'git commit failed' }
  }
}

export function registerGitIpc(): void {
  ipcMain.handle(IPC.GIT_STATUS, (_e, rawCwd: string) => gitStatus(rawCwd))
  ipcMain.handle(IPC.GIT_FETCH, (_e, rawCwd: string) => gitFetch(rawCwd))
  ipcMain.handle(IPC.GIT_WORKBENCH, (_e, rawCwd: string) => gitWorkbench(rawCwd))
  ipcMain.handle(IPC.GIT_STAGE, (_e, rawCwd: string, paths: string[]) => gitStage(rawCwd, paths))
  ipcMain.handle(IPC.GIT_UNSTAGE, (_e, rawCwd: string, paths: string[]) => gitUnstage(rawCwd, paths))
  ipcMain.handle(IPC.GIT_COMMIT, (_e, rawCwd: string, message: string) => gitCommit(rawCwd, message))
}

// Integration tests: these drive the real `git` binary against a throwaway
// repository under the OS temp directory. They are skipped when git is missing.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createWorktree, defaultWorktreePath, listWorktrees, readRepoInfo, removeWorktree } from './worktree'

function hasGit(): boolean {
  try {
    execFileSync('git', ['--version'], { windowsHide: true, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const describeGit = hasGit() ? describe : describe.skip

describeGit('worktree git integration', () => {
  let sandbox = ''
  let repo = ''

  beforeAll(() => {
    sandbox = mkdtempSync(join(tmpdir(), 'termflow-wt-'))
    repo = join(sandbox, 'my-app')
    const git = (args: string[], cwd = repo): void => {
      execFileSync('git', args, { cwd, windowsHide: true, stdio: 'ignore' })
    }
    execFileSync('git', ['init', '-b', 'main', 'my-app'], { cwd: sandbox, windowsHide: true, stdio: 'ignore' })
    git(['config', 'user.email', 'test@example.invalid'])
    git(['config', 'user.name', 'TermFlow Test'])
    writeFileSync(join(repo, 'README.md'), '# test\n')
    git(['add', '.'])
    git(['commit', '-m', 'init'])
  })

  afterAll(() => {
    if (sandbox) rmSync(sandbox, { recursive: true, force: true })
  })

  it('reads repo root and branch from inside the work tree', async () => {
    const info = await readRepoInfo(repo)
    expect(info?.branch).toBe('main')
    // git reports POSIX separators on Windows; compare on the basename.
    expect(info?.root.endsWith('my-app')).toBe(true)
  })

  it('returns null outside a repository', async () => {
    expect(await readRepoInfo(sandbox)).toBeNull()
    expect(await readRepoInfo(join(sandbox, 'does-not-exist'))).toBeNull()
  })

  it('creates an isolated checkout on a new branch outside the repo', async () => {
    const result = await createWorktree({ repoRoot: repo, branch: 'tf/agent-1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const path = result.worktree.path
    expect(path).toBe(defaultWorktreePath(repo, 'tf/agent-1'))
    expect(existsSync(join(path, 'README.md'))).toBe(true)
    expect(result.worktree.branch).toBe('tf/agent-1')
    // The checkout must not pollute the main repository directory.
    expect(readdirSync(repo)).not.toContain('tf-agent-1')

    const trees = await listWorktrees(repo)
    expect(trees.map((t) => t.branch)).toContain('tf/agent-1')
  })

  it('isolates writes between two agent worktrees', async () => {
    const second = await createWorktree({ repoRoot: repo, branch: 'tf/agent-2' })
    expect(second.ok).toBe(true)
    if (!second.ok) return

    const first = defaultWorktreePath(repo, 'tf/agent-1')
    writeFileSync(join(first, 'agent1.txt'), 'one\n')
    writeFileSync(join(second.worktree.path, 'agent2.txt'), 'two\n')

    expect(existsSync(join(first, 'agent2.txt'))).toBe(false)
    expect(existsSync(join(second.worktree.path, 'agent1.txt'))).toBe(false)
    expect(existsSync(join(repo, 'agent1.txt'))).toBe(false)
  })

  it('rejects a name that sanitizes to nothing', async () => {
    const result = await createWorktree({ repoRoot: repo, branch: '@' })
    expect(result).toEqual({ ok: false, error: 'Branch name is empty after sanitizing.' })
  })

  it('rejects an already occupied path', async () => {
    const result = await createWorktree({ repoRoot: repo, branch: 'tf/agent-1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/already exists/i)
  })

  it('refuses to remove the main working tree', async () => {
    const trees = await listWorktrees(repo)
    const result = await removeWorktree({ repoRoot: repo, path: trees[0].path })
    expect(result).toEqual({ ok: false, error: 'Refusing to remove the main working tree.' })
    expect(existsSync(join(repo, 'README.md'))).toBe(true)
  })

  it('refuses the main tree given in native path form too', async () => {
    // git reports forward slashes even on Windows; the guard must not depend
    // on the caller spelling the path the same way git does.
    const result = await removeWorktree({ repoRoot: repo, path: repo, force: true })
    expect(result).toEqual({ ok: false, error: 'Refusing to remove the main working tree.' })
    expect(existsSync(join(repo, 'README.md'))).toBe(true)
  })

  it('needs force to drop a worktree with uncommitted changes', async () => {
    const path = defaultWorktreePath(repo, 'tf/agent-1')
    const dirty = await removeWorktree({ repoRoot: repo, path })
    expect(dirty.ok).toBe(false)

    const forced = await removeWorktree({ repoRoot: repo, path, force: true })
    expect(forced).toEqual({ ok: true })
    expect(existsSync(path)).toBe(false)
    // Branch survives when deleteBranch was not requested.
    expect((await listWorktrees(repo)).map((t) => t.path)).not.toContain(path)
  })

  it('deletes the branch too when asked', async () => {
    const created = await createWorktree({ repoRoot: repo, branch: 'tf/agent-3' })
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const removed = await removeWorktree({
      repoRoot: repo,
      path: created.worktree.path,
      force: true,
      deleteBranch: true,
      branch: 'tf/agent-3'
    })
    expect(removed).toEqual({ ok: true })

    const branches = execFileSync('git', ['branch', '--list'], { cwd: repo, windowsHide: true }).toString()
    expect(branches).not.toContain('tf/agent-3')
  })

  it('creates a detached checkout without claiming a branch', async () => {
    // The PR flow needs this: git makes the checkout, `gh pr checkout` then
    // picks the branch inside it.
    const result = await createWorktree({ repoRoot: repo, branch: 'pr-99', detach: true })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(existsSync(join(result.worktree.path, 'README.md'))).toBe(true)
    expect(result.worktree.detached).toBe(true)
    expect(result.worktree.branch).toBeNull()

    const branches = execFileSync('git', ['branch', '--list'], { cwd: repo, windowsHide: true }).toString()
    expect(branches).not.toContain('pr-99')

    await removeWorktree({ repoRoot: repo, path: result.worktree.path, force: true })
  })

  it('reuses an existing branch instead of failing', async () => {
    execFileSync('git', ['branch', 'tf/existing'], { cwd: repo, windowsHide: true, stdio: 'ignore' })
    const result = await createWorktree({ repoRoot: repo, branch: 'tf/existing' })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.worktree.branch).toBe('tf/existing')
  })
})

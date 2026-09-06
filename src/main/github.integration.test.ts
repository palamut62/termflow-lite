// Integration tests against the real `gh` CLI. Read-only: they never open,
// merge or modify anything on GitHub. Skipped when gh is absent or logged out.

import { beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { checkoutPullRequest, cloneRepo, listRepos, readStatus } from './github'

function ghReady(): boolean {
  try {
    execFileSync('gh', ['auth', 'status'], { windowsHide: true, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const describeGh = ghReady() ? describe : describe.skip

describeGh('github gh integration', () => {
  it('reports an installed, authenticated CLI with an account', async () => {
    const status = await readStatus()
    expect(status.installed).toBe(true)
    expect(status.authenticated).toBe(true)
    expect(status.account.length).toBeGreaterThan(0)
    expect(status.error).toBe('')
  })

  it('lists repositories in owner/name form', async () => {
    const repos = await listRepos(5)
    expect(repos.length).toBeGreaterThan(0)
    expect(repos.length).toBeLessThanOrEqual(5)
    for (const repo of repos) expect(repo.nameWithOwner).toMatch(/^[\w.-]+\/[\w.-]+$/)
  })

  it('rejects an invalid repository name before running gh', async () => {
    const target = join(tmpdir(), 'termflow-should-not-exist')
    expect(await cloneRepo('not-a-repo', target)).toEqual({ ok: false, error: 'Invalid repository name.' })
    expect(await cloneRepo('../evil/x', target)).toEqual({ ok: false, error: 'Invalid repository name.' })
  })

  it('refuses to clone over an existing path', async () => {
    const existing = mkdtempSync(join(tmpdir(), 'termflow-gh-clone-'))
    try {
      const result = await cloneRepo('owner/repo', existing)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/already exists/i)
    } finally {
      rmSync(existing, { recursive: true, force: true })
    }
  })

  it('validates the pull request checkout target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'termflow-gh-pr-'))
    try {
      expect(await checkoutPullRequest(join(dir, 'missing'), 1)).toEqual({ ok: false, error: 'Worktree path does not exist.' })
      expect(await checkoutPullRequest(dir, 0)).toEqual({ ok: false, error: 'Invalid pull request number.' })
      expect(await checkoutPullRequest(dir, -3)).toEqual({ ok: false, error: 'Invalid pull request number.' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('github without gh', () => {
  it('reports a missing CLI instead of throwing', async () => {
    // PATH is emptied so the spawn fails with ENOENT, the "not installed" case.
    const originalPath = process.env.PATH
    process.env.PATH = join(tmpdir(), 'termflow-empty-path-that-does-not-exist')
    try {
      const status = await readStatus()
      expect(status.installed).toBe(false)
      expect(status.authenticated).toBe(false)
      expect(status.error).toContain('gh')
    } finally {
      process.env.PATH = originalPath
    }
  })
})

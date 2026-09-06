import { describe, expect, it } from 'vitest'
import { join, dirname } from 'path'
import { WORKTREE_CONTAINER, defaultWorktreePath, normalizePath, parseWorktreeList, sanitizeBranchName, worktreeDirName } from './worktree'

describe('sanitizeBranchName', () => {
  it('keeps a valid ref untouched', () => {
    expect(sanitizeBranchName('tf/claude-a1b2c3')).toBe('tf/claude-a1b2c3')
  })

  it('replaces characters git refuses in refs', () => {
    expect(sanitizeBranchName('feat: add ~thing^2')).toBe('feat-add-thing-2')
    expect(sanitizeBranchName('a?b*c[d]e\\f')).toBe('a-b-c-d-e-f')
  })

  it('collapses consecutive dots, slashes and dashes', () => {
    expect(sanitizeBranchName('a..b')).toBe('a.b')
    expect(sanitizeBranchName('a//b')).toBe('a/b')
    expect(sanitizeBranchName('a  b')).toBe('a-b')
  })

  it('strips leading and trailing separators', () => {
    expect(sanitizeBranchName('/lead/')).toBe('lead')
    expect(sanitizeBranchName('.hidden.')).toBe('hidden')
    expect(sanitizeBranchName('-dash')).toBe('dash')
  })

  it('rewrites the reserved .lock suffix', () => {
    expect(sanitizeBranchName('feature.lock')).toBe('featurelock')
    expect(sanitizeBranchName('feature.lock/child')).toBe('featurelock/child')
  })

  it('removes ASCII control characters', () => {
    const ctl = String.fromCharCode(0) + String.fromCharCode(31) + String.fromCharCode(127)
    expect(sanitizeBranchName('ab' + ctl + 'cd')).toBe('abcd')
  })

  it('rejects the @ ref and empty input', () => {
    expect(sanitizeBranchName('@')).toBe('')
    expect(sanitizeBranchName('   ')).toBe('')
    expect(sanitizeBranchName(undefined as unknown as string)).toBe('')
  })

  it('defuses the @{ reflog syntax', () => {
    expect(sanitizeBranchName('head@{1}')).toBe('head-1}')
  })
})

describe('worktreeDirName', () => {
  it('flattens slashes and lowercases', () => {
    expect(worktreeDirName('TF/Claude-A1')).toBe('tf-claude-a1')
  })

  it('falls back when nothing survives sanitizing', () => {
    expect(worktreeDirName('@')).toBe('session')
  })
})

describe('defaultWorktreePath', () => {
  it('places the checkout in a sibling container, never inside the repo', () => {
    const repo = join('C:', 'projects', 'my-app')
    const path = defaultWorktreePath(repo, 'tf/agent-1')
    expect(path).toBe(join(dirname(repo), WORKTREE_CONTAINER, 'my-app', 'tf-agent-1'))
    expect(path.startsWith(repo)).toBe(false)
  })
})

describe('parseWorktreeList', () => {
  it('parses main tree, branch worktree, detached and locked entries', () => {
    const stdout = [
      'worktree /repo',
      'HEAD aaaa1111',
      'branch refs/heads/main',
      '',
      'worktree /repo-wt/feature',
      'HEAD bbbb2222',
      'branch refs/heads/tf/agent-1',
      'locked',
      '',
      'worktree /repo-wt/detached',
      'HEAD cccc3333',
      'detached',
      ''
    ].join('\n')

    expect(parseWorktreeList(stdout)).toEqual([
      { path: '/repo', head: 'aaaa1111', branch: 'main', detached: false, bare: false, locked: false },
      { path: '/repo-wt/feature', head: 'bbbb2222', branch: 'tf/agent-1', detached: false, bare: false, locked: true },
      { path: '/repo-wt/detached', head: 'cccc3333', branch: null, detached: true, bare: false, locked: false }
    ])
  })

  it('handles bare repositories and CRLF output', () => {
    expect(parseWorktreeList('worktree /bare\r\nbare\r\n')).toEqual([
      { path: '/bare', head: '', branch: null, detached: false, bare: true, locked: false }
    ])
  })

  it('returns an empty list for empty or junk input', () => {
    expect(parseWorktreeList('')).toEqual([])
    expect(parseWorktreeList('HEAD abc\nbranch refs/heads/x')).toEqual([])
  })
})

describe('normalizePath', () => {
  it('makes git and native path spellings comparable', () => {
    expect(normalizePath('C:\\projects\\My-App')).toBe('c:/projects/my-app')
    expect(normalizePath('C:/projects/My-App')).toBe('c:/projects/my-app')
    expect(normalizePath('C:\\projects\\My-App\\')).toBe('c:/projects/my-app')
  })

  it('tolerates empty input', () => {
    expect(normalizePath('')).toBe('')
    expect(normalizePath(undefined as unknown as string)).toBe('')
  })
})

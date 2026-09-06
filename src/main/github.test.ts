import { describe, expect, it } from 'vitest'
import { ghError, parseAuthAccount, parsePullRequests, parseRepos, prBranchName } from './github'

describe('parseRepos', () => {
  it('maps gh repo list output', () => {
    const stdout = JSON.stringify([
      { name: 'termflow-lite', nameWithOwner: 'palamut62/termflow-lite', description: 'A terminal', isPrivate: false, updatedAt: '2026-09-01T00:00:00Z' },
      { name: 'secret', nameWithOwner: 'palamut62/secret', isPrivate: true }
    ])
    expect(parseRepos(stdout)).toEqual([
      { name: 'termflow-lite', nameWithOwner: 'palamut62/termflow-lite', description: 'A terminal', isPrivate: false, updatedAt: '2026-09-01T00:00:00Z' },
      { name: 'secret', nameWithOwner: 'palamut62/secret', description: '', isPrivate: true, updatedAt: '' }
    ])
  })

  it('derives a missing name from nameWithOwner', () => {
    expect(parseRepos(JSON.stringify([{ nameWithOwner: 'o/r' }]))[0].name).toBe('r')
  })

  it('drops entries without a usable owner/name', () => {
    const stdout = JSON.stringify([{ nameWithOwner: 'no-slash' }, { name: 'x' }, null, 'junk'])
    expect(parseRepos(stdout)).toEqual([])
  })

  it('survives malformed or non-array output', () => {
    expect(parseRepos('not json')).toEqual([])
    expect(parseRepos('{}')).toEqual([])
    expect(parseRepos('')).toEqual([])
  })
})

describe('parsePullRequests', () => {
  it('maps gh pr list output including the author login', () => {
    const stdout = JSON.stringify([
      { number: 12, title: 'Fix cursor', author: { login: 'octocat' }, headRefName: 'fix/cursor', isDraft: false, updatedAt: '2026-09-02T00:00:00Z' }
    ])
    expect(parsePullRequests(stdout)).toEqual([
      { number: 12, title: 'Fix cursor', author: 'octocat', headRefName: 'fix/cursor', isDraft: false, updatedAt: '2026-09-02T00:00:00Z' }
    ])
  })

  it('fills in defaults for missing fields', () => {
    expect(parsePullRequests(JSON.stringify([{ number: 3 }]))).toEqual([
      { number: 3, title: '(untitled)', author: '', headRefName: '', isDraft: false, updatedAt: '' }
    ])
  })

  it('drops entries without a positive integer number', () => {
    const stdout = JSON.stringify([{ number: 0 }, { number: -1 }, { number: 1.5 }, { number: '7' }, {}])
    expect(parsePullRequests(stdout)).toEqual([])
  })

  it('survives malformed output', () => {
    expect(parsePullRequests('<html>')).toEqual([])
    expect(parsePullRequests('null')).toEqual([])
  })
})

describe('parseAuthAccount', () => {
  it('reads the account from gh auth status', () => {
    expect(parseAuthAccount('github.com\n  ✓ Logged in to github.com account palamut62 (keyring)')).toBe('palamut62')
  })

  it('handles the older "as <login>" wording', () => {
    expect(parseAuthAccount('✓ Logged in to github.com as octocat (oauth_token)')).toBe('octocat')
  })

  it('returns empty when logged out', () => {
    expect(parseAuthAccount('You are not logged into any GitHub hosts.')).toBe('')
    expect(parseAuthAccount('')).toBe('')
  })
})

describe('prBranchName', () => {
  it('is stable and filesystem-safe', () => {
    expect(prBranchName(42)).toBe('pr-42')
    expect(prBranchName(-42)).toBe('pr-42')
    expect(prBranchName(1.9)).toBe('pr-1')
    expect(prBranchName(NaN)).toBe('pr-0')
  })
})

describe('ghError', () => {
  it('reports a missing CLI plainly', () => {
    expect(ghError({ code: 'ENOENT' })).toBe('GitHub CLI (gh) is not installed.')
  })

  it('prefers stderr and trims it to a few lines', () => {
    expect(ghError({ stderr: 'boom\ndetail\nmore\nignored', message: 'x' })).toBe('boom detail more')
  })

  it('falls back to a generic message', () => {
    expect(ghError({})).toBe('gh command failed')
  })
})

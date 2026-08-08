import { describe, expect, it } from 'vitest'
import { fuzzyFilter, fuzzyScore } from './fuzzy'

describe('fuzzyScore', () => {
  it('matches an in-order subsequence', () => {
    expect(fuzzyScore('gp', 'git push')).not.toBeNull()
  })

  it('rejects out-of-order characters', () => {
    expect(fuzzyScore('pg', 'git push')).toBeNull()
  })

  it('rejects text missing a query character', () => {
    expect(fuzzyScore('gitx', 'git push')).toBeNull()
  })

  it('scores an empty query as 0', () => {
    expect(fuzzyScore('', 'anything')).toBe(0)
  })

  it('is case insensitive', () => {
    expect(fuzzyScore('GIT', 'git status')).not.toBeNull()
    expect(fuzzyScore('git', 'GIT STATUS')).not.toBeNull()
  })

  it('prefers exact case over mismatched case', () => {
    const exact = fuzzyScore('git', 'git status') as number
    const other = fuzzyScore('git', 'GIT status') as number
    expect(exact).toBeGreaterThan(other)
  })

  it('rewards contiguous matches', () => {
    const contiguous = fuzzyScore('push', 'push origin') as number
    const scattered = fuzzyScore('push', 'pxuxsxh') as number
    expect(contiguous).toBeGreaterThan(scattered)
  })

  it('rewards word-start matches', () => {
    const wordStart = fuzzyScore('np', 'npm publish') as number
    const inside = fuzzyScore('np', 'unzip pack') as number
    expect(wordStart).toBeGreaterThan(inside)
  })

  it('treats path separators as word boundaries', () => {
    const boundary = fuzzyScore('s', 'src/main') as number
    const middle = fuzzyScore('s', 'aaas') as number
    expect(boundary).toBeGreaterThan(middle)
  })

  it('prefers the shorter haystack for equal hits', () => {
    const short = fuzzyScore('git', 'git log') as number
    const long = fuzzyScore('git', 'git log --oneline --graph --decorate --all') as number
    expect(short).toBeGreaterThan(long)
  })
})

describe('fuzzyFilter', () => {
  const items = ['npm run dev', 'git push origin main', 'npm test', 'docker ps']
  const id = (s: string): string => s

  it('keeps input order for an empty query', () => {
    expect(fuzzyFilter('', items, id)).toEqual(items)
  })

  it('drops non-matching items', () => {
    expect(fuzzyFilter('zzz', items, id)).toEqual([])
  })

  it('sorts matches by descending score', () => {
    const out = fuzzyFilter('npm', items, id)
    expect(out).toHaveLength(2)
    expect(out[0]).toBe('npm test')
  })

  it('supports a custom text accessor', () => {
    const rows = [{ command: 'git status' }, { command: 'ls -la' }]
    expect(fuzzyFilter('ls', rows, (r) => r.command)).toEqual([{ command: 'ls -la' }])
  })

  it('does not mutate the source array', () => {
    const copy = items.slice()
    fuzzyFilter('npm', items, id)
    expect(items).toEqual(copy)
  })
})

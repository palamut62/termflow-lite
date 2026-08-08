import { describe, it, expect } from 'vitest'
import { findPathMatches, resolvePath } from './filePathLinks'

describe('findPathMatches', () => {
  it('finds a windows absolute path with backslashes', () => {
    const m = findPathMatches('at C:\\Users\\a\\b.ts done')
    expect(m).toHaveLength(1)
    expect(m[0].path).toBe('C:\\Users\\a\\b.ts')
    expect(m[0].text).toBe('C:\\Users\\a\\b.ts')
  })

  it('finds a windows absolute path with forward slashes', () => {
    const m = findPathMatches('C:/Users/a/b.ts')
    expect(m[0].path).toBe('C:/Users/a/b.ts')
  })

  it('finds a posix absolute path', () => {
    const m = findPathMatches('open /home/a/b.ts now')
    expect(m).toHaveLength(1)
    expect(m[0].path).toBe('/home/a/b.ts')
  })

  it('finds a bare relative path', () => {
    const m = findPathMatches('ERROR in src/app.ts')
    expect(m).toHaveLength(1)
    expect(m[0].path).toBe('src/app.ts')
    expect(m[0].start).toBe('ERROR in '.length)
    expect(m[0].end).toBe('ERROR in src/app.ts'.length)
  })

  it('finds a dot-slash relative path', () => {
    const m = findPathMatches('./src/app.ts')
    expect(m[0].path).toBe('./src/app.ts')
  })

  it('finds a parent-relative windows path', () => {
    const m = findPathMatches('..\\lib\\x.py')
    expect(m[0].path).toBe('..\\lib\\x.py')
  })

  it('parses a :line suffix', () => {
    const m = findPathMatches('src/a.ts:42')
    expect(m[0].path).toBe('src/a.ts')
    expect(m[0].line).toBe(42)
    expect(m[0].col).toBeUndefined()
  })

  it('parses a :line:col suffix', () => {
    const m = findPathMatches('  src/a.ts:42:7  ')
    expect(m[0].path).toBe('src/a.ts')
    expect(m[0].line).toBe(42)
    expect(m[0].col).toBe(7)
  })

  it('parses the parenthesised compiler format', () => {
    const m = findPathMatches('src/a.ts(42,7): error TS1005')
    expect(m[0].path).toBe('src/a.ts')
    expect(m[0].line).toBe(42)
    expect(m[0].col).toBe(7)
  })

  it('parses a python traceback line', () => {
    const m = findPathMatches('  File "src/a.py", line 42, in <module>')
    expect(m[0].path).toBe('src/a.py')
    expect(m[0].line).toBe(42)
  })

  it('strips trailing punctuation', () => {
    const m = findPathMatches('see src/app.ts, and /tmp/x.log.')
    expect(m.map((x) => x.path)).toEqual(['src/app.ts', '/tmp/x.log'])
  })

  it('skips http and https urls', () => {
    expect(findPathMatches('open https://example.com/a/b.ts please')).toHaveLength(0)
    expect(findPathMatches('http://x.dev/y/z')).toHaveLength(0)
  })

  it('ignores bare numbers and ratios', () => {
    expect(findPathMatches('12/34')).toHaveLength(0)
    expect(findPathMatches('1:2:3')).toHaveLength(0)
    expect(findPathMatches('42')).toHaveLength(0)
  })

  it('ignores empty and separator-less lines', () => {
    expect(findPathMatches('')).toHaveLength(0)
    expect(findPathMatches('   ')).toHaveLength(0)
    expect(findPathMatches('build finished ok')).toHaveLength(0)
  })

  it('returns non-overlapping matches left to right', () => {
    const m = findPathMatches('a/b.ts:1 c/d.ts:2:3 /e/f.ts')
    expect(m.map((x) => x.path)).toEqual(['a/b.ts', 'c/d.ts', '/e/f.ts'])
    for (let i = 1; i < m.length; i++) expect(m[i].start).toBeGreaterThanOrEqual(m[i - 1].end)
  })
})

describe('resolvePath', () => {
  it('leaves absolute paths untouched', () => {
    expect(resolvePath('C:\\work', 'C:\\other\\a.ts')).toBe('C:\\other\\a.ts')
    expect(resolvePath('/work', '/other/a.ts')).toBe('/other/a.ts')
  })

  it('joins with the cwd separator style', () => {
    expect(resolvePath('C:\\work\\app', 'src/a.ts')).toBe('C:\\work\\app\\src\\a.ts')
    expect(resolvePath('/work/app', 'src/a.ts')).toBe('/work/app/src/a.ts')
  })

  it('drops ./ and collapses ../', () => {
    expect(resolvePath('/work/app', './src/a.ts')).toBe('/work/app/src/a.ts')
    expect(resolvePath('/work/app', '../lib/x.py')).toBe('/work/lib/x.py')
    expect(resolvePath('C:\\work\\app\\', '..\\lib\\x.py')).toBe('C:\\work\\lib\\x.py')
  })

  it('returns the path unchanged without a cwd', () => {
    expect(resolvePath('', 'src/a.ts')).toBe('src/a.ts')
  })
})

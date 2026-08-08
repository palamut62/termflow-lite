import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { hasUnsafeKeys, pathInside, realPathInside, safeFileId, safePathString, validateCwd } from './pathSafety'

let root: string
let workspace: string
let outside: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'termflow-paths-'))
  workspace = join(root, 'ws')
  outside = join(root, 'secret')
  mkdirSync(workspace, { recursive: true })
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(workspace, 'ok.txt'), 'inside', 'utf-8')
  writeFileSync(join(outside, 'passwords.txt'), 'top secret', 'utf-8')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('safePathString', () => {
  it.each([
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['NUL byte', (): unknown => 'C:\\ws\\ok.txt\u0000.png'],
    ['overlong', 'C:\\ws\\' + 'a'.repeat(5000)]
  ])('rejects %s', (_label, value) => {
    expect(safePathString(value)).toBeNull()
  })

  it('accepts an ordinary path', () => {
    expect(safePathString('C:\\ws\\ok.txt')).toBe('C:\\ws\\ok.txt')
  })
})

describe('pathInside', () => {
  it('accepts a file inside the workspace', () => {
    expect(pathInside(workspace, join(workspace, 'ok.txt'))).toBe(resolve(workspace, 'ok.txt'))
  })

  it('accepts the workspace root itself', () => {
    expect(pathInside(workspace, workspace)).toBe(resolve(workspace))
  })

  it('accepts a sibling-looking name that starts with dots', () => {
    expect(pathInside(workspace, join(workspace, '..config'))).toBe(resolve(workspace, '..config'))
  })

  it.each([
    ['dot-dot traversal', (): string => join(workspace, '..', 'secret', 'passwords.txt')],
    ['deep dot-dot traversal', (): string => join(workspace, '..', '..', '..', '..', 'windows', 'win.ini')],
    ['absolute system path', (): string => 'C:\\Windows\\System32\\drivers\\etc\\hosts'],
    ['UNC path', (): string => '\\\\attacker\\share\\payload.txt'],
    ['sibling directory prefix', (): string => workspace + '-evil'],
    ['posix traversal', (): string => workspace + '/../secret/passwords.txt']
  ])('rejects %s', (_label, candidate) => {
    expect(() => pathInside(workspace, candidate())).toThrow(/outside the workspace/)
  })

  it.each([
    ['NUL byte', (): unknown => join(workspace, 'ok.txt') + '\u0000.png'],
    ['non-string', (): unknown => ({ toString: () => join(workspace, 'ok.txt') })],
    ['empty string', (): unknown => '']
  ])('rejects %s as invalid', (_label, candidate) => {
    expect(() => pathInside(workspace, candidate())).toThrow(/Path is invalid/)
  })
})

describe('realPathInside', () => {
  it('resolves a normal file inside the workspace', async () => {
    await expect(realPathInside(workspace, join(workspace, 'ok.txt'))).resolves.toContain('ok.txt')
  })

  it('rejects a symlink/junction inside the workspace that points outside it', async () => {
    const link = join(workspace, 'escape')
    try {
      symlinkSync(outside, link, 'junction')
    } catch {
      return // symlink creation not permitted in this environment
    }
    await expect(realPathInside(workspace, join(link, 'passwords.txt'))).rejects.toThrow(/outside the workspace/)
  })

  it('still rejects plain traversal', async () => {
    await expect(realPathInside(workspace, join(workspace, '..', 'secret'))).rejects.toThrow(/outside the workspace/)
  })
})

describe('validateCwd', () => {
  it('accepts an existing absolute directory', () => {
    expect(validateCwd(workspace)).toBe(workspace)
  })

  it.each([
    ['relative path', (): unknown => 'src'],
    ['empty', (): unknown => ''],
    ['whitespace', (): unknown => '   '],
    ['non-string', (): unknown => 123],
    ['null', (): unknown => null],
    ['NUL byte', (): unknown => workspace + '\u0000'],
    ['missing directory', (): unknown => join(workspace, 'does-not-exist')]
  ])('rejects %s', (_label, value) => {
    expect(validateCwd(value())).toBeNull()
  })

  it('rejects a file', () => {
    expect(validateCwd(join(workspace, 'ok.txt'))).toBeNull()
  })
})

describe('safeFileId', () => {
  it('accepts nanoid-shaped ids', () => {
    expect(safeFileId('V1StGXR8_Z5jdHi6B-myT')).toBe('V1StGXR8_Z5jdHi6B-myT')
  })

  it.each([
    ['traversal', '../../etc/passwd'],
    ['backslash traversal', '..\\..\\termflow'],
    ['dot segment', '..'],
    ['separator', 'a/b'],
    ['dotted', 'file.json'],
    ['empty', ''],
    ['non-string', 7],
    ['too long', 'a'.repeat(129)]
  ])('rejects %s', (_label, value) => {
    expect(safeFileId(value)).toBeNull()
  })
})

describe('hasUnsafeKeys', () => {
  it('detects prototype pollution keys', () => {
    expect(hasUnsafeKeys(JSON.parse('{"__proto__":{"polluted":true}}'))).toBe(true)
    expect(hasUnsafeKeys({ constructor: 1 })).toBe(true)
    expect(hasUnsafeKeys({ prototype: 1 })).toBe(true)
  })

  it('passes ordinary objects', () => {
    expect(hasUnsafeKeys({ theme: 'dark' })).toBe(false)
  })
})

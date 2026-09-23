import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir, homedir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolvePathCandidate } from './pathResolver'

const cleanup: string[] = []
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('resolvePathCandidate', () => {
  it('resolves an existing absolute directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-path-'))
    cleanup.push(dir)
    expect(resolvePathCandidate(dir, dir)).toEqual({ path: dir, isDirectory: true, canOpen: true })
  })

  it('resolves a relative file against cwd', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-path-'))
    cleanup.push(dir)
    const file = join(dir, 'notes.txt')
    await writeFile(file, 'x')
    expect(resolvePathCandidate('notes.txt', dir)).toEqual({ path: file, isDirectory: false, canOpen: true })
  })

  it('resolves a nested relative folder path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-path-'))
    cleanup.push(dir)
    const sub = join(dir, 'resources', 'server')
    await mkdir(sub, { recursive: true })
    expect(resolvePathCandidate('resources/server', dir)).toEqual({ path: sub, isDirectory: true, canOpen: true })
  })

  it('resolves .. and a trailing slash directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-path-'))
    cleanup.push(dir)
    const sub = join(dir, 'nested')
    await mkdir(sub)
    expect(resolvePathCandidate('..', sub)?.path).toBe(dir)
    // The trailing separator is platform specific: '\' is a plain filename character on POSIX.
    const sep = process.platform === 'win32' ? '\\' : '/'
    expect(resolvePathCandidate(`${sub}${sep}`, dir)).toEqual({ path: sub, isDirectory: true, canOpen: true })
  })

  it('expands ~ to the home directory', () => {
    const result = resolvePathCandidate('~', tmpdir())
    expect(result).not.toBeNull()
    expect(result!.path).toBe(homedir())
    expect(result!.isDirectory).toBe(true)
  })

  it('returns null for a non-existent path', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-path-'))
    cleanup.push(dir)
    expect(resolvePathCandidate('does-not-exist.txt', dir)).toBeNull()
    expect(resolvePathCandidate(join(dir, 'missing', 'file.ts'), dir)).toBeNull()
  })

  it('rejects URLs and protocol-like values', () => {
    expect(resolvePathCandidate('https://github.com/palamut62/mauscrew-releases', 'C:\\')).toBeNull()
    expect(resolvePathCandidate('mailto:user@example.com', 'C:\\')).toBeNull()
  })

  it('rejects network paths before touching the filesystem', () => {
    expect(resolvePathCandidate('\\\\server\\share\\file.txt', 'C:\\')).toBeNull()
    expect(resolvePathCandidate('//server/share/file.txt', 'C:\\')).toBeNull()
  })

  it('marks executable and script files for reveal instead of execution', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-path-'))
    cleanup.push(dir)
    const file = join(dir, 'run.cmd')
    await writeFile(file, '@echo off')
    expect(resolvePathCandidate(file, dir)).toEqual({ path: file, isDirectory: false, canOpen: false })
  })

  it('rejects empty and oversized candidates', () => {
    expect(resolvePathCandidate('   ', 'C:\\')).toBeNull()
    expect(resolvePathCandidate('a'.repeat(9000), 'C:\\')).toBeNull()
  })
})

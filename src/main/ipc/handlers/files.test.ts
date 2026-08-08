import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Filesystem IPC is the app's most dangerous surface: a renderer compromise
 * must not turn `fs:list` / `fs:readText` into "read any file on the box".
 */

const harness = vi.hoisted(() => ({ workspaces: [] as Array<Record<string, unknown>> }))

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }))
vi.mock('../../db/database', () => ({ listWorkspaces: () => harness.workspaces }))

import { checkFileExists, listWorkspaceFiles, readPackageScripts, readWorkspaceText, checkManifest } from './files'

// Created eagerly: `it.each` tables are built at collection time, before hooks run.
const root = mkdtempSync(join(tmpdir(), 'termflow-fs-'))
const ws = join(root, 'workspace')
const secretDir = join(root, 'secrets')
const secretFile = join(secretDir, 'passwords.txt')

beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(ws, 'src'), { recursive: true })
  mkdirSync(secretDir, { recursive: true })
  writeFileSync(join(ws, 'README.md'), '# hello', 'utf-8')
  writeFileSync(join(ws, 'src', 'index.ts'), 'export {}', 'utf-8')
  writeFileSync(secretFile, 'top secret', 'utf-8')
  harness.workspaces = [{ id: 'ws1', path: ws, name: 'ws' }]
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const escapes = (): Array<[string, unknown]> => [
  ['dot-dot traversal', join(ws, '..', 'secrets', 'passwords.txt')],
  ['nested traversal', join(ws, 'src', '..', '..', 'secrets', 'passwords.txt')],
  ['posix traversal', ws + '/../secrets/passwords.txt'],
  ['absolute system path', 'C:\\Windows\\System32\\drivers\\etc\\hosts'],
  ['absolute posix path', '/etc/passwd'],
  ['UNC path', '\\\\attacker\\share\\payload.txt'],
  ['sibling prefix', ws + '-evil'],
  ['secrets dir', secretDir]
]

describe('listWorkspaceFiles', () => {
  it('lists the workspace root', async () => {
    const entries = await listWorkspaceFiles('ws1')
    expect(entries.map((e) => e.name)).toEqual(['src', 'README.md'])
    expect(entries[0].directory).toBe(true)
  })

  it('lists a subdirectory inside the workspace', async () => {
    const entries = await listWorkspaceFiles('ws1', join(ws, 'src'))
    expect(entries.map((e) => e.name)).toEqual(['index.ts'])
  })

  it.each(escapes())('refuses to list %s', async (_label, path) => {
    await expect(listWorkspaceFiles('ws1', path)).rejects.toThrow(/outside the workspace|Path is invalid/)
  })

  it('refuses a NUL-byte path', async () => {
    await expect(listWorkspaceFiles('ws1', join(ws, 'src') + '\u0000')).rejects.toThrow(/Path is invalid/)
  })

  it('refuses an overlong path', async () => {
    await expect(listWorkspaceFiles('ws1', join(ws, 'a'.repeat(5000)))).rejects.toThrow(/Path is invalid/)
  })

  it('returns [] for an unknown workspace', async () => {
    await expect(listWorkspaceFiles('nope')).resolves.toEqual([])
    await expect(listWorkspaceFiles(null)).resolves.toEqual([])
    await expect(listWorkspaceFiles(undefined)).resolves.toEqual([])
  })

  it('hides heavy/vcs directories', async () => {
    mkdirSync(join(ws, 'node_modules'))
    mkdirSync(join(ws, '.git'))
    const names = (await listWorkspaceFiles('ws1')).map((e) => e.name)
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('.git')
  })

  it('does not follow a symlink that escapes the workspace', async () => {
    const link = join(ws, 'escape')
    try {
      symlinkSync(secretDir, link, 'junction')
    } catch {
      return
    }
    await expect(listWorkspaceFiles('ws1', link)).rejects.toThrow(/outside the workspace/)
  })
})

describe('readWorkspaceText', () => {
  it('reads a file inside the workspace', async () => {
    await expect(readWorkspaceText('ws1', join(ws, 'README.md'))).resolves.toBe('# hello')
  })

  it.each(escapes())('refuses to read %s', async (_label, path) => {
    await expect(readWorkspaceText('ws1', path)).rejects.toThrow(/outside the workspace|Path is invalid/)
  })

  it('refuses a symlinked file that escapes the workspace', async () => {
    const link = join(ws, 'escape-file')
    try {
      symlinkSync(secretFile, link, 'file')
    } catch {
      return
    }
    await expect(readWorkspaceText('ws1', link)).rejects.toThrow(/outside the workspace/)
  })

  it('rejects binary content', async () => {
    const bin = join(ws, 'bin.dat')
    writeFileSync(bin, Buffer.from([0x00, 0x01, 0x02]))
    await expect(readWorkspaceText('ws1', bin)).rejects.toThrow(/Binary/)
  })

  it('rejects an unknown workspace', async () => {
    await expect(readWorkspaceText('nope', join(ws, 'README.md'))).rejects.toThrow(/Workspace not found/)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 42],
    ['object', { path: 'README.md' }]
  ])('rejects a %s path', async (_label, path) => {
    await expect(readWorkspaceText('ws1', path)).rejects.toThrow(/Path is invalid/)
  })
})

describe('checkManifest / readPackageScripts', () => {
  it('reads a manifest from a valid cwd', async () => {
    writeFileSync(join(ws, '.termflow.json'), JSON.stringify({ name: 'demo', tasks: [] }), 'utf-8')
    await expect(checkManifest(ws)).resolves.toMatchObject({ name: 'demo' })
  })

  it('returns null for a corrupt manifest', async () => {
    writeFileSync(join(ws, '.termflow.json'), '{not json', 'utf-8')
    await expect(checkManifest(ws)).resolves.toBeNull()
  })

  it.each([
    ['relative cwd', 'src'],
    ['non-string cwd', 42],
    ['null cwd', null],
    ['missing cwd', join(tmpdir(), 'termflow-missing-dir-xyz')]
  ])('returns null for %s', async (_label, cwd) => {
    await expect(checkManifest(cwd)).resolves.toBeNull()
    await expect(readPackageScripts(cwd)).resolves.toBeNull()
  })

  it('detects the package manager from lockfiles', async () => {
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }), 'utf-8')
    await expect(readPackageScripts(ws)).resolves.toEqual({ scripts: { dev: 'vite' }, packageManager: 'npm' })
    writeFileSync(join(ws, 'pnpm-lock.yaml'), '', 'utf-8')
    await expect(readPackageScripts(ws)).resolves.toMatchObject({ packageManager: 'pnpm' })
  })

  it('tolerates a package.json without scripts', async () => {
    writeFileSync(join(ws, 'package.json'), JSON.stringify({ name: 'x' }), 'utf-8')
    await expect(readPackageScripts(ws)).resolves.toEqual({ scripts: {}, packageManager: 'npm' })
  })
})

describe('checkFileExists', () => {
  it('reports existing files', () => {
    expect(checkFileExists(join(ws, 'README.md'))).toBe(true)
    expect(checkFileExists(join(ws, 'nope.md'))).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['number', 1],
    ['empty', ''],
    ['NUL byte', 'C:\\Windows\u0000'],
    ['overlong', 'C:\\' + 'a'.repeat(5000)]
  ])('returns false for %s without throwing', (_label, value) => {
    expect(checkFileExists(value)).toBe(false)
  })
})

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Git IPC must never build a shell string: metacharacters in renderer input
 * have to stay literal argv entries.
 */

const spawned = vi.hoisted(() => {
  const calls: Array<{ cmd: string; argv: string[]; opts: Record<string, unknown> }> = []
  let responder: (cmd: string, argv: string[]) => { stdout: string; stderr: string } = () => ({ stdout: '', stderr: '' })
  return {
    calls,
    reset(): void {
      calls.length = 0
      responder = () => ({ stdout: '', stderr: '' })
    },
    respond(fn: (cmd: string, argv: string[]) => { stdout: string; stderr: string }): void {
      responder = fn
    },
    run(cmd: string, argv: string[], opts: Record<string, unknown>): { stdout: string; stderr: string } {
      calls.push({ cmd, argv, opts })
      return responder(cmd, argv)
    }
  }
})

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn(), on: vi.fn() } }))

vi.mock('child_process', () => {
  const execFile = ((): never => {
    throw new Error('callback form is not used')
  }) as unknown as Record<symbol, unknown>
  execFile[Symbol.for('nodejs.util.promisify.custom')] = async (
    cmd: string,
    argv: string[],
    opts: Record<string, unknown>
  ) => spawned.run(cmd, argv, opts)
  return { execFile, default: { execFile } }
})

import { clearGitStatusCache, gitCommit, gitFetch, gitStage, gitStatus, gitUnstage, validateGitPaths } from './git'

let repo: string

beforeAll(() => {
  repo = mkdtempSync(join(tmpdir(), 'termflow-git-'))
})

afterAll(() => {
  rmSync(repo, { recursive: true, force: true })
})

beforeEach(() => {
  spawned.reset()
  clearGitStatusCache()
})

const INJECTION = [
  'a && calc.exe',
  'a | whoami',
  'a; rm -rf /',
  'a `whoami`',
  'a $(whoami)',
  'a\nwhoami',
  'a & start notepad'
]

describe('validateGitPaths', () => {
  it('accepts a plain list', () => {
    expect(validateGitPaths(['src/a.ts', 'b.ts'])).toEqual(['src/a.ts', 'b.ts'])
  })

  it.each([
    ['non-array', 'src/a.ts'],
    ['empty array', []],
    ['null', null],
    ['undefined', undefined],
    ['non-string member', ['ok.ts', 42]],
    ['empty member', ['']],
    ['NUL byte member', ['ok.ts\u0000.png']],
    ['option-looking member', ['--upload-pack=calc.exe']],
    ['too many members', new Array(501).fill('a.ts')]
  ])('rejects %s', (_label, value) => {
    expect(validateGitPaths(value)).toBeNull()
  })
})

describe('gitStage / gitUnstage', () => {
  it('passes paths as argv after -- and never through a shell', async () => {
    const res = await gitStage(repo, ['src/a.ts', 'src/b.ts'])
    expect(res.ok).toBe(true)
    expect(spawned.calls[0].cmd).toBe('git')
    expect(spawned.calls[0].argv).toEqual(['add', '--', 'src/a.ts', 'src/b.ts'])
    expect(spawned.calls[0].opts.shell).toBeUndefined()
  })

  it.each(INJECTION)('keeps %j as a literal argument', async (payload) => {
    await gitStage(repo, [payload])
    expect(spawned.calls[0].argv).toEqual(['add', '--', payload])
    expect(spawned.calls[0].opts.shell).toBeUndefined()
  })

  it('rejects an option-shaped path without spawning git', async () => {
    const res = await gitStage(repo, ['--exec=calc.exe'])
    expect(res).toEqual({ ok: false, message: 'Path list is invalid' })
    expect(spawned.calls).toHaveLength(0)
  })

  it('rejects a malformed path list on unstage without spawning git', async () => {
    expect(await gitUnstage(repo, null)).toEqual({ ok: false, message: 'Path list is invalid' })
    expect(await gitUnstage(repo, [{ path: 'a.ts' }])).toEqual({ ok: false, message: 'Path list is invalid' })
    expect(spawned.calls).toHaveLength(0)
  })

  it('unstages with restore --staged --', async () => {
    await gitUnstage(repo, ['a.ts'])
    expect(spawned.calls[0].argv).toEqual(['restore', '--staged', '--', 'a.ts'])
  })

  it('refuses an invalid cwd', async () => {
    expect(await gitStage('relative/path', ['a.ts'])).toEqual({ ok: false, message: 'cwd is outside known workspaces' })
    expect(await gitStage(null, ['a.ts'])).toEqual({ ok: false, message: 'cwd is outside known workspaces' })
    expect(spawned.calls).toHaveLength(0)
  })
})

describe('gitCommit', () => {
  it.each(INJECTION)('passes %j as a single -m argument', async (payload) => {
    await gitCommit(repo, payload)
    expect(spawned.calls[0].argv).toEqual(['commit', '-m', payload.trim()])
    expect(spawned.calls[0].opts.shell).toBeUndefined()
  })

  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
    ['too long', 'x'.repeat(241)]
  ])('rejects %s message', async (_label, message) => {
    expect(await gitCommit(repo, message)).toEqual({ ok: false, message: 'Commit message is invalid' })
    expect(spawned.calls).toHaveLength(0)
  })
})

describe('gitStatus', () => {
  it('returns null for an invalid cwd without spawning', async () => {
    expect(await gitStatus(undefined)).toBeNull()
    expect(await gitStatus(join(repo, 'missing'))).toBeNull()
    expect(spawned.calls).toHaveLength(0)
  })

  it('parses branch and dirty flag', async () => {
    spawned.respond((_cmd, argv) => {
      if (argv[0] === 'branch') return { stdout: 'main\n', stderr: '' }
      if (argv[0] === 'status') return { stdout: ' M a.ts\n', stderr: '' }
      return { stdout: '2\t3\n', stderr: '' }
    })
    expect(await gitStatus(repo)).toEqual({ branch: 'main', dirty: true, ahead: 2, behind: 3 })
  })

  it('caches consecutive calls for the same cwd', async () => {
    await gitStatus(repo)
    const first = spawned.calls.length
    await gitStatus(repo)
    expect(spawned.calls.length).toBe(first)
  })
})

describe('gitFetch', () => {
  it('spawns git fetch with no user-controlled argv', async () => {
    expect(await gitFetch(repo)).toEqual({ ok: true, message: 'git fetch tamamlandı' })
    expect(spawned.calls[0].argv).toEqual(['fetch'])
  })

  it('rejects an invalid cwd', async () => {
    expect(await gitFetch(123)).toEqual({ ok: false, message: 'cwd is outside known workspaces' })
  })
})

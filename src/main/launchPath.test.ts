import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseLaunchRequest } from './launchPath'

const cleanup: string[] = []
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('parseLaunchRequest', () => {
  it('accepts an existing absolute Explorer directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-launch-'))
    cleanup.push(dir)
    expect(parseLaunchRequest(['TermFlow Lite.exe', dir])).toEqual({ cwd: dir })
  })

  it('keeps the selected profile with the Explorer directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-launch-'))
    cleanup.push(dir)
    expect(parseLaunchRequest(['TermFlow Lite.exe', '--profile', 'provider:deepseek', dir]))
      .toEqual({ cwd: dir, profileId: 'provider:deepseek' })
  })

  it('decodes an Explorer-safe provider profile id', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-launch-'))
    cleanup.push(dir)
    expect(parseLaunchRequest(['TermFlow Lite.exe', '--profile', 'provider--deepseek', dir]))
      .toEqual({ cwd: dir, profileId: 'provider:deepseek' })
  })

  it('uses the last profile when Electron prepends its own profile switch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-launch-'))
    cleanup.push(dir)
    expect(parseLaunchRequest(['electron.exe', '--profile', 'chromium', '--profile', 'claude', dir]))
      .toEqual({ cwd: dir, profileId: 'claude' })
  })

  it('rejects files, switches and relative app arguments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-launch-'))
    cleanup.push(dir)
    const file = join(dir, 'file.txt')
    await writeFile(file, 'x')
    expect(parseLaunchRequest(['electron.exe', '.', '--flag', file])).toBeNull()
  })
})

import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { launchDirectory } from './launchPath'

const cleanup: string[] = []
afterEach(async () => Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('launchDirectory', () => {
  it('accepts an existing absolute Explorer directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-launch-'))
    cleanup.push(dir)
    expect(launchDirectory(['TermFlow Lite.exe', dir])).toBe(dir)
  })

  it('rejects files, switches and relative app arguments', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'termflow-launch-'))
    cleanup.push(dir)
    const file = join(dir, 'file.txt')
    await writeFile(file, 'x')
    expect(launchDirectory(['electron.exe', '.', '--flag', file])).toBeNull()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { cliInvocation, prepareLaunch, executablePath, isWindowsExecutable } from './cli'

const dirs: string[] = []
function fakeExecutable(): Buffer {
  const header = Buffer.alloc(68); header.write('MZ'); header.writeUInt32LE(64, 60); header.write('PE', 64)
  return header
}
afterEach(() => { vi.unstubAllEnvs(); for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
describe('CLI launch safety', () => {
  it('passes the prompt as one native argument without shell interpretation', () => {
    const dir = mkdtempSync(join(tmpdir(), 'termflow-cli-')); dirs.push(dir)
    const file = join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex')
    writeFileSync(file, fakeExecutable())
    const prompt = 'review %PATH% & echo surprise; $(command) "quoted"'
    const input = prepareLaunch({ kind: 'custom', shell: file, args: ['--sandbox', 'read-only'], launchCommand: prompt })
    expect(input.args).toEqual(['--sandbox', 'read-only', '--', prompt])
    expect(input.launchCommand).toBeUndefined(); expect(input.startupCommand).toBeUndefined()
  })
  it('rejects unsupported startup plus prompt before either can run', () => {
    expect(() => prepareLaunch({ kind: 'cmd', startupCommand: 'missing_cli', launchCommand: 'echo injected' })).toThrow('supported agent')
  })
  it('reports a missing executable', () => { expect(() => cliInvocation('termflow_certainly_missing_binary')).toThrow('CLI not found') })
  it('skips an empty extensionless PATH entry and rejects invalid executable files before spawning', () => {
    const dir = mkdtempSync(join(tmpdir(), 'termflow-cli-')); dirs.push(dir)
    const first = join(dir, 'first'), second = join(dir, 'second'); mkdirSync(first); mkdirSync(second)
    const invalid = join(first, 'claude'); writeFileSync(invalid, '')
    expect(isWindowsExecutable(invalid)).toBe(false)
    if (process.platform !== 'win32') return
    const valid = join(second, 'claude.exe'); writeFileSync(valid, fakeExecutable())
    vi.stubEnv('Path', `${first};${second}`)
    expect(executablePath('claude')).toBe(valid)
    expect(() => prepareLaunch({ kind: 'custom', shell: invalid })).toThrow('CLI not found')
  })
  it('runs a saved shell task as a single process with a meaningful exit code', () => {
    expect(prepareLaunch({ kind: 'cmd', launchCommand: 'echo hello' })).toMatchObject({ args: ['/d', '/s', '/c', 'echo hello'], launchCommand: undefined })
  })
  it('preserves the WSL distribution and rejects non-shell executables for tasks', () => {
    expect(prepareLaunch({ kind: 'wsl', args: ['-d', 'Ubuntu'], launchCommand: 'pwd' }).args).toEqual(['-d', 'Ubuntu', '--exec', 'sh', '-lc', 'pwd'])
    expect(() => prepareLaunch({ kind: 'custom', shell: 'ssh.exe', launchCommand: 'pwd' })).toThrow('require a shell')
  })
})

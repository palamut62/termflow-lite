import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings, type ShellInfo } from '../../shared/types'
import { profileToInput, resolveProfileId } from './profileResolver'

const SHELLS: ShellInfo[] = [
  { id: 'bash', name: 'Bash', kind: 'custom', command: '/bin/bash', args: [] },
  { id: 'powershell', name: 'PowerShell', kind: 'powershell', command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', args: ['-NoLogo'] },
  { id: 'sh', name: 'Shell', kind: 'custom', command: '/bin/sh', args: [] }
]

function settings(overrides: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...overrides }
}

describe('resolveProfileId', () => {
  it('keeps a valid shell id', () => {
    expect(resolveProfileId('bash', settings(), SHELLS)).toBe('bash')
  })

  it('keeps a custom profile id', () => {
    const s = settings({ profiles: [{ id: 'dev', name: 'Dev', command: 'tmux' }] })
    expect(resolveProfileId('dev', s, SHELLS)).toBe('dev')
  })

  it('yerleşik profil id\'sini korur (settings.profiles boş olsa da)', () => {
    expect(resolveProfileId('codex', settings(), SHELLS)).toBe('codex')
  })

  it('falls back to the first available shell by priority when the id is unknown', () => {
    const shells = [SHELLS[0], SHELLS[2]] // bash + sh (no pwsh/powershell/cmd/gitbash/wsl)
    expect(resolveProfileId('does-not-exist', settings(), shells)).toBe('bash')
  })

  it('returns "custom" when no shell is available at all', () => {
    expect(resolveProfileId('anything', settings(), [])).toBe('custom')
  })
})

describe('profileToInput', () => {
  it('maps a shell id to its kind, command and args', () => {
    const input = profileToInput('powershell', settings(), SHELLS, { cols: 120, rows: 30 })
    expect(input.kind).toBe('powershell')
    expect(input.shell).toBe(SHELLS[1].command)
    expect(input.args).toEqual(['-NoLogo'])
    expect(input.cols).toBe(120)
    expect(input.rows).toBe(30)
  })

  it('maps a custom profile to kind custom with command/args/env', () => {
    const s = settings({ profiles: [{ id: 'dev', name: 'Dev', command: '/usr/bin/tmux', args: ['new', '-s', 'x'], env: { A: 'b' } }] })
    const input = profileToInput('dev', s, SHELLS, { cols: 80, rows: 24 })
    expect(input.kind).toBe('custom')
    expect(input.shell).toBe('/usr/bin/tmux')
    expect(input.args).toEqual(['new', '-s', 'x'])
    expect(input.env).toEqual({ A: 'b' })
  })

  it('uses the last used directory when startupDirectory is "last"', () => {
    const s = settings({ startupDirectory: 'last', lastCwd: '/tmp/project' })
    const input = profileToInput('bash', s, SHELLS, { cols: 80, rows: 24 })
    expect(input.cwd).toBe('/tmp/project')
  })

  it('uses the configured directory when startupDirectory is "custom"', () => {
    const s = settings({ startupDirectory: 'custom', customStartupDirectory: ' /data/work ' })
    const input = profileToInput('bash', s, SHELLS, { cols: 80, rows: 24 })
    expect(input.cwd).toBe('/data/work')
  })

  it('prefers the profile cwd over the startup directory', () => {
    const s = settings({
      startupDirectory: 'custom',
      customStartupDirectory: '/data/work',
      profiles: [{ id: 'dev', name: 'Dev', command: 'tmux', cwd: '/profiles/dev' }]
    })
    const input = profileToInput('dev', s, SHELLS, { cols: 80, rows: 24 })
    expect(input.cwd).toBe('/profiles/dev')
  })

  it('yerleşik CLI ajan profilini varsayılan kabukta açıp startupCommand taşır', () => {
    const input = profileToInput('claude', settings(), SHELLS, { cols: 80, rows: 24 })
    expect(input.startupCommand).toBe('claude --dangerously-skip-permissions')
    // command boş: Windows'ta cmd.exe, diğer platformlarda kullanıcı kabuğu.
    if (process.platform === 'win32') expect(input.kind).toBe('cmd')
    else expect(input.kind).toBe('custom')
  })

  it('kullanıcı aynı id ile profil tanımlarsa onunki kazanır', () => {
    const s = settings({
      profiles: [{ id: 'claude', name: 'My Claude', command: '/usr/bin/claude', startupCommand: '' }]
    })
    const input = profileToInput('claude', s, SHELLS, { cols: 80, rows: 24 })
    expect(input.kind).toBe('custom')
    expect(input.shell).toBe('/usr/bin/claude')
    expect(input.startupCommand).toBeUndefined()
  })

  it('lets an explicit opts.cwd win over everything', () => {
    const s = settings({
      startupDirectory: 'custom',
      customStartupDirectory: '/data/work',
      profiles: [{ id: 'dev', name: 'Dev', command: 'tmux', cwd: '/profiles/dev' }]
    })
    const input = profileToInput('dev', s, SHELLS, { cols: 80, rows: 24, cwd: '/opts/cwd' })
    expect(input.cwd).toBe('/opts/cwd')
  })

  it('maps a provider profile to its CLI command and routing environment', () => {
    const input = profileToInput('provider:deepseek', settings(), SHELLS, {
      cols: 80,
      rows: 24,
      cwd: '/work/provider'
    })
    expect(input.cwd).toBe('/work/provider')
    expect(input.startupCommand).toBe('claude --dangerously-skip-permissions')
    expect(input.env).toEqual({
      ANTHROPIC_MODEL: 'deepseek-v4-pro',
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic'
    })
  })

  it('honors standard permissions when a command profile disables full access', () => {
    const s = settings({
      profiles: [{ id: 'claude', name: 'Claude Code', command: '', startupCommand: 'claude', fullPermissions: false }]
    })
    const input = profileToInput('claude', s, SHELLS, { cols: 80, rows: 24 })
    expect(input.startupCommand).toBe('claude')
  })
})

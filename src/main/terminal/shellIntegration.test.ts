import { describe, expect, it } from 'vitest'
import { applyShellIntegration, shellFamily, type SpawnSpec } from './shellIntegration'
import type { CreateTerminalInput } from '../../shared/types'

const DIR = 'C:\\TermFlow\\resources\\shell-integration'
const spec = (shell: string, args: string[] = [], env: Record<string, string> = {}): SpawnSpec => ({ shell, args, env })
const input = (extra: Partial<CreateTerminalInput> = {}): CreateTerminalInput => ({ kind: 'custom', shellIntegration: true, ...extra })

describe('shellIntegration', () => {
  it('recognises shell families by executable name', () => {
    expect(shellFamily('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe')).toBe('powershell')
    expect(shellFamily('C:\\Program Files\\PowerShell\\7\\pwsh.exe')).toBe('powershell')
    expect(shellFamily('C:\\Program Files\\Git\\bin\\bash.exe')).toBe('bash')
    expect(shellFamily('/usr/bin/zsh')).toBe('zsh')
    expect(shellFamily('C:\\Windows\\System32\\cmd.exe')).toBeNull()
    expect(shellFamily('C:\\Windows\\System32\\wsl.exe')).toBeNull()
  })

  it('loads the PowerShell script as a script block after the profile', () => {
    const out = applyShellIntegration(spec('pwsh.exe', ['-NoLogo']), input(), DIR)
    expect(out.args.slice(0, 3)).toEqual(['-NoLogo', '-NoExit', '-Command'])
    expect(out.args[3]).toContain('[scriptblock]::Create([IO.File]::ReadAllText(')
    expect(out.args[3]).toContain('powershell.ps1')
    expect(out.args[3]).not.toMatch(/ExecutionPolicy/i)
  })

  it('escapes single quotes in the PowerShell script path', () => {
    const out = applyShellIntegration(spec('powershell.exe', []), input(), "C:\\Users\\o'neil\\si")
    expect(out.args[2]).toContain("o''neil")
  })

  it('turns a Git Bash login shell into --rcfile and keeps login semantics via env', () => {
    const out = applyShellIntegration(spec('C:\\Git\\bin\\bash.exe', ['--login', '-i']), input(), DIR)
    expect(out.args[0]).toBe('--rcfile')
    expect(out.args[1]).toMatch(/shell-integration\/bash\.sh$/)
    expect(out.args[1]).not.toContain('\\')
    expect(out.args[2]).toBe('-i')
    expect(out.env.TERMFLOW_BASH_LOGIN).toBe('1')
  })

  it('points zsh at the ZDOTDIR shim and remembers the user ZDOTDIR', () => {
    const out = applyShellIntegration(spec('/bin/zsh', [], { HOME: '/home/u', ZDOTDIR: '/home/u/.config/zsh' }), input(), '/opt/tf/si')
    expect(out.env.ZDOTDIR).toMatch(/si[\\/]zsh$/)
    expect(out.env.TERMFLOW_USER_ZDOTDIR).toBe('/home/u/.config/zsh')
  })

  it('leaves the spawn untouched when disabled, unsupported or already scripted', () => {
    const base = spec('pwsh.exe', ['-NoLogo'])
    expect(applyShellIntegration(base, input({ shellIntegration: false }), DIR)).toBe(base)
    expect(applyShellIntegration(base, input({ startupCommand: 'claude' }), DIR)).toBe(base)
    expect(applyShellIntegration(base, input(), null)).toBe(base)
    const cmd = spec('cmd.exe')
    expect(applyShellIntegration(cmd, input(), DIR)).toBe(cmd)
    const scripted = spec('pwsh.exe', ['-File', 'build.ps1'])
    expect(applyShellIntegration(scripted, input(), DIR)).toBe(scripted)
    const bashScript = spec('bash', ['-c', 'make'])
    expect(applyShellIntegration(bashScript, input(), DIR)).toBe(bashScript)
  })
})

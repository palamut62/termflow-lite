import { afterEach, describe, expect, it } from 'vitest'
import {
  discoverShells,
  listWslDistros,
  parseWslOutput,
  refreshPathCache,
  resolveShell,
  unixShellCandidates,
  __resetPathCacheForTests
} from './ShellDiscovery'

describe('PATH resolution never blocks the main process', () => {
  it('returns immediately on a cold cache and keeps the inherited PATH', () => {
    __resetPathCacheForTests()
    const started = Date.now()
    const resolved = resolveShell({ kind: 'cmd' })
    // A synchronous `reg query` pair costs ~200ms; this path must be instant.
    expect(Date.now() - started).toBeLessThan(30)
    const pathKey = Object.keys(resolved.env).find((k) => k.toLowerCase() === 'path')
    expect(pathKey).toBeDefined()
    expect(resolved.env[pathKey!]).toBeTruthy()
  })

  it('populates the cache in the background and reuses it', async () => {
    __resetPathCacheForTests()
    await refreshPathCache()
    const started = Date.now()
    resolveShell({ kind: 'cmd' })
    expect(Date.now() - started).toBeLessThan(30)
  })
})

describe('resolveShell', () => {
  it('sets TERM/COLORTERM/TERM_PROGRAM and applies input env last', () => {
    const resolved = resolveShell({ kind: 'custom', shell: 'C:\\custom.exe', env: { FOO: 'bar' } })
    expect(resolved.env.TERM).toBe('xterm-256color')
    expect(resolved.env.COLORTERM).toBe('truecolor')
    expect(resolved.env.TERM_PROGRAM).toBe('TermFlow Lite')
    expect(resolved.env.FOO).toBe('bar')
    expect(resolved.env.NO_COLOR).toBeUndefined()
  })

  it('resolves windows shell kinds to their executables', () => {
    if (process.platform !== 'win32') return // Windows-specific resolution
    const cmd = resolveShell({ kind: 'cmd' })
    expect(cmd.shell.toLowerCase()).toContain('cmd.exe')
    const ps = resolveShell({ kind: 'powershell' })
    expect(ps.shell.toLowerCase()).toContain('powershell.exe')
    const custom = resolveShell({ kind: 'custom', shell: 'C:\\tools\\app.exe', args: ['-x'] })
    expect(custom.shell).toBe('C:\\tools\\app.exe')
    expect(custom.args).toEqual(['-x'])
  })
})

describe('parseWslOutput', () => {
  it('decodes UTF-16LE raw output and strips NULs', () => {
    // What inbox wsl.exe emits without a BOM: UTF-16LE, one byte per char pair.
    const raw = Buffer.from('Ubuntu\r\nDebian\r\n', 'utf16le')
    expect(parseWslOutput(raw)).toEqual(['Ubuntu', 'Debian'])
  })

  it('decodes UTF-8 output (Store wsl.exe)', () => {
    const raw = Buffer.from('Ubuntu\r\nAlpine\r\n', 'utf8')
    expect(parseWslOutput(raw)).toEqual(['Ubuntu', 'Alpine'])
  })

  it('tolerates stray NUL bytes around UTF-16LE text', () => {
    // e.g. a trailing NUL or a BOM pair left by the WSL console wrapper.
    const raw = Buffer.concat([Buffer.from('﻿', 'utf16le'), Buffer.from('Ubuntu\r\n', 'utf16le'), Buffer.from([0])])
    expect(parseWslOutput(raw)).toEqual(['Ubuntu'])
  })

  it('drops the header line, (Default) markers and empty lines', () => {
    const raw = Buffer.from(
      'Windows Subsystem for Linux Distributions:\r\nUbuntu (Default)\r\n\r\nDebian*\r\n',
      'utf8'
    )
    expect(parseWslOutput(raw)).toEqual(['Ubuntu', 'Debian'])
  })

  it('returns [] for empty or header-only output', () => {
    expect(parseWslOutput(Buffer.from(''))).toEqual([])
    expect(parseWslOutput(Buffer.from('\r\n\r\n', 'utf8'))).toEqual([])
  })
})

describe('unixShellCandidates (Linux/macOS discovery, pure — no subprocess)', () => {
  it('falls back to /bin/bash and /bin/sh when $SHELL is unset and zsh/fish are missing', () => {
    const shells = unixShellCandidates({}, () => null)
    expect(shells.map((s) => s.id)).toEqual(['bash', 'sh'])
    expect(shells[0].command).toBe('/bin/bash')
    expect(shells[0].kind).toBe('custom')
  })

  it('prefers $SHELL and names it "<Capitalized> (default)"', () => {
    const shells = unixShellCandidates({ SHELL: '/usr/bin/zsh' }, () => null)
    expect(shells.map((s) => s.id)).toEqual(['zsh', 'bash', 'sh'])
    expect(shells[0].name).toBe('Zsh (default)')
    expect(shells[0].command).toBe('/usr/bin/zsh')
  })

  it('does not duplicate a $SHELL that matches a well-known shell', () => {
    const shells = unixShellCandidates({ SHELL: '/bin/bash' }, () => null)
    expect(shells.filter((s) => s.id === 'bash')).toHaveLength(1)
    expect(shells[0].name).toBe('Bash (default)')
  })

  it('adds shells found on PATH via which, skipping ones that are absent', () => {
    const which = (name: string): string | null => (name === 'fish' ? '/usr/local/bin/fish' : null)
    const shells = unixShellCandidates({}, which)
    const ids = shells.map((s) => s.id)
    expect(ids).toContain('fish')
    expect(shells.find((s) => s.id === 'fish')?.command).toBe('/usr/local/bin/fish')
    expect(ids).not.toContain('zsh') // which('zsh') returned null -> skipped
    expect(ids).toContain('bash') // fixed fallback stays
  })

  it('never returns an empty list (bash + sh always exist)', () => {
    expect(unixShellCandidates({}, () => null).length).toBeGreaterThan(0)
  })
})

describe('discoverShells', () => {
  it('never returns an empty list and always includes a working default', async () => {
    const shells = await discoverShells()
    expect(shells.length).toBeGreaterThan(0)
    if (process.platform === 'win32') {
      const powershell = shells.find((s) => s.id === 'powershell')
      expect(powershell).toBeDefined()
      expect(powershell?.icon).toBe('powershell')
    } else {
      const bash = shells.find((s) => s.id === 'bash')
      expect(bash).toBeDefined()
    }
  })

  it('replaces the generic wsl entry with one shell per distro', async () => {
    const distros = await listWslDistros()
    if (distros.length === 0) return // no WSL distros on this machine — nothing to assert
    const shells = await discoverShells()
    expect(shells.find((s) => s.id === 'wsl')).toBeUndefined()
    const first = shells.find((s) => s.id === `wsl-${distros[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`)
    expect(first).toBeDefined()
    expect(first?.kind).toBe('wsl')
    expect(first?.args).toEqual(['-d', distros[0]])
    expect(first?.icon).toBe('linux')
  })

  afterEach(() => {
    __resetPathCacheForTests()
  })
})

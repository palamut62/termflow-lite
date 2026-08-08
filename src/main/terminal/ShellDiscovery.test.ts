import { afterEach, describe, expect, it } from 'vitest'
import { discoverShells, refreshPathCache, resolveShell, __resetPathCacheForTests } from './ShellDiscovery'

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

describe('discoverShells', () => {
  it('never returns an empty list and always includes a working default', () => {
    const shells = discoverShells()
    expect(shells.length).toBeGreaterThan(0)
    if (process.platform === 'win32') {
      const powershell = shells.find((s) => s.id === 'powershell')
      expect(powershell).toBeDefined()
    } else {
      const bash = shells.find((s) => s.id === 'bash')
      expect(bash).toBeDefined()
    }
  })

  afterEach(() => {
    __resetPathCacheForTests()
  })
})

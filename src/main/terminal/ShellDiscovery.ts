import { existsSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import type { CreateTerminalInput, ShellInfo, ShellKind } from '../../shared/types'

export interface ResolvedShell {
  shell: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((p) => existsSync(p))
}

const winDir = process.env.SystemRoot || 'C:\\Windows'
const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
const localAppData = process.env['LOCALAPPDATA'] || ''

function powershellPath(): string {
  return join(winDir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function pwshPath(): string | undefined {
  return firstExisting([
    join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    join(localAppData, 'Microsoft', 'PowerShell', '7', 'pwsh.exe')
  ])
}

function gitBashPath(): string | undefined {
  return firstExisting([
    join(programFiles, 'Git', 'bin', 'bash.exe'),
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
  ])
}

/** Discover which shells are available on this machine (PRD FR-010). */
export function discoverShells(): ShellInfo[] {
  // Full Linux support lands in a later phase — here we only make sure the
  // app never crashes when started on a non-Windows machine.
  if (process.platform !== 'win32') {
    const bash = process.env.SHELL || '/bin/bash'
    return [
      { id: 'bash', name: 'Bash', kind: 'custom', command: bash, args: [] },
      { id: 'sh', name: 'Shell', kind: 'custom', command: '/bin/sh', args: [] }
    ]
  }

  const pwsh = pwshPath()
  const gitBash = gitBashPath()
  const wsl = firstExisting([join(winDir, 'System32', 'wsl.exe')])
  const list: ShellInfo[] = [
    { id: 'powershell', name: 'PowerShell', kind: 'powershell', command: powershellPath(), args: [] },
    { id: 'pwsh', name: 'PowerShell Core', kind: 'pwsh', command: pwsh ?? '', args: [] },
    { id: 'cmd', name: 'Command Prompt', kind: 'cmd', command: join(winDir, 'System32', 'cmd.exe'), args: [] },
    { id: 'wsl', name: 'WSL', kind: 'wsl', command: wsl ?? '', args: [] },
    { id: 'gitbash', name: 'Git Bash', kind: 'gitbash', command: gitBash ?? '', args: ['--login', '-i'] }
  ]
  return list.filter((s) => (s.command ? existsSync(s.command) : false))
}

/**
 * Read a PATH value from the registry WITHOUT blocking the event loop.
 * `execSync` here used to stall the whole main process (IPC, PTY output,
 * window events) for ~190ms on every cache miss — see refreshPathCache().
 */
function readRegPath(hive: 'HKLM' | 'HKCU'): Promise<string | undefined> {
  const key =
    hive === 'HKLM'
      ? 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
      : 'HKCU\\Environment'
  return new Promise((resolve) => {
    execFile(
      'reg',
      ['query', key, '/v', 'Path'],
      { encoding: 'utf8', windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(undefined)
        const match = String(stdout).match(/Path\s+(REG_SZ|REG_EXPAND_SZ)\s+(.*)/)
        resolve(match ? expandEnvVars(match[2].trim()) : undefined)
      }
    )
  })
}

function expandEnvVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, name) => {
    const found = process.env[name]
    return found !== undefined ? found : match
  })
}

let pathCache: { value: string | null; ts: number } | null = null
let pathRefreshInFlight: Promise<void> | null = null
let refreshScheduled = false
const PATH_CACHE_TTL_MS = 5 * 60_000

/**
 * Refresh the registry PATH cache in the background. Concurrent calls share a
 * single in-flight refresh. Nothing on the terminal-creation path ever awaits
 * this: resolveShell() always uses the last known value immediately.
 */
export function refreshPathCache(): Promise<void> {
  if (pathRefreshInFlight) return pathRefreshInFlight
  pathRefreshInFlight = (async () => {
    try {
      const [machine, user] = await Promise.all([readRegPath('HKLM'), readRegPath('HKCU')])
      const combined = [machine, user].filter((v): v is string => !!v).join(';')
      pathCache = { value: combined || null, ts: Date.now() }
    } catch {
      pathCache = { value: null, ts: Date.now() }
    } finally {
      pathRefreshInFlight = null
    }
  })()
  return pathRefreshInFlight
}

/**
 * Kick off a refresh on the next tick. Even `execFile` pays ~10-30ms of
 * synchronous spawn cost, which must not land on the terminal-creation path.
 */
function scheduleRefresh(): void {
  if (pathRefreshInFlight || refreshScheduled) return
  refreshScheduled = true
  setImmediate(() => {
    refreshScheduled = false
    void refreshPathCache()
  })
}

/** Warm the cache once at startup so the very first terminal already has it. */
export function warmPathCache(): void {
  void refreshPathCache()
}

/**
 * Stale-while-revalidate: return the cached value synchronously (null when the
 * cache was never populated, in which case the caller simply keeps
 * process.env.PATH) and kick off a background refresh when it went stale.
 */
function freshPath(): string | null {
  if (!pathCache) {
    scheduleRefresh()
    return null
  }
  if (Date.now() - pathCache.ts >= PATH_CACHE_TTL_MS) scheduleRefresh()
  return pathCache.value
}

/** Test seam: reset the module-level PATH cache. */
export function __resetPathCacheForTests(): void {
  pathCache = null
  pathRefreshInFlight = null
  refreshScheduled = false
}

function mergePathValues(registryPath: string, currentPath: string): string {
  const registryEntries = registryPath.split(';').filter(Boolean)
  const seen = new Set(registryEntries.map((p) => p.toLowerCase()))
  const extra = currentPath.split(';').filter((p) => p && !seen.has(p.toLowerCase()))
  return [...registryEntries, ...extra].join(';')
}

/**
 * Resolve a terminal-creation request into a concrete shell + args.
 * (PRD §18)
 */
export function resolveShell(input: CreateTerminalInput): ResolvedShell {
  const home = process.env.HOME || process.env.USERPROFILE || process.cwd()
  const cwd = input.cwd || home
  const env = { ...process.env } as Record<string, string>

  const registryPath = freshPath()
  if (registryPath) {
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path'
    const currentPath = env[pathKey] || ''
    env[pathKey] = mergePathValues(registryPath, currentPath)
  }

  // CLI'lar truecolor'ı COLORTERM üzerinden algılar; ConPTY altında bu
  // değişkenler yoksa 16 renge düşerler. Advertise the capabilities xterm.js
  // actually implements. The parent process may carry TERM=dumb and NO_COLOR=1.
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'TermFlow Lite'
  env.TERM_PROGRAM_VERSION = process.env.npm_package_version || '0.1.0'
  delete env.WT_SESSION
  delete env.WT_PROFILE_ID
  delete env.NO_COLOR

  // Explicit input.env is applied afterwards, so a profile can still opt into
  // NO_COLOR deliberately without inheriting the launcher's global flag.
  Object.assign(env, input.env || {})

  // Non-Windows: minimal bash/sh support (crash guard; full support later).
  if (process.platform !== 'win32') {
    return { shell: input.shell || process.env.SHELL || '/bin/bash', args: input.args ?? [], cwd, env }
  }

  const psPath = powershellPath()
  const cmdPath = join(winDir, 'System32', 'cmd.exe')

  // Explicit custom command / shell wins.
  if (input.kind === 'custom' && input.shell) {
    return { shell: input.shell, args: input.args ?? [], cwd, env }
  }

  const gitBash = gitBashPath()
  const pwsh = pwshPath()
  const wsl = join(winDir, 'System32', 'wsl.exe')

  switch (input.kind) {
    case 'powershell':
      return { shell: psPath, args: ['-NoLogo'], cwd, env }
    case 'pwsh':
      return { shell: pwsh ?? psPath, args: ['-NoLogo'], cwd, env }
    case 'cmd':
      return { shell: cmdPath, args: [], cwd, env }
    case 'wsl':
      return { shell: wsl, args: input.args ?? [], cwd, env }
    case 'gitbash':
      return {
        shell: gitBash ?? psPath,
        args: gitBash ? ['--login', '-i'] : ['-NoLogo'],
        cwd,
        env
      }
    default:
      return { shell: psPath, args: ['-NoLogo'], cwd, env }
  }
}

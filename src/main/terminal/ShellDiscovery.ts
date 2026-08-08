import { existsSync } from 'fs'
import { join } from 'path'
import { execFile, execFileSync } from 'child_process'
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

/**
 * Parse raw `wsl.exe -l -q` output into distro names. WSL prints UTF-16LE on
 * most inbox builds, UTF-8 on Store builds; newer builds append `(Default)`
 * (and sometimes `*`) to the default distro, and a header line appears when
 * `-q` is not supported. Pure so the decoding/cleaning logic can be tested.
 */
export function parseWslOutput(raw: Buffer): string[] {
  // ASCII text in UTF-16LE contains 0x00 bytes between every character; UTF-8
  // never does — sniff the encoding from the bytes themselves.
  const text = raw.includes(0) ? raw.toString('utf16le') : raw.toString('utf8')
  return text
    .replace(/﻿/g, '') // BOM (either encoding)
    .replace(/\0/g, '') // stray NULs
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.includes(':')) // e.g. "Windows Subsystem for Linux Distributions:"
    .map((line) => line.replace(/\s*\(Default\)\s*$/, '').replace(/\*+$/, '').trim())
    .filter((line) => line.length > 0)
}

/** 'Ubuntu-22.04' -> 'ubuntu-22-04' (used for wsl-<distro> shell ids). */
function slug(name: string): string {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s || 'distro'
}

/** Unix basename: '/usr/bin/zsh' -> 'zsh'. */
function basenameOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i >= 0 ? path.slice(i + 1) : path
}

/** 'zsh' -> 'Zsh'. */
function capitalize(name: string): string {
  return name ? name[0].toUpperCase() + name.slice(1) : name
}

/** Resolve an executable name via `which`; null when it is not on PATH. */
function whichOf(name: string): string | null {
  try {
    const out = execFileSync('which', [name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    return out || null
  } catch {
    return null
  }
}

/**
 * Enumerate shells for the shared unix branch — Linux (PRD §12) and macOS
 * (PRD §13, §78) run the exact same discovery. Order matters:
 *   1. `$SHELL` (the user's actual default login shell), id = basename, e.g.
 *      `$SHELL=/usr/bin/zsh` -> id 'zsh', name 'Zsh (default)'.
 *   2. Well-known shells: bash (fixed /bin/bash fallback), zsh, fish (only
 *      when found on PATH), sh (fixed /bin/sh). Entries whose id is already
 *      taken by `$SHELL` are skipped, so a `$SHELL=/bin/bash` user sees one
 *      'bash' entry, not two.
 * Pure and injectable (env + `which` resolver) so the logic is unit-testable
 * on Windows without spawning any process.
 */
export function unixShellCandidates(env: Record<string, string>, which: (name: string) => string | null): ShellInfo[] {
  const list: ShellInfo[] = []

  const userShell = env.SHELL
  if (userShell) {
    const id = basenameOf(userShell) || 'shell'
    list.push({ id, name: `${capitalize(id)} (default)`, kind: 'custom', command: userShell, args: [], icon: id })
  }

  const add = (id: string, path: string | null): void => {
    if (!path || list.some((s) => s.id === id)) return
    list.push({ id, name: capitalize(id), kind: 'custom', command: path, args: [], icon: id })
  }
  add('bash', which('bash') ?? '/bin/bash')
  add('zsh', which('zsh'))
  add('fish', which('fish'))
  add('sh', '/bin/sh')

  return list
}

/** Enumerate installed WSL distros; `[]` on error or when none are installed. */
export function listWslDistros(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'wsl.exe',
      ['-l', '-q'],
      { encoding: 'buffer', windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([])
        resolve(parseWslOutput(Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout))))
      }
    )
  })
}

/** Discover which shells are available on this machine (PRD FR-010). */
export async function discoverShells(): Promise<ShellInfo[]> {
  // Unix branch — Linux (PRD §12) and macOS (PRD §13, §78) share this
  // discovery: $SHELL first, well-known shells via `which`, deduped by id.
  if (process.platform !== 'win32') {
    return unixShellCandidates(process.env as Record<string, string>, (name) => whichOf(name))
  }

  const pwsh = pwshPath()
  const gitBash = gitBashPath()
  const wsl = firstExisting([join(winDir, 'System32', 'wsl.exe')])
  const list: ShellInfo[] = [
    { id: 'powershell', name: 'PowerShell', kind: 'powershell', command: powershellPath(), args: [], icon: 'powershell' },
    { id: 'pwsh', name: 'PowerShell Core', kind: 'pwsh', command: pwsh ?? '', args: [], icon: 'powershell' },
    { id: 'cmd', name: 'Command Prompt', kind: 'cmd', command: join(winDir, 'System32', 'cmd.exe'), args: [], icon: 'cmd' },
    { id: 'wsl', name: 'WSL', kind: 'wsl', command: wsl ?? '', args: [], icon: 'linux' },
    { id: 'gitbash', name: 'Git Bash', kind: 'gitbash', command: gitBash ?? '', args: ['--login', '-i'], icon: 'gitbash' }
  ]
  const base = list.filter((s) => (s.command ? existsSync(s.command) : false))

  // Distro enumeration: one shell per installed distro. Without any distros
  // (or when the query fails) the generic 'wsl' entry stays — it launches the
  // default distro without args.
  const wslEntry = base.find((s) => s.id === 'wsl')
  if (wslEntry) {
    const distros = await listWslDistros()
    if (distros.length > 0) {
      return [
        ...base.filter((s) => s.id !== 'wsl'),
        ...distros.map((name) => ({
          id: `wsl-${slug(name)}`,
          name,
          kind: 'wsl' as const,
          command: wslEntry.command,
          args: ['-d', name],
          icon: 'linux'
        }))
      ]
    }
  }
  return base
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

  // Unix (Linux + macOS, PRD §12/§13): explicit input.shell wins, then $SHELL,
  // then the universal /bin/bash default.
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

import { existsSync } from 'fs'
import { join } from 'path'
import { execFile } from 'child_process'
import type { CreateTerminalInput, ShellKind } from '../../shared/types'

export interface ResolvedShell {
  shell: string
  args: string[]
  cwd: string
  env: Record<string, string>
}

interface ShellCandidate {
  kind: ShellKind
  label: string
  shell: string
  args: string[]
  available: boolean
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

function sshPath(): string | undefined {
  return firstExisting([
    join(winDir, 'System32', 'OpenSSH', 'ssh.exe'),
    join(programFiles, 'Git', 'usr', 'bin', 'ssh.exe')
  ])
}

/** Discover which shells are available on this machine (PRD FR-010). */
export function discoverShells(): ShellCandidate[] {
  const pwsh = pwshPath()
  const gitBash = gitBashPath()
  const wsl = firstExisting([join(winDir, 'System32', 'wsl.exe')])
  return [
    {
      kind: 'powershell',
      label: 'PowerShell',
      shell: powershellPath(),
      args: [],
      available: true
    },
    { kind: 'pwsh', label: 'PowerShell Core', shell: pwsh ?? '', args: [], available: !!pwsh },
    { kind: 'cmd', label: 'CMD', shell: join(winDir, 'System32', 'cmd.exe'), args: [], available: true },
    { kind: 'wsl', label: 'WSL', shell: wsl ?? '', args: [], available: !!wsl },
    { kind: 'gitbash', label: 'Git Bash', shell: gitBash ?? '', args: ['--login', '-i'], available: !!gitBash }
  ]
}

/**
 * Locate a bundled shell-integration script. Resolved without electron's `app`
 * so the detached PTY daemon (a plain node process) can use it too.
 * Dev: <project>/resources/... — packaged: <resources>/resources/... .
 */
function shellIntegrationScript(file: string): string | undefined {
  const candidates = [
    join(__dirname, '../../resources/shell-integration', file),
    process.resourcesPath ? join(process.resourcesPath, 'resources', 'shell-integration', file) : '',
    join(process.cwd(), 'resources', 'shell-integration', file)
  ].filter(Boolean)
  return firstExisting(candidates)
}

/**
 * Shell kinds that can emit OSC 133 semantic prompts. CMD is intentionally
 * absent: it has no pre/post-exec hook and its prompt expands %ERRORLEVEL% at
 * assignment time, so a `133;D;<exitcode>` from it would always be stale — see
 * resources/shell-integration/cmd-unsupported.md.
 */
export const SHELL_INTEGRATION_KINDS: ShellKind[] = ['powershell', 'pwsh', 'gitbash']

function expandEnvVars(value: string): string {
  return value.replace(/%([^%]+)%/g, (match, name) => {
    const found = process.env[name]
    return found !== undefined ? found : match
  })
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
  const extra = currentPath
    .split(';')
    .filter((p) => p && !seen.has(p.toLowerCase()))
  return [...registryEntries, ...extra].join(';')
}

/**
 * Resolve a terminal-creation request into a concrete shell + args.
 * AI tools (claude/codex/opencode/ollama) run inside a host shell so the CLI
 * is launched via the user's PATH. (PRD §18)
 */
export function resolveShell(input: CreateTerminalInput): ResolvedShell {
  const cwd = input.cwd || process.env.USERPROFILE || process.cwd()
  const env = { ...process.env } as Record<string, string>

  if (input.cleanProviderEnv) {
    const providerPrefixes = ['ANTHROPIC_', 'CLAUDE_CODE_', 'OPENAI_', 'OPENROUTER_', 'DEEPSEEK_', 'OLLAMA_']
    for (const key of Object.keys(env)) {
      if (providerPrefixes.some((prefix) => key.toUpperCase().startsWith(prefix))) delete env[key]
    }
  }

  const registryPath = freshPath()
  if (registryPath) {
    const pathKey = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path'
    const currentPath = env[pathKey] || ''
    env[pathKey] = mergePathValues(registryPath, currentPath)
  }

  // Embedded-terminal renk desteği: CLI'lar (claude/codex vb.) truecolor'ı
  // COLORTERM üzerinden algılar; ConPTY altında bu değişkenler yoksa 16 renge düşerler.
  // Advertise the capabilities xterm.js actually implements. The parent
  // process may carry TERM=dumb and NO_COLOR=1, which force AI TUIs into a
  // monochrome fallback even though this terminal supports truecolor.
  env.TERM = 'xterm-256color'
  env.COLORTERM = 'truecolor'
  env.TERM_PROGRAM = 'TermFlow'
  env.TERM_PROGRAM_VERSION = process.env.npm_package_version || '0.1.0'
  delete env.WT_SESSION
  delete env.WT_PROFILE_ID
  delete env.NO_COLOR

  // Claude Code's low-flicker TUI mode (on versions that support it); versions
  // that don't recognise the flag ignore it. Only for claude agents (best-effort).
  if (input.kind === 'claude' && !env.CLAUDE_CODE_NO_FLICKER) env.CLAUDE_CODE_NO_FLICKER = '1'

  // The terminal advertises its actual color support through TERM/COLORTERM.
  // Do not force a CLI-specific color mode: Claude Code owns its own theme and
  // should not receive a fake Windows Terminal identity from an xterm.js host.
  // Explicit input.env is applied afterwards, so a workspace can still opt
  // into NO_COLOR deliberately without inheriting the launcher's global flag.
  Object.assign(env, input.env || {})

  const psPath = powershellPath()
  const cmdPath = join(winDir, 'System32', 'cmd.exe')

  // Explicit custom command / shell wins.
  if (input.kind === 'custom' && input.startupCommand) {
    return { shell: cmdPath, args: [], cwd, env }
  }

  if (input.kind === 'custom' && input.shell) {
    return { shell: input.shell, args: input.args ?? [], cwd, env }
  }

  const gitBash = gitBashPath()
  const pwsh = pwshPath()
  const wsl = join(winDir, 'System32', 'wsl.exe')

  // Interactive host shell for CLI agents. We use cmd.exe (not PowerShell) and
  // type the command as input rather than passing it via -Command. cmd.exe
  // resolves names via PATHEXT and skips extensionless PATH entries, so npm
  // shims like `claude.cmd`/`codex.cmd` launch correctly — PowerShell would
  // instead match an extensionless file (e.g. System32\claude) and pop the
  // Windows "Open with" dialog. Errors also stay visible in-terminal.
  const host = (): ResolvedShell => ({ shell: cmdPath, args: [], cwd, env })

  // Opt-in OSC 133 shell integration (settings.shellIntegration, default off).
  // The script is dot-sourced/rc-sourced into THIS session only — nothing is
  // ever written to $PROFILE or ~/.bashrc. When the flag is off, or the script
  // is missing, every branch below falls through to the legacy args unchanged.
  const psIntegrationArgs = (): string[] | null => {
    if (!input.shellIntegration) return null
    const script = shellIntegrationScript('powershell.ps1')
    if (!script) return null
    return ['-NoLogo', '-NoExit', '-Command', `. '${script.replace(/'/g, "''")}'`]
  }
  const bashIntegrationArgs = (): string[] | null => {
    if (!input.shellIntegration) return null
    const script = shellIntegrationScript('bash.sh')
    if (!script) return null
    // --rcfile only applies to interactive non-login shells, so --login is
    // dropped here; the rc file sources /etc/bash.bashrc and ~/.bashrc itself.
    return ['-i', '--rcfile', script.replace(/\\/g, '/')]
  }

  switch (input.kind) {
    case 'powershell':
      return { shell: psPath, args: psIntegrationArgs() ?? ['-NoLogo'], cwd, env }
    case 'pwsh':
      return { shell: pwsh ?? psPath, args: psIntegrationArgs() ?? ['-NoLogo'], cwd, env }
    case 'cmd':
      return { shell: cmdPath, args: [], cwd, env }
    case 'wsl':
      return { shell: wsl, args: input.args ?? [], cwd, env }
    case 'gitbash':
      return {
        shell: gitBash ?? psPath,
        args: gitBash ? bashIntegrationArgs() ?? ['--login', '-i'] : ['-NoLogo'],
        cwd,
        env
      }
    case 'ssh': {
      const ssh = sshPath()
      if (!ssh) return host()
      return { shell: ssh, args: input.args ?? [], cwd, env }
    }
    case 'claude':
    case 'codex':
    case 'opencode':
    case 'ollama':
      return host()
    default:
      return { shell: psPath, args: ['-NoLogo'], cwd, env }
  }
}

/** The set of shell kinds whose startup command must be typed into an
 *  interactive host shell rather than passed as a spawn argument. */
export const AGENT_KINDS = ['claude', 'codex', 'opencode', 'ollama', 'ssh'] as const

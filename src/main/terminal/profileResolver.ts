import {
  commandWithPermissions,
  defaultFullPermissionArgs,
  mergeProfiles,
  providerFromProfileId
} from '../../shared/profiles'
import type { AppSettings, CreateTerminalInput, ShellInfo, TerminalProfile } from '../../shared/types'

export const DEFAULT_SHELL_PRIORITY: ShellInfo['id'][] = ['pwsh', 'powershell', 'cmd', 'gitbash', 'wsl', 'bash', 'sh']

/**
 * Resolve a requested profile id to a real one. When the id names an available
 * shell or a user-defined custom profile it is kept; anything else falls back
 * to the first shell actually present on this machine.
 */
export function resolveProfileId(profileId: string, settings: AppSettings, shells: ShellInfo[]): string {
  const customIds = new Set(effectiveProfiles(settings).map((p) => p.id))
  if (shells.some((s) => s.id === profileId) || customIds.has(profileId) || providerFromProfileId(settings, profileId)) return profileId
  for (const id of DEFAULT_SHELL_PRIORITY) {
    if (shells.some((s) => s.id === id)) return id
  }
  return shells[0]?.id ?? 'custom'
}

/** Yerleşik + kullanıcı profilleri (aynı id'de kullanıcınınki kazanır). */
export function effectiveProfiles(settings: AppSettings): TerminalProfile[] {
  return mergeProfiles(settings.profiles)
}

/**
 * `command`'ı boş olan profiller (CLI ajanları) için platformun varsayılan
 * kabuğu. Windows'ta cmd.exe seçilir: `claude.cmd` / `codex.cmd` gibi shim'ler
 * PowerShell yerine cmd.exe altında doğru çalışıyor.
 */
function defaultShellInput(): Pick<CreateTerminalInput, 'kind' | 'shell'> {
  if (process.platform === 'win32') return { kind: 'cmd' }
  return { kind: 'custom', shell: process.env.SHELL || '/bin/bash' }
}

/** Home directory, cross-platform (Windows fallbacks included). */
export function homeDirectory(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd()
}

export interface ProfileResolveOptions {
  cols: number
  rows: number
  cwd?: string
}

/**
 * Turn a profile id into the concrete CreateTerminalInput the PTY engine
 * spawns. Shell ids map to the discovered shell; custom profiles spawn their
 * configured command directly. The startup directory comes from the profile
 * itself, falling back to home ('last' startup directory persistence lands in
 * a later phase).
 */
export function profileToInput(
  profileId: string,
  settings: AppSettings,
  shells: ShellInfo[],
  opts: ProfileResolveOptions
): CreateTerminalInput {
  const shell = shells.find((s) => s.id === profileId)
  const profile = effectiveProfiles(settings).find((p) => p.id === profileId)
  const provider = providerFromProfileId(settings, profileId)

  // Startup directory (PRD §34, §38): profil cwd'si > settings.startupDirectory
  // ('custom' dizini, 'last' = son kullanılan dizin, yoksa home).
  const startupCwd =
    settings.startupDirectory === 'custom' && settings.customStartupDirectory.trim()
      ? settings.customStartupDirectory.trim()
      : settings.startupDirectory === 'last'
        ? settings.lastCwd ?? homeDirectory()
        : homeDirectory()
  const cwd = opts.cwd ?? profile?.cwd ?? startupCwd
  const base = { cols: opts.cols, rows: opts.rows, cwd }

  if (provider) {
    const env: Record<string, string> = {}
    if (provider.modelEnv && provider.model) env[provider.modelEnv] = provider.model
    if (provider.baseUrlEnv && provider.baseUrl) env[provider.baseUrlEnv] = provider.baseUrl
    return {
      ...base,
      ...defaultShellInput(),
      env,
      startupCommand: commandWithPermissions(provider.command, provider.fullPermissions, provider.fullPermissionArgs)
    }
  }

  if (profile) {
    const startupCommand = commandWithPermissions(
      profile.startupCommand,
      profile.fullPermissions,
      profile.fullPermissionArgs
    )
    // command boşsa profil, platformun varsayılan kabuğunda açılır ve
    // startupCommand ile başlatılır (CLI ajan profilleri).
    if (!profile.command.trim()) {
      return { ...base, ...defaultShellInput(), args: profile.args, env: profile.env, startupCommand }
    }
    return {
      ...base,
      kind: 'custom' as const,
      shell: profile.command,
      args: [
        ...(profile.args ?? []),
        ...(profile.fullPermissions === false
          ? []
          : (profile.fullPermissionArgs?.trim() || defaultFullPermissionArgs(profile.command)).split(/\s+/).filter(Boolean))
      ],
      env: profile.env,
      startupCommand
    }
  }

  if (shell) {
    return {
      ...base,
      kind: shell.kind,
      shell: shell.command,
      args: shell.args
    }
  }

  // Unreachable in practice (resolveProfileId runs first): keep a safe default.
  if (shells.length > 0) {
    const first = shells[0]
    return { ...base, kind: first.kind, shell: first.command, args: first.args }
  }
  const fallback = process.platform === 'win32' ? 'C:\\Windows\\System32\\cmd.exe' : '/bin/sh'
  return { ...base, kind: 'custom', shell: fallback }
}

/** Custom profiles start empty — users add their own in Settings. */
export function defaultProfiles(): AppSettings['profiles'] {
  return []
}

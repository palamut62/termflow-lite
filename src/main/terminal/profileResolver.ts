import type { AppSettings, CreateTerminalInput, ShellInfo } from '../../shared/types'

export const DEFAULT_SHELL_PRIORITY: ShellInfo['id'][] = ['pwsh', 'powershell', 'cmd', 'gitbash', 'wsl', 'bash', 'sh']

/**
 * Resolve a requested profile id to a real one. When the id names an available
 * shell or a user-defined custom profile it is kept; anything else falls back
 * to the first shell actually present on this machine.
 */
export function resolveProfileId(profileId: string, settings: AppSettings, shells: ShellInfo[]): string {
  const customIds = new Set(settings.profiles.map((p) => p.id))
  if (shells.some((s) => s.id === profileId) || customIds.has(profileId)) return profileId
  for (const id of DEFAULT_SHELL_PRIORITY) {
    if (shells.some((s) => s.id === id)) return id
  }
  return shells[0]?.id ?? 'custom'
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
  const profile = settings.profiles.find((p) => p.id === profileId)

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

  if (profile) {
    return {
      ...base,
      kind: 'custom' as const,
      shell: profile.command,
      args: profile.args,
      env: profile.env
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

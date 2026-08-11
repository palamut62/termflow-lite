import { existsSync } from 'fs'
import { join } from 'path'
import {
  commandWithPermissions,
  commandWithModel,
  defaultFullPermissionArgs,
  mergeProfiles,
  providerFromProfileId,
  sshFromProfileId
} from '../../shared/profiles'
import { buildSshArgs } from '../../shared/sshArgs'
import type { AgentSessionRef, AppSettings, CreateTerminalInput, ShellInfo, TerminalProfile } from '../../shared/types'

export const DEFAULT_SHELL_PRIORITY: ShellInfo['id'][] = ['pwsh', 'powershell', 'cmd', 'gitbash', 'wsl', 'bash', 'sh']

/**
 * Resolve a requested profile id to a real one. When the id names an available
 * shell or a user-defined custom profile it is kept; anything else falls back
 * to the first shell actually present on this machine.
 */
export function resolveProfileId(profileId: string, settings: AppSettings, shells: ShellInfo[]): string {
  const customIds = new Set(effectiveProfiles(settings).map((p) => p.id))
  if (
    shells.some((s) => s.id === profileId)
    || customIds.has(profileId)
    || providerFromProfileId(settings, profileId)
    || sshFromProfileId(settings, profileId)
  ) return profileId
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

/**
 * Sistemdeki OpenSSH istemcisi. Windows'ta önce inbox OpenSSH yolu denenir,
 * bulunamazsa PATH'teki `ssh`. (Kendi SSH istemcimiz yok — host key doğrulaması,
 * known_hosts ve ~/.ssh/config bilinçli olarak OpenSSH'a bırakılır.)
 */
export function sshBinary(): string {
  if (process.platform !== 'win32') return 'ssh'
  const winDir = process.env.SystemRoot || 'C:\\Windows'
  const inbox = join(winDir, 'System32', 'OpenSSH', 'ssh.exe')
  return existsSync(inbox) ? inbox : 'ssh'
}

/** Home directory, cross-platform (Windows fallbacks included). */
export function homeDirectory(): string {
  return process.env.HOME || process.env.USERPROFILE || process.cwd()
}

export interface ProfileResolveOptions {
  cols: number
  rows: number
  cwd?: string
  resumeSession?: AgentSessionRef
}

const LIGHT_THEME_IDS = new Set(['light-plus', 'light-modern', 'solarized-light', 'quiet-light'])

function isLightBackground(color: string | undefined): boolean {
  const match = color?.match(/^#([0-9a-f]{6})$/i)
  if (!match) return false
  const value = Number.parseInt(match[1], 16)
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 160
}

export function agentAppearanceEnv(settings: AppSettings, command: string | undefined): Record<string, string> {
  const executable = command?.trim().split(/\s+/)[0]?.toLowerCase().replace(/\.cmd$|\.exe$/, '')
  if (executable !== 'codex') return {}
  const light = LIGHT_THEME_IDS.has(settings.themeId)
    || (settings.themeId === 'custom' && isLightBackground(settings.customTheme?.background))
  return light
    ? { COLORFGBG: '0;15', TERM_PROGRAM_BACKGROUND: 'light', COLORTERM: 'truecolor' }
    : { COLORFGBG: '15;0', TERM_PROGRAM_BACKGROUND: 'dark', COLORTERM: 'truecolor' }
}

export function commandWithResume(command: string | undefined, session: AgentSessionRef | undefined): string | undefined {
  const base = command?.trim()
  if (!base || !session) return base || undefined
  if (session.agent === 'claude') return `${base} --resume ${session.id}`
  if (session.agent === 'opencode') return `${base} --session ${session.id}`
  const [executable, ...rest] = base.split(/\s+/)
  return `${executable} resume ${session.id}${rest.length ? ` ${rest.join(' ')}` : ''}`
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
  const ssh = sshFromProfileId(settings, profileId)

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

  // SSH: yerel cwd önemsizdir (uzak dizin remoteCwd ile ayarlanır), ama PTY'nin
  // geçerli bir yerel dizinde açılması gerekir — base.cwd aynen kullanılır.
  if (ssh) {
    return { ...base, kind: 'custom' as const, shell: sshBinary(), args: buildSshArgs(ssh) }
  }

  if (provider) {
    const env: Record<string, string> = { ...agentAppearanceEnv(settings, provider.command) }
    if (provider.modelEnv && provider.model) env[provider.modelEnv] = provider.model
    if (provider.baseUrlEnv && provider.baseUrl) env[provider.baseUrlEnv] = provider.baseUrl
    return {
      ...base,
      ...defaultShellInput(),
      env,
      startupCommand: commandWithResume(
        commandWithPermissions(provider.command, provider.fullPermissions, provider.fullPermissionArgs),
        opts.resumeSession
      )
    }
  }

  if (profile) {
    const startupCommand = commandWithResume(commandWithPermissions(
      commandWithModel(profile.startupCommand, profile.model),
      profile.fullPermissions,
      profile.fullPermissionArgs
    ), opts.resumeSession)
    // command boşsa profil, platformun varsayılan kabuğunda açılır ve
    // startupCommand ile başlatılır (CLI ajan profilleri).
    if (!profile.command.trim()) {
      return { ...base, ...defaultShellInput(), args: profile.args, env: { ...agentAppearanceEnv(settings, profile.startupCommand), ...profile.env }, startupCommand }
    }
    return {
      ...base,
      kind: 'custom' as const,
      shell: profile.command,
      args: [
        ...(opts.resumeSession?.agent === 'codex' ? ['resume', opts.resumeSession.id] : []),
        ...(profile.args ?? []),
        ...(profile.model?.trim() ? ['--model', profile.model.trim()] : []),
        ...(profile.fullPermissions === false
          ? []
          : (profile.fullPermissionArgs?.trim() || defaultFullPermissionArgs(profile.command)).split(/\s+/).filter(Boolean)),
        ...(opts.resumeSession?.agent === 'claude' ? ['--resume', opts.resumeSession.id] : []),
        ...(opts.resumeSession?.agent === 'opencode' ? ['--session', opts.resumeSession.id] : [])
      ],
      env: { ...agentAppearanceEnv(settings, profile.command), ...profile.env },
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

import type { AppSettings, ProviderProfile, TerminalProfile } from './types'

export const providerProfileId = (id: string): string => `provider:${id}`

export function defaultFullPermissionArgs(command: string): string {
  const executable = command.trim().split(/\s+/)[0]?.toLowerCase().replace(/\.cmd$|\.exe$/, '')
  if (executable === 'claude') return '--dangerously-skip-permissions'
  if (executable === 'codex') return '--dangerously-bypass-approvals-and-sandbox'
  if (executable === 'opencode') return '--auto'
  return ''
}

export function commandWithPermissions(
  command: string | undefined,
  fullPermissions: boolean | undefined,
  configuredArgs: string | undefined
): string | undefined {
  const base = command?.trim()
  if (!base) return undefined
  if (fullPermissions === false) return base
  const args = configuredArgs?.trim() || defaultFullPermissionArgs(base)
  return args ? `${base} ${args}` : base
}

export function providerFromProfileId(settings: AppSettings, profileId: string): ProviderProfile | undefined {
  if (!profileId.startsWith('provider:')) return undefined
  return settings.providerProfiles.find((provider) => provider.id === profileId.slice('provider:'.length))
}

/**
 * Yerleşik CLI ajan profilleri (TermFlow paritesi). Bunlar KABUK DEĞİL: her biri
 * platformun varsayılan kabuğunda açılıp `startupCommand` ile başlatılır — bu
 * yüzden `command` bilinçli olarak boştur (profileResolver platforma göre çözer).
 *
 * Windows'ta bu profiller PowerShell yerine cmd.exe altında açılır: `claude.cmd`
 * / `codex.cmd` gibi npm shim'leri PowerShell altında argüman/çıkış kodu
 * aktarımını bozabiliyor, cmd.exe altında doğru çalışıyor.
 *
 * Kullanıcı ayarlarında (settings.profiles) aynı id tanımlanırsa kullanıcının
 * profili kazanır (mergeProfiles).
 */
export const BUILTIN_PROFILES: readonly TerminalProfile[] = [
  { id: 'claude', name: 'Claude Code', command: '', startupCommand: 'claude', color: '#d97757', fullPermissions: true, fullPermissionArgs: '--dangerously-skip-permissions' },
  { id: 'codex', name: 'Codex', command: '', startupCommand: 'codex', color: '#10a37f', fullPermissions: true, fullPermissionArgs: '--dangerously-bypass-approvals-and-sandbox' },
  { id: 'opencode', name: 'OpenCode', command: '', startupCommand: 'opencode', color: '#3fb950', fullPermissions: true, fullPermissionArgs: '--auto' },
  { id: 'ollama-serve', name: 'Ollama Serve', command: '', startupCommand: 'ollama serve', color: '#b48ead', fullPermissions: true, fullPermissionArgs: '' }
]

/**
 * Yerleşik profiller + kullanıcı profilleri. Aynı id'de kullanıcının tanımı
 * yerleşiği ezer; yalnızca kullanıcıya ait olanlar sona eklenir. Yerleşikler
 * settings'e persist EDİLMEZ, bu yüzden eski kurulumlarda da görünürler.
 */
export function mergeProfiles(userProfiles: readonly TerminalProfile[]): TerminalProfile[] {
  const byId = new Map(userProfiles.map((p) => [p.id, p]))
  const merged = BUILTIN_PROFILES.map((b) => byId.get(b.id) ?? b)
  const builtinIds = new Set(BUILTIN_PROFILES.map((b) => b.id))
  return [...merged, ...userProfiles.filter((p) => !builtinIds.has(p.id))]
}

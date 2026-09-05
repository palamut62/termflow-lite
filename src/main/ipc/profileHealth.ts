import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import { agentForProfile, mergeProfiles, providerFromProfileId } from '../../shared/profiles'
import { splitCommandLine } from '../../shared/commandLine'
import { permissionArgs } from '../../shared/agentEvents'
import type { SettingsStore } from '../storage/SettingsStore'
import type { ProviderSecretStore } from '../storage/ProviderSecretStore'
import { cliInvocation, runCli } from '../terminal/cli'
import { redactApiKeys } from '../../shared/secretRedaction'

export interface HealthCheck { label: string; ok: boolean; detail: string }
export function registerProfileHealth(store: SettingsStore, secrets: ProviderSecretStore): void {
  ipcMain.handle(IPC.PROFILE_HEALTH, async (_event, id: unknown, connection: unknown): Promise<HealthCheck[]> => {
    if (typeof id !== 'string') throw new Error('Select a profile.')
    const settings = store.get()
    const provider = providerFromProfileId(settings, id)
    const profile = mergeProfiles(settings.profiles).find(p => p.id === id)
    if (!provider && !profile) throw new Error('Profile not found.')
    const checks: HealthCheck[] = []
    try {
      const [command] = splitCommandLine(provider?.command || profile?.startupCommand || profile?.command || '')
      const cli = cliInvocation(command)
      checks.push({ label: 'CLI', ok: true, detail: cli.file })
      const version = await runCli(command, ['--version'])
      checks.push({ label: 'Version', ok: true, detail: redactApiKeys(version.trim()).slice(0, 120) })
      const agent = agentForProfile(settings, id)
      if (agent) {
        const mode = settings.defaultAgentPermissionMode
        const help = await runCli(command, ['--help'])
        const supported = !(agent === 'opencode' && mode !== 'full') && permissionArgs(agent, mode).filter(arg => arg.startsWith('--')).every(arg => help.includes(arg))
        checks.push({ label: 'Permission mode', ok: supported, detail: `${mode}: ${supported ? 'supported by installed CLI' : 'unsupported; select another mode or CLI'}` })
      }
    } catch (error) { checks.push({ label: 'CLI', ok: false, detail: redactApiKeys((error as Error).message).slice(0, 240) }) }
    if (provider) {
      const status = secrets.status(provider.id)
      const fromEnv = !!(provider.apiKeyEnv && process.env[provider.apiKeyEnv])
      checks.push({ label: 'Credential', ok: status === 'ready' || fromEnv || !provider.apiKeyEnv,
        detail: status === 'ready' ? 'Encrypted key is readable' : fromEnv ? 'Available in environment' : !provider.apiKeyEnv ? 'No key variable configured' : status })
      checks.push({ label: 'Model', ok: !!provider.model, detail: provider.model || 'CLI default' })
      if (connection === true) {
        try {
          if (!provider.baseUrl) throw new Error('Configure a base URL first.')
          const url = new URL(provider.baseUrl.replace(/\/$/, '') + '/models')
          if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) base URL without embedded credentials.')
          const key = secrets.get(provider.id) || (provider.apiKeyEnv ? process.env[provider.apiKeyEnv] : undefined)
          const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {}, redirect: 'error', signal: AbortSignal.timeout(5000) })
          checks.push({ label: 'Connection / models', ok: response.ok, detail: `HTTP ${response.status}${response.status === 404 ? ': provider may not support /models' : ''}` })
          await response.body?.cancel()
        } catch { checks.push({ label: 'Connection / models', ok: false, detail: 'Connection failed or timed out. Check endpoint and credentials.' }) }
      }
    }
    return checks
  })
}

import type { PluginPermission, ShellKind, TermFlowPluginManifest } from './types'

const ID_RE = /^[a-z0-9][a-z0-9._-]+$/
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const ALLOWED_SHELLS = new Set<ShellKind>(['cmd', 'powershell', 'pwsh', 'gitbash', 'wsl', 'custom', 'claude', 'codex', 'opencode', 'ollama', 'ssh'])
const ALLOWED_PERMISSIONS = new Set<PluginPermission>(['terminal:execute', 'workspace:read', 'workspace:write', 'network:access'])
const ALLOWED_ACTIVATION = /^(?:\*|onStartupFinished|workspaceContains:[^\s]+|platform:(?:win32|linux|darwin))$/

function requireText(value: unknown, field: string, max = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${field} is invalid`)
  return value.trim()
}

export function validatePluginManifest(value: unknown): TermFlowPluginManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid TermFlow plugin manifest')
  const item = value as Partial<TermFlowPluginManifest>
  if (item.schemaVersion !== 1 && item.schemaVersion !== 2) throw new Error('Unsupported plugin schema version')
  const id = requireText(item.id, 'Plugin ID', 100).toLowerCase()
  if (!ID_RE.test(id)) throw new Error('Plugin ID is invalid')
  const name = requireText(item.name, 'Plugin name')
  const version = requireText(item.version, 'Plugin version', 50)
  if (!SEMVER_RE.test(version)) throw new Error('Plugin version must use semantic versioning')
  if (!Array.isArray(item.commands) || item.commands.length === 0 || item.commands.length > 100) throw new Error('Plugin must define 1-100 commands')

  const commandIds = new Set<string>()
  const commands = item.commands.map((command) => {
    const commandId = requireText(command?.id, 'Command ID', 100)
    if (!ID_RE.test(commandId) || commandIds.has(commandId)) throw new Error(`Command ID is invalid or duplicated: ${commandId}`)
    commandIds.add(commandId)
    const shell = command.shell
    if (shell && !ALLOWED_SHELLS.has(shell)) throw new Error(`Unsupported shell: ${shell}`)
    return {
      id: commandId,
      title: requireText(command.title, 'Command title'),
      command: requireText(command.command, 'Command', 4000),
      ...(shell ? { shell } : {}),
      ...(command.cwd ? { cwd: requireText(command.cwd, 'Command cwd', 500) } : {}),
      ...(command.description ? { description: requireText(command.description, 'Command description', 500) } : {}),
      ...(command.category ? { category: requireText(command.category, 'Command category', 80) } : {})
    }
  })

  const activationEvents = item.activationEvents ?? []
  if (!Array.isArray(activationEvents) || activationEvents.some((event) => typeof event !== 'string' || !ALLOWED_ACTIVATION.test(event))) throw new Error('Plugin activation event is invalid')
  const permissions = item.permissions ?? (commands.length ? ['terminal:execute'] : [])
  if (!Array.isArray(permissions) || permissions.some((permission) => !ALLOWED_PERMISSIONS.has(permission))) throw new Error('Plugin permission is invalid')

  return {
    schemaVersion: item.schemaVersion,
    id,
    name,
    version,
    commands,
    ...(item.description ? { description: requireText(item.description, 'Plugin description', 1000) } : {}),
    ...(item.publisher ? { publisher: requireText(item.publisher, 'Plugin publisher', 100) } : {}),
    ...(item.engines?.termflow ? { engines: { termflow: requireText(item.engines.termflow, 'TermFlow engine range', 50) } } : {}),
    ...(activationEvents.length ? { activationEvents } : {}),
    permissions: [...new Set(permissions)],
    ...(item.builtin ? { builtin: true } : {})
  }
}

export function pluginMatchesWorkspace(plugin: TermFlowPluginManifest, workspaceFiles: Set<string>, platform = 'win32'): boolean {
  const events = plugin.activationEvents ?? []
  if (events.length === 0 || events.includes('*') || events.includes('onStartupFinished')) return true
  return events.some((event) => {
    if (event === `platform:${platform}`) return true
    if (!event.startsWith('workspaceContains:')) return false
    const pattern = event.slice('workspaceContains:'.length)
    if (!pattern.includes('*')) return workspaceFiles.has(pattern.toLowerCase())
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    return [...workspaceFiles].some((file) => new RegExp(`^${escaped}$`, 'i').test(file))
  })
}

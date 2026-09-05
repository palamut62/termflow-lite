import { DEFAULT_SETTINGS, type AppSettings } from '../../../shared/types'
import { redactApiKeys } from '../../../shared/secretRedaction'
import { normalizeStoredCommands, type SavedCommand } from '../store/savedCommandStore'
import type { Workspace } from '../store/workspaceStore'
import { isValidPaneTree } from '../paneUtils'

export interface BackupData { format: 'termflow-backup'; version: 1; settings: AppSettings; commands: SavedCommand[]; workspaces: Workspace[] }
function object(value: unknown): value is Record<string, any> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function scrub(value: unknown): any {
  if (typeof value === 'string') return redactApiKeys(value).replace(/((?:api[_-]?key|token|password|passwd|secret)\s*[=:]\s*)([^\s"']+|"[^"]*"|'[^']*')/gi, '$1[REDACTED]').replace(/(--(?:api-key|token|password|secret)\s+)("[^"]*"|'[^']*'|\S+)/gi, '$1[REDACTED]')
  if (Array.isArray(value)) return value.map(scrub)
  if (object(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !['env', '__proto__', 'constructor', 'prototype', 'activeTabId', 'results'].includes(key)).map(([key, val]) => [key, scrub(val)]))
  return value
}

export function parseBackup(text: string): BackupData {
  if (text.length > 2_000_000) throw new Error('Backup exceeds 2 MB.')
  const data = JSON.parse(text)
  if (!object(data) || data.format !== 'termflow-backup' || data.version !== 1 || !object(data.settings) || !Array.isArray(data.commands) || !Array.isArray(data.workspaces)) throw new Error('Not a supported TermFlow backup.')
  const settings = structuredClone(DEFAULT_SETTINGS)
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
    const value = data.settings[key]
    if (value === undefined) continue
    const expected = DEFAULT_SETTINGS[key]
    if (expected !== null && typeof expected !== 'object') {
      if (typeof value !== typeof expected || (typeof value === 'number' && !Number.isFinite(value))) throw new Error(`Invalid setting: ${key}`)
      ;(settings as any)[key] = value
    }
  }
  if (!['safe', 'workspace', 'full'].includes(settings.defaultAgentPermissionMode) || !['home', 'last', 'custom'].includes(settings.startupDirectory)) throw new Error('Invalid startup or security setting.')
  settings.fontSize = Math.max(8, Math.min(32, settings.fontSize))
  settings.scrollback = Math.max(100, Math.min(100000, settings.scrollback))
  for (const key of ['profiles', 'providerProfiles', 'sshConnections'] as const) {
    const rows = data.settings[key]
    if (!Array.isArray(rows) || rows.length > 100 || rows.some(p => !object(p) || typeof p.id !== 'string' || typeof p.name !== 'string' || typeof (key === 'sshConnections' ? p.host : p.command) !== 'string')) throw new Error(`Invalid ${key}`)
    if (rows.some(p => p.args !== undefined && (!Array.isArray(p.args) || p.args.some((arg: unknown) => typeof arg !== 'string')))) throw new Error('Invalid profile arguments.')
    const strings = ['cwd', 'icon', 'startupCommand', 'model', 'color', 'fullPermissionArgs', 'baseUrl', 'apiKeyEnv', 'modelEnv', 'baseUrlEnv', 'user', 'identityFile', 'jumpHost', 'remoteCommand', 'remoteCwd', 'extraArgs']
    if (rows.some(p => strings.some(field => p[field] !== undefined && typeof p[field] !== 'string') || ['fullPermissions', 'forwardAgent'].some(field => p[field] !== undefined && typeof p[field] !== 'boolean') || (p.models !== undefined && (!Array.isArray(p.models) || p.models.some((m: unknown) => typeof m !== 'string'))) || (p.port !== undefined && (!Number.isInteger(p.port) || p.port < 1 || p.port > 65535)))) throw new Error('Invalid profile options.')
    ;(settings as any)[key] = rows.map(p => Object.fromEntries(Object.entries(p).filter(([field]) => ['id', 'name', 'command', 'host', 'args', 'models', 'port', 'fullPermissions', 'forwardAgent', ...strings].includes(field))))
  }
  if (object(data.settings.shortcuts) && Object.values(data.settings.shortcuts).every(v => typeof v === 'string')) settings.shortcuts = { ...settings.shortcuts, ...data.settings.shortcuts }
  if (object(data.settings.customTheme) && Object.values(data.settings.customTheme).every(v => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v))) settings.customTheme = data.settings.customTheme as any
  if (data.commands.length > 500 || data.workspaces.length > 50) throw new Error('Too many tasks or workspaces.')
  const commands = normalizeStoredCommands(data.commands, Date.now()).commands.map(c => ({ ...c, enabled: false, activeTabId: undefined }))
  const workspaces = data.workspaces.map((w: unknown): Workspace => {
    if (!object(w) || typeof w.id !== 'string' || typeof w.name !== 'string' || !object(w.session) || !Array.isArray(w.session.tabs) || !w.session.tabs.length || w.session.tabs.length > 40 || !Array.isArray(w.commands)) throw new Error('Invalid workspace.')
    if (w.session.tabs.some((t: any) => !object(t) || typeof t.id !== 'string' || typeof t.profileId !== 'string' || typeof t.title !== 'string')) throw new Error('Invalid workspace tab.')
    const ids = new Set<string>(w.session.tabs.map((t: any) => t.id))
    if (w.session.tabs.some((t: any) => (t.cwd !== undefined && typeof t.cwd !== 'string') || (t.model !== undefined && typeof t.model !== 'string') || (t.permissionMode !== undefined && !['safe', 'workspace', 'full'].includes(t.permissionMode)))) throw new Error('Invalid workspace tab options.')
    if (w.session.paneTree && (JSON.stringify(w.session.paneTree).length > 20000 || !isValidPaneTree(w.session.paneTree, ids))) throw new Error('Invalid workspace layout.')
    return { id: w.id, name: w.name, savedAt: typeof w.savedAt === 'number' ? w.savedAt : Date.now(), session: { ...w.session, version: 1, activeTabId: w.session.tabs[0].id, splitRatio: 0.5 }, commands: normalizeStoredCommands(w.commands, Date.now()).commands.map(c => ({ ...c, enabled: false })) } as Workspace
  })
  return { format: 'termflow-backup', version: 1, settings, commands, workspaces }
}

export function exportBackup(settings: AppSettings, commands: SavedCommand[], workspaces: Workspace[]): string {
  return JSON.stringify(scrub({ format: 'termflow-backup', version: 1, settings, commands, workspaces }), null, 2)
}

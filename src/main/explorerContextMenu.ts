import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { mergeProfiles, providerProfileId } from '../shared/profiles'
import type { AppSettings, ShellInfo } from '../shared/types'

const execFileAsync = promisify(execFile)
const PARENT_KEYS = [
  'HKCU\\Software\\Classes\\Directory\\Background\\shell\\TermFlowLite',
  'HKCU\\Software\\Classes\\Directory\\shell\\TermFlowLite',
  'HKCU\\Software\\Classes\\Drive\\Background\\shell\\TermFlowLite'
]
const COMMAND_STORE = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\CommandStore\\shell'

export interface ExplorerMenuEntry {
  key: string
  label: string
  profileId?: string
  icon?: string
}

export function buildExplorerMenuEntries(settings: AppSettings, shells: ShellInfo[]): ExplorerMenuEntry[] {
  const entries: ExplorerMenuEntry[] = [{ key: '000-default', label: 'Default Profile' }]
  shells.forEach((item, index) => entries.push({ key: `1${String(index).padStart(2, '0')}-shell`, label: item.name, profileId: item.id, icon: item.command }))
  mergeProfiles(settings.profiles).forEach((item, index) => entries.push({
    key: `2${String(index).padStart(2, '0')}-profile`, label: item.name, profileId: item.id,
    icon: item.id === 'ollama-serve' ? 'ollama' : ['claude', 'codex', 'opencode'].includes(item.id) ? item.id : undefined
  }))
  settings.providerProfiles.forEach((item, index) => entries.push({ key: `3${String(index).padStart(2, '0')}-provider`, label: item.name, profileId: providerProfileId(item.id), icon: item.id.includes('deepseek') ? 'deepseek' : item.id.includes('openrouter') ? 'openrouter' : item.id.includes('ollama') ? 'ollama' : undefined }))
  return entries.filter((entry, index, all) => all.findIndex((item) => item.profileId === entry.profileId) === index)
}

export function parseRegistryChildNames(stdout: string): string[] {
  return stdout.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^HKEY_[^\\]+\\/i.test(line))
    .map((line) => line.slice(line.lastIndexOf('\\') + 1))
    .filter((name) => name.toLowerCase() !== 'shell')
}

async function reg(args: string[]): Promise<void> {
  await execFileAsync('reg.exe', args, { windowsHide: true })
}

async function setValue(key: string, name: string | null, value: string): Promise<void> {
  await reg(['add', key, ...(name ? ['/v', name] : ['/ve']), '/t', 'REG_SZ', '/d', value, '/f'])
}

async function removeStaleEntries(parent: string, expectedKeys: Set<string>): Promise<void> {
  const shellKey = `${parent}\\shell`
  const existing = await execFileAsync('reg.exe', ['query', shellKey], { windowsHide: true })
    .then(({ stdout }) => parseRegistryChildNames(stdout))
    .catch(() => [])
  for (const name of existing) {
    if (name && !expectedKeys.has(name.toLowerCase())) {
      await reg(['delete', `${shellKey}\\${name}`, '/f']).catch(() => undefined)
    }
  }
}

export async function syncExplorerContextMenu(exePath: string, resourcesPath: string, settings: AppSettings, shells: ShellInfo[]): Promise<void> {
  if (process.platform !== 'win32') return
  const entries = buildExplorerMenuEntries(settings, shells)
  const existing = await execFileAsync('reg.exe', ['query', COMMAND_STORE], { windowsHide: true })
    .then(({ stdout }) => stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => /\\TermFlowLite\.[^\\]+$/i.test(line)))
    .catch(() => [])
  for (const key of existing) await reg(['delete', key, '/f']).catch(() => undefined)

  for (const parent of PARENT_KEYS) {
    await setValue(parent, 'MUIVerb', 'Open in TermFlow Lite')
    await setValue(parent, 'Icon', `${exePath},0`)
    await setValue(parent, 'SubCommands', '')
    for (const entry of entries) {
      const key = `${parent}\\shell\\${entry.key}`
      await setValue(key, 'MUIVerb', entry.label)
      const bundledIcon = entry.icon && !entry.icon.includes('\\') && !entry.icon.includes('/')
        ? join(resourcesPath, 'resources', 'menu-icons', `${entry.icon}.ico`)
        : entry.icon
      await setValue(key, 'Icon', bundledIcon || `${exePath},0`)
      const launchProfileId = entry.profileId?.startsWith('provider:')
        ? `provider--${entry.profileId.slice('provider:'.length)}`
        : entry.profileId
      const profileArg = launchProfileId ? ` --profile "${launchProfileId}"` : ''
      await setValue(`${key}\\command`, null, `"${exePath}"${profileArg} "%V"`)
    }
    await removeStaleEntries(parent, new Set(entries.map((entry) => entry.key.toLowerCase())))
  }
}

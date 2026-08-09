import { execFile } from 'child_process'
import { promisify } from 'util'
import { mergeProfiles, providerProfileId } from '../shared/profiles'
import type { AppSettings, ShellInfo } from '../shared/types'

const execFileAsync = promisify(execFile)
const MENU_ROOT = 'HKCU\\Software\\Classes\\TermFlowLite.ContextMenu'
const PARENT_KEYS = [
  'HKCU\\Software\\Classes\\Directory\\Background\\shell\\TermFlowLite',
  'HKCU\\Software\\Classes\\Directory\\shell\\TermFlowLite',
  'HKCU\\Software\\Classes\\Drive\\Background\\shell\\TermFlowLite'
]
const EXTENDED_KEY = 'Software\\Classes\\TermFlowLite.ContextMenu'

export interface ExplorerMenuEntry {
  key: string
  label: string
  profileId?: string
}

export function buildExplorerMenuEntries(settings: AppSettings, shells: ShellInfo[]): ExplorerMenuEntry[] {
  const entries: ExplorerMenuEntry[] = [{ key: '000-default', label: 'Default Profile' }]
  shells.forEach((item, index) => entries.push({ key: `1${String(index).padStart(2, '0')}-shell`, label: item.name, profileId: item.id }))
  mergeProfiles(settings.profiles).forEach((item, index) => entries.push({ key: `2${String(index).padStart(2, '0')}-profile`, label: item.name, profileId: item.id }))
  settings.providerProfiles.forEach((item, index) => entries.push({ key: `3${String(index).padStart(2, '0')}-provider`, label: item.name, profileId: providerProfileId(item.id) }))
  return entries.filter((entry, index, all) => all.findIndex((item) => item.profileId === entry.profileId) === index)
}

async function reg(args: string[]): Promise<void> {
  await execFileAsync('reg.exe', args, { windowsHide: true })
}

async function setValue(key: string, name: string | null, value: string): Promise<void> {
  await reg(['add', key, ...(name ? ['/v', name] : ['/ve']), '/t', 'REG_SZ', '/d', value, '/f'])
}

export async function syncExplorerContextMenu(exePath: string, settings: AppSettings, shells: ShellInfo[]): Promise<void> {
  if (process.platform !== 'win32') return
  await reg(['delete', MENU_ROOT, '/f']).catch(() => undefined)
  for (const parent of PARENT_KEYS) {
    await reg(['delete', parent, '/f']).catch(() => undefined)
    await setValue(parent, 'MUIVerb', 'Open in TermFlow Lite')
    await setValue(parent, 'Icon', `${exePath},0`)
    await setValue(parent, 'ExtendedSubCommandsKey', EXTENDED_KEY)
  }
  for (const entry of buildExplorerMenuEntries(settings, shells)) {
    const key = `${MENU_ROOT}\\shell\\${entry.key}`
    await setValue(key, 'MUIVerb', entry.label)
    await setValue(key, 'Icon', `${exePath},0`)
    const profileArg = entry.profileId ? ` --profile "${entry.profileId}"` : ''
    await setValue(`${key}\\command`, null, `"${exePath}"${profileArg} "%V"`)
  }
}

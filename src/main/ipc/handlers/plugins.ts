import { app, BrowserWindow, dialog, ipcMain, net } from 'electron'
import { createHash } from 'crypto'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'fs/promises'
import { isAbsolute, join, resolve } from 'path'
import { IPC, type TermFlowPluginManifest } from '../../../shared/types'
import { validatePluginManifest } from '../../../shared/pluginValidation'
import { PluginRuntime } from '../../plugins/PluginRuntime'
import { MAX_JSON_FILE_BYTES } from '../constants'

/**
 * Plugin install/enable/reload IPC. Any id that ends up in a filename is
 * checked against PLUGIN_ID_RE first — `..`, separators and absolute paths must
 * never reach `join(pluginsDir, ...)`.
 */

export const PLUGIN_ID_RE = /^[a-z0-9][a-z0-9._-]+$/

export function isValidPluginId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= 100 && !id.includes('..') && PLUGIN_ID_RE.test(id)
}

// Ships-with-the-app example plugins — same pattern as builtin flow
// templates: listed alongside user plugins, not stored on disk, not deletable.
export const BUILTIN_PLUGINS: TermFlowPluginManifest[] = [
  {
    schemaVersion: 1, id: 'termflow.git-essentials', name: 'Git Essentials', version: '1.0.0', builtin: true,
    description: 'Everyday git commands, each in its own terminal.',
    commands: [
      { id: 'status', title: 'Git status', command: 'git status', shell: 'cmd' },
      { id: 'pull', title: 'Git pull', command: 'git pull', shell: 'cmd' },
      { id: 'log', title: 'Commit graph (last 30)', command: 'git log --oneline --graph --decorate -30', shell: 'cmd' },
      { id: 'branches', title: 'List branches', command: 'git branch -a -vv', shell: 'cmd' },
      { id: 'diff', title: 'Working tree diff', command: 'git diff --stat', shell: 'cmd' }
    ]
  },
  {
    schemaVersion: 1, id: 'termflow.node-dev', name: 'Node.js Dev', version: '1.0.0', builtin: true,
    description: 'npm workflow for the current workspace.',
    commands: [
      { id: 'install', title: 'Install dependencies', command: 'npm install', shell: 'cmd' },
      { id: 'dev', title: 'Start dev server', command: 'npm run dev', shell: 'cmd' },
      { id: 'test', title: 'Run tests', command: 'npm test', shell: 'cmd' },
      { id: 'build', title: 'Build', command: 'npm run build', shell: 'cmd' },
      { id: 'outdated', title: 'Outdated packages', command: 'npm outdated', shell: 'cmd' }
    ]
  },
  {
    schemaVersion: 1, id: 'termflow.docker', name: 'Docker Tools', version: '1.0.0', builtin: true,
    description: 'Compose lifecycle and container inspection.',
    commands: [
      { id: 'up', title: 'Compose up', command: 'docker compose up', shell: 'cmd' },
      { id: 'down', title: 'Compose down', command: 'docker compose down', shell: 'cmd' },
      { id: 'ps', title: 'Running containers', command: 'docker ps', shell: 'cmd' },
      { id: 'logs', title: 'Compose logs (follow)', command: 'docker compose logs -f --tail 100', shell: 'cmd' },
      { id: 'prune', title: 'Prune unused data', command: 'docker system prune', shell: 'cmd' }
    ]
  },
  {
    schemaVersion: 1, id: 'termflow.win-system', name: 'Windows System', version: '1.0.0', builtin: true,
    description: 'Quick system inspection on Windows.',
    commands: [
      { id: 'ip', title: 'Network config', command: 'ipconfig /all', shell: 'cmd' },
      { id: 'ports', title: 'Listening ports', command: 'netstat -ano | findstr LISTENING', shell: 'cmd' },
      { id: 'top', title: 'Top processes (CPU)', command: 'powershell -NoLogo -Command "Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 Name,Id,CPU,WorkingSet"', shell: 'cmd' },
      { id: 'disk', title: 'Disk usage', command: 'powershell -NoLogo -Command "Get-PSDrive -PSProvider FileSystem"', shell: 'cmd' }
    ]
  }
]

export interface PluginHandlers {
  pluginsDir: string
  list(): Promise<TermFlowPluginManifest[]>
  install(): Promise<TermFlowPluginManifest | null>
  save(manifest: unknown): Promise<TermFlowPluginManifest>
  remove(id: unknown): Promise<void>
  setEnabled(id: unknown, enabled: unknown): Promise<void>
  reload(id: unknown): Promise<void>
  registryList(): Promise<unknown>
  registryInstall(entry: unknown): Promise<TermFlowPluginManifest>
  installBundle(raw: string, expectedHash?: string): Promise<TermFlowPluginManifest>
}

export function createPluginHandlers(
  pluginRuntime: PluginRuntime,
  getWindow: () => BrowserWindow | null
): PluginHandlers {
  const pluginsDir = join(app.getPath('userData'), 'plugins')
  const pluginStateFile = join(app.getPath('userData'), 'plugin-state.json')

  const ensurePlugins = async (): Promise<void> => {
    await mkdir(pluginsDir, { recursive: true })
  }

  const readDisabledPlugins = async (): Promise<Set<string>> => {
    try {
      const value = JSON.parse(await readFile(pluginStateFile, 'utf-8')) as { disabled?: unknown }
      return new Set(Array.isArray(value.disabled) ? value.disabled.filter((id): id is string => typeof id === 'string') : [])
    } catch {
      return new Set()
    }
  }

  const writeDisabledPlugins = async (disabled: Set<string>): Promise<void> => {
    await writeFile(pluginStateFile, JSON.stringify({ disabled: [...disabled].sort() }, null, 2), 'utf-8')
  }

  const installBundle = async (raw: string, expectedHash?: string): Promise<TermFlowPluginManifest> => {
    if (Buffer.byteLength(raw) > MAX_JSON_FILE_BYTES) throw new Error('Plugin package is too large')
    const parsed = JSON.parse(raw) as { format?: string; formatVersion?: number; manifest?: unknown; files?: Record<string, string>; sha256?: string }
    if (parsed.format !== 'termflow-plugin-bundle' || parsed.formatVersion !== 1 || !parsed.manifest || !parsed.files) throw new Error('Invalid TermFlow plugin package')
    const unsigned = JSON.stringify({ format: parsed.format, formatVersion: parsed.formatVersion, manifest: parsed.manifest, files: parsed.files })
    const hash = createHash('sha256').update(unsigned).digest('hex')
    if (hash !== parsed.sha256 || (expectedHash && hash !== expectedHash)) throw new Error('Plugin package integrity check failed')
    const plugin = validatePluginManifest(parsed.manifest)
    const targetDir = join(pluginsDir, plugin.id)
    await mkdir(targetDir, { recursive: true })
    for (const [name, content] of Object.entries(parsed.files)) {
      if (!/^[a-zA-Z0-9._/-]+$/.test(name) || name.includes('..') || isAbsolute(name)) throw new Error('Plugin package contains an unsafe path')
      const target = join(targetDir, name)
      await mkdir(resolve(target, '..'), { recursive: true })
      await writeFile(target, Buffer.from(content, 'base64'))
    }
    await writeFile(join(targetDir, 'termflow-plugin.json'), JSON.stringify(plugin, null, 2), 'utf-8')
    await writeFile(join(pluginsDir, `${plugin.id}.json`), JSON.stringify(plugin, null, 2), 'utf-8')
    await pluginRuntime.activate(plugin, targetDir)
    return { ...plugin, enabled: true }
  }

  const list = async (): Promise<TermFlowPluginManifest[]> => {
    await ensurePlugins()
    const disabled = await readDisabledPlugins()
    const files = (await readdir(pluginsDir)).filter((file) => file.endsWith('.json'))
    const results = await Promise.all(files.map(async (file) => {
      try { return validatePluginManifest(JSON.parse(await readFile(join(pluginsDir, file), 'utf-8'))) } catch { return null }
    }))
    const user = results.filter((p): p is TermFlowPluginManifest => !!p)
    // Builtins first; a user plugin with the same id overrides the builtin.
    const userIds = new Set(user.map((p) => p.id))
    const plugins = [...BUILTIN_PLUGINS.map(validatePluginManifest).filter((p) => !userIds.has(p.id)), ...user]
      .map((plugin) => ({ ...plugin, enabled: !disabled.has(plugin.id) }))
    await Promise.all(plugins.filter((plugin) => plugin.enabled && plugin.entry).map(async (plugin) => {
      try { await pluginRuntime.activate(plugin, join(pluginsDir, plugin.id)) } catch (error) { console.warn(`[plugin:${plugin.id}]`, error) }
    }))
    return plugins
  }

  const save = async (manifest: unknown): Promise<TermFlowPluginManifest> => {
    const plugin = validatePluginManifest(manifest)
    await ensurePlugins()
    await writeFile(join(pluginsDir, `${plugin.id}.json`), JSON.stringify(plugin, null, 2), 'utf-8')
    return { ...plugin, enabled: true }
  }

  const install = async (): Promise<TermFlowPluginManifest | null> => {
    const result = await dialog.showOpenDialog(getWindow()!, { title: 'Install TermFlow plugin', properties: ['openFile'], filters: [{ name: 'TermFlow Plugin', extensions: ['json', 'tfplugin'] }] })
    if (result.canceled || !result.filePaths[0]) return null
    const info = await stat(result.filePaths[0])
    if (info.size > MAX_JSON_FILE_BYTES) throw new Error('Plugin manifest is too large')
    const raw = await readFile(result.filePaths[0], 'utf-8')
    if (result.filePaths[0].endsWith('.tfplugin')) return installBundle(raw)
    return save(JSON.parse(raw))
  }

  const remove = async (id: unknown): Promise<void> => {
    if (!isValidPluginId(id)) throw new Error('Plugin ID is invalid')
    try { await unlink(join(pluginsDir, `${id}.json`)) } catch { /* not present */ }
    const disabled = await readDisabledPlugins()
    disabled.delete(id)
    await writeDisabledPlugins(disabled)
  }

  const setEnabled = async (id: unknown, enabled: unknown): Promise<void> => {
    if (!isValidPluginId(id) || typeof enabled !== 'boolean') throw new Error('Plugin state is invalid')
    const disabled = await readDisabledPlugins()
    if (enabled) disabled.delete(id); else disabled.add(id)
    await writeDisabledPlugins(disabled)
    if (!enabled) await pluginRuntime.deactivate(id)
  }

  const reload = async (id: unknown): Promise<void> => {
    // Guard added: this id is interpolated into a path, so it must be a plain
    // plugin id (no traversal, no separators).
    if (!isValidPluginId(id)) throw new Error('Plugin ID is invalid')
    const plugin = validatePluginManifest(JSON.parse(await readFile(join(pluginsDir, `${id}.json`), 'utf-8')))
    await pluginRuntime.activate(plugin, join(pluginsDir, id))
  }

  const registryList = async (): Promise<unknown> => {
    try { return JSON.parse(await readFile(join(app.getPath('userData'), 'plugin-registry.json'), 'utf-8')) } catch { return [] }
  }

  const registryInstall = async (entry: unknown): Promise<TermFlowPluginManifest> => {
    const row = entry && typeof entry === 'object' ? (entry as { packageUrl?: unknown; sha256?: unknown }) : null
    if (!row || typeof row.packageUrl !== 'string') throw new Error('Registry entry is invalid')
    const url = new URL(row.packageUrl)
    if (url.protocol !== 'https:') throw new Error('Registry packages must use HTTPS')
    const response = await net.fetch(url.toString())
    if (!response.ok) throw new Error(`Plugin download failed: ${response.status}`)
    return installBundle(await response.text(), typeof row.sha256 === 'string' ? row.sha256 : undefined)
  }

  return { pluginsDir, list, install, save, remove, setEnabled, reload, registryList, registryInstall, installBundle }
}

export function registerPluginIpc(pluginRuntime: PluginRuntime, getWindow: () => BrowserWindow | null): PluginHandlers {
  const handlers = createPluginHandlers(pluginRuntime, getWindow)
  ipcMain.handle(IPC.PLUGIN_LIST, () => handlers.list())
  ipcMain.handle(IPC.PLUGIN_INSTALL, () => handlers.install())
  ipcMain.handle(IPC.PLUGIN_SAVE, (_e, manifest: unknown) => handlers.save(manifest))
  ipcMain.handle(IPC.PLUGIN_DELETE, (_e, id: string) => handlers.remove(id))
  ipcMain.handle(IPC.PLUGIN_SET_ENABLED, (_e, id: string, enabled: boolean) => handlers.setEnabled(id, enabled))
  ipcMain.handle(IPC.PLUGIN_DIAGNOSTICS, () => pluginRuntime.diagnostics())
  ipcMain.handle(IPC.PLUGIN_RELOAD, (_e, id: string) => handlers.reload(id))
  ipcMain.handle(IPC.PLUGIN_REGISTRY_LIST, () => handlers.registryList())
  ipcMain.handle(IPC.PLUGIN_REGISTRY_INSTALL, (_e, entry: { packageUrl: string; sha256?: string }) => handlers.registryInstall(entry))
  return handlers
}

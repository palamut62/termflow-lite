import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import { IPC, type WorkspaceFileEntry } from '../../../shared/types'
import { validateManifest } from '../../../shared/validation'
import * as dbApi from '../../db/database'
import { MAX_JSON_FILE_BYTES, MAX_PREVIEW_BYTES } from '../constants'
import { hasUnsafeKeys, realPathInside, safePathString, validateCwd } from '../pathSafety'

/** Filesystem-facing IPC: workspace browser, project manifest, agent config. */

const HIDDEN_DIRS = ['node_modules', '.git', 'dist', 'out']

export function agentCfgPath(target: 'settings' | 'config'): string {
  return target === 'settings' ? join(homedir(), '.claude', 'settings.json') : join(homedir(), '.claude.json')
}

export async function readAgentConfig(target: unknown): Promise<Record<string, unknown>> {
  const t: 'settings' | 'config' = target === 'settings' ? 'settings' : 'config'
  const file = agentCfgPath(t)
  try {
    const parsed = JSON.parse(await readFile(file, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') return {}
    throw new Error(`Failed to read ${t}: ${e.message}`)
  }
}

export async function writeAgentConfig(target: unknown, patch: unknown): Promise<Record<string, unknown>> {
  const t: 'settings' | 'config' = target === 'settings' ? 'settings' : 'config'
  const file = agentCfgPath(t)
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || hasUnsafeKeys(patch)) {
    throw new Error('Invalid patch')
  }
  // Always re-read the latest content before merging (handles large/concurrently-changed files).
  let current: Record<string, unknown> = {}
  try {
    const raw = await readFile(file, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed as Record<string, unknown>
    // Backup existing file before overwriting.
    await writeFile(`${file}.termflow-bak`, raw, 'utf-8')
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code !== 'ENOENT') throw new Error(`Failed to read ${t} before write: ${e.message}`)
  }
  const merged = { ...current, ...(patch as Record<string, unknown>) }
  if (t === 'settings') await mkdir(join(homedir(), '.claude'), { recursive: true })
  await writeFile(file, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}

export async function listWorkspaceFiles(workspaceId: unknown, path?: unknown): Promise<WorkspaceFileEntry[]> {
  const ws = dbApi.listWorkspaces().find((item) => item.id === workspaceId)
  if (!ws) return []
  const dir = await realPathInside(ws.path, path ?? ws.path)
  const items = (await readdir(dir, { withFileTypes: true })).filter((item) => !HIDDEN_DIRS.includes(item.name))
  const entries = await Promise.all(
    items.map(async (item) => {
      const fullPath = join(dir, item.name)
      const directory = item.isDirectory()
      let size = 0
      if (!directory) {
        try {
          size = (await stat(fullPath)).size
        } catch {
          size = 0
        }
      }
      return { name: item.name, path: fullPath, directory, size }
    })
  )
  return entries.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name))
}

export async function readWorkspaceText(workspaceId: unknown, path: unknown): Promise<string> {
  const ws = dbApi.listWorkspaces().find((item) => item.id === workspaceId)
  if (!ws) throw new Error('Workspace not found')
  const target = await realPathInside(ws.path, path)
  const info = await stat(target)
  if (!info.isFile()) throw new Error('Not a file')
  if (info.size > MAX_PREVIEW_BYTES) throw new Error('File is too large to preview')
  const data = await readFile(target)
  if (data.includes(0)) throw new Error('Binary files cannot be previewed')
  return data.toString('utf-8')
}

export async function checkManifest(rawCwd: unknown): Promise<ReturnType<typeof validateManifest>['data']> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return null
  try {
    const source = await readFile(join(cwd, '.termflow.json'), 'utf-8')
    if (Buffer.byteLength(source, 'utf-8') > MAX_JSON_FILE_BYTES) return null
    return validateManifest(JSON.parse(source)).data
  } catch {
    return null
  }
}

export async function readPackageScripts(
  rawCwd: unknown
): Promise<{ scripts: Record<string, string>; packageManager: 'npm' | 'pnpm' | 'yarn' } | null> {
  const cwd = validateCwd(rawCwd)
  if (!cwd) return null
  try {
    const source = await readFile(join(cwd, 'package.json'), 'utf-8')
    if (Buffer.byteLength(source, 'utf-8') > MAX_JSON_FILE_BYTES) return null
    const pkg = JSON.parse(source)
    const scripts: Record<string, string> = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {}
    let packageManager: 'npm' | 'pnpm' | 'yarn' = 'npm'
    if (existsSync(join(cwd, 'pnpm-lock.yaml'))) packageManager = 'pnpm'
    else if (existsSync(join(cwd, 'yarn.lock'))) packageManager = 'yarn'
    return { scripts, packageManager }
  } catch {
    return null
  }
}

export function checkFileExists(path: unknown): boolean {
  const raw = safePathString(path)
  return raw !== null && existsSync(raw)
}

export function registerFileIpc(): void {
  ipcMain.handle(IPC.AGENT_CFG_READ, (_e, target: 'settings' | 'config') => readAgentConfig(target))
  ipcMain.handle(IPC.AGENT_CFG_WRITE, (_e, target: 'settings' | 'config', patch: Record<string, unknown>) =>
    writeAgentConfig(target, patch)
  )
  ipcMain.handle(IPC.FS_LIST, (_e, workspaceId: string, path?: string) => listWorkspaceFiles(workspaceId, path))
  ipcMain.handle(IPC.FS_READ_TEXT, (_e, workspaceId: string, path: string) => readWorkspaceText(workspaceId, path))
  ipcMain.handle(IPC.WS_CHECK_MANIFEST, (_e, rawCwd: string) => checkManifest(rawCwd))
  ipcMain.handle(IPC.PKG_SCRIPTS, (_e, rawCwd: string) => readPackageScripts(rawCwd))
  ipcMain.handle(IPC.DIALOG_CHECK_FILE, (_e, path: string) => checkFileExists(path))
}

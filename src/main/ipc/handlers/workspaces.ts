import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { nanoid } from 'nanoid'
import {
  IPC,
  type HighlightRule,
  type Snippet,
  type SshProfile,
  type TerminalSession,
  type WorkspaceExport,
  type WorkspaceHealthCheck,
  type WorkspaceLayout
} from '../../../shared/types'
import { validateManifest, validateWorkspaceExport } from '../../../shared/validation'
import * as dbApi from '../../db/database'
import { MAX_JSON_FILE_BYTES } from '../constants'
import { safeFileId } from '../pathSafety'

/** Workspace CRUD, export/import/clone, templates, health and diagnostics. */

const execFileAsync = promisify(execFile)

export function buildWorkspaceExport(workspaceId: string): WorkspaceExport | null {
  const ws = dbApi.listWorkspaces().find((w) => w.id === workspaceId)
  if (!ws) return null
  const data = dbApi.exportWorkspaceData(workspaceId)
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    workspace: {
      name: ws.name,
      path: ws.path,
      description: ws.description
    },
    nodes: data.nodes,
    terminals: data.terminals,
    snippets: data.snippets,
    highlightRules: data.highlightRules,
    sshProfiles: data.sshProfiles,
    envVars: data.envVars.map((v) => v.masked ? { ...v, value: '' } : v)
  }
}

export function instantiateWorkspaceExport(
  raw: WorkspaceExport,
  overrides?: { name?: string; path?: string }
): { id: string } | { error: string } {
  try {
    // Generate new IDs via remap
    const idMap = new Map<string, string>()
    const remap = (oldId: string): string => {
      if (!idMap.has(oldId)) idMap.set(oldId, nanoid())
      return idMap.get(oldId)!
    }

    const newTerms = (raw.terminals || []).map((t: any) => ({
      ...t,
      id: remap(t.id),
      workspaceId: '',
      pid: undefined,
      status: 'stopped'
    }))

    const newNodes = (raw.nodes || []).map((n: any) => {
      const newId = remap(n.id)
      const newTermId = n.terminalId ? remap(n.terminalId) : undefined
      return {
        ...n,
        id: newId,
        terminalId: newTermId,
        panes: dbApi.remapPaneIds(n.panes, remap),
        activePaneId: n.activePaneId ? remap(n.activePaneId) : undefined,
        workspaceId: ''
      }
    })
    const ws = dbApi.createWorkspace({
      name: overrides?.name || raw.workspace.name || 'Imported',
      path: overrides?.path || raw.workspace.path || process.env.USERPROFILE || '',
      description: raw.workspace.description
    })

    const wsNodes = newNodes.map((n: any) => ({ ...n, workspaceId: ws.id }))
    const wsTerms = newTerms.map((t: any) => ({ ...t, workspaceId: ws.id }))
    const wsSnippets = (raw.snippets || []).map((s: any) => ({
      ...s, id: remap(s.id), workspaceId: ws.id, scope: 'workspace' as const
    }))
    const wsHighlightRules = (raw.highlightRules || []).map((r: any) => ({
      ...r, id: remap(r.id), workspaceId: ws.id
    }))
    const wsSshProfiles = (raw.sshProfiles || []).map((p: any) => ({
      ...p, id: remap(p.id), workspaceId: ws.id
    }))
    const wsEnvVars = (raw.envVars || []).map((v: any) => ({
      ...v, id: remap(v.id), workspaceId: ws.id
    }))

    dbApi.importWorkspaceData(
      ws.id,
      wsTerms as TerminalSession[],
      wsNodes,
      wsSnippets as Snippet[],
      wsHighlightRules as HighlightRule[],
      wsSshProfiles as SshProfile[],
      wsEnvVars
    )
    return { id: ws.id }
  } catch (err) {
    console.error('Import failed:', err)
    return { error: err instanceof Error ? err.message : 'Import failed' }
  }
}

// ---- Templates ----

export function templatesDir(): string {
  return join(app.getPath('userData'), 'templates')
}

/** Template ids become filenames — reject anything but a plain nanoid-shaped id. */
export function templateFile(id: unknown): string {
  const safe = safeFileId(id)
  if (!safe) throw new Error('Template id is invalid')
  return join(templatesDir(), `${safe}.termflow.json`)
}

export async function saveTemplate(workspaceId: unknown, templateName: unknown): Promise<{ id: string } | { error: string }> {
  if (typeof workspaceId !== 'string') return { error: 'Workspace not found' }
  const exp = buildWorkspaceExport(workspaceId)
  if (!exp) return { error: 'Workspace not found' }
  await mkdir(templatesDir(), { recursive: true })
  const id = nanoid()
  const name = typeof templateName === 'string' && templateName.trim() ? templateName.slice(0, 120) : exp.workspace.name
  await writeFile(templateFile(id), JSON.stringify({ ...exp, templateName: name }, null, 2), 'utf-8')
  return { id }
}

export async function listTemplates(): Promise<Array<{ id: string; name: string; savedAt: string }>> {
  await mkdir(templatesDir(), { recursive: true })
  try {
    const dir = templatesDir()
    const files = (await readdir(dir)).filter((f) => f.endsWith('.termflow.json'))
    const entries = await Promise.all(files.map(async (f) => {
      const id = f.replace(/\.termflow\.json$/, '')
      try {
        const data = JSON.parse(await readFile(join(dir, f), 'utf-8'))
        return { id, name: data.templateName || data.workspace?.name || id, savedAt: data.exportedAt || '' }
      } catch {
        return null
      }
    }))
    return entries.filter((t): t is { id: string; name: string; savedAt: string } => !!t)
  } catch {
    return []
  }
}

export async function createWorkspaceFromTemplate(
  templateId: unknown,
  opts?: { name?: string; path?: string }
): Promise<{ id: string } | { error: string }> {
  try {
    const source = await readFile(templateFile(templateId), 'utf-8')
    if (Buffer.byteLength(source, 'utf-8') > MAX_JSON_FILE_BYTES) throw new Error('Template file is too large')
    const checked = validateWorkspaceExport(JSON.parse(source))
    if (!checked.data) throw new Error(checked.errors.join(' '))
    return instantiateWorkspaceExport(checked.data, opts)
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Template could not be applied' }
  }
}

export async function deleteTemplate(templateId: unknown): Promise<void> {
  try {
    await unlink(templateFile(templateId))
  } catch {
    /* ignore */
  }
}

// ---- Health / diagnostics ----

export async function workspaceHealth(workspaceId: unknown): Promise<WorkspaceHealthCheck[]> {
  const ws = dbApi.listWorkspaces().find((item) => item.id === workspaceId)
  if (!ws) return [{ id: 'workspace', label: 'Workspace', status: 'error', detail: 'Workspace not found' }]
  const checks: WorkspaceHealthCheck[] = []
  checks.push({ id: 'path', label: 'Workspace path', status: existsSync(ws.path) ? 'ok' : 'error', detail: ws.path })
  const manifestPath = join(ws.path, '.termflow.json')
  if (!existsSync(manifestPath)) {
    checks.push({ id: 'manifest', label: 'TermFlow manifest', status: 'warning', detail: 'Optional .termflow.json is missing' })
  } else {
    try {
      const result = validateManifest(JSON.parse(await readFile(manifestPath, 'utf-8')))
      checks.push({ id: 'manifest', label: 'TermFlow manifest', status: result.data ? 'ok' : 'error', detail: result.data ? '.termflow.json is valid' : result.errors.join(' ') })
    } catch {
      checks.push({ id: 'manifest', label: 'TermFlow manifest', status: 'error', detail: '.termflow.json cannot be parsed' })
    }
  }
  checks.push({ id: 'package', label: 'Node project', status: existsSync(join(ws.path, 'package.json')) ? 'ok' : 'warning', detail: existsSync(join(ws.path, 'package.json')) ? 'package.json found' : 'No package.json' })
  for (const command of ['git', 'node', 'npm']) {
    try {
      const { stdout } = await execFileAsync('where.exe', [command], { encoding: 'utf-8', timeout: 2000 })
      const found = stdout.split(/\r?\n/)[0]
      checks.push({ id: `runtime:${command}`, label: command, status: 'ok', detail: found })
    } catch {
      checks.push({ id: `runtime:${command}`, label: command, status: 'warning', detail: `${command} is not on PATH` })
    }
  }
  try {
    const { stdout } = await execFileAsync('git', ['branch', '--show-current'], { cwd: ws.path, encoding: 'utf-8', timeout: 3000 })
    const branch = stdout.trim()
    checks.push({ id: 'git', label: 'Git repository', status: 'ok', detail: branch || 'detached HEAD' })
  } catch {
    checks.push({ id: 'git', label: 'Git repository', status: 'warning', detail: 'Not a Git repository' })
  }
  return checks
}

export function buildDiagnostics(workspaceId: string): Record<string, unknown> | null {
  const ws = dbApi.listWorkspaces().find((item) => item.id === workspaceId)
  if (!ws) return null
  const layout = dbApi.getLayout(workspaceId)
  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    node: process.versions.node,
    workspace: { name: ws.name, pathExists: existsSync(ws.path) },
    counts: {
      terminals: dbApi.listTerminals(workspaceId).length,
      nodes: layout.nodes.length,
      snippets: dbApi.listSnippets(workspaceId).length,
      sshProfiles: dbApi.listSshProfiles(workspaceId).length,
      envVars: dbApi.listEnvVars(workspaceId).length
    },
    settings: dbApi.getSettings()
  }
}

export function registerWorkspaceIpc(getWindow: () => BrowserWindow | null): void {
  // ---- Workspaces ----
  ipcMain.handle(IPC.WS_LIST, () => dbApi.listWorkspaces())
  ipcMain.handle(IPC.WS_CREATE, (_e, input) => dbApi.createWorkspace(input))
  ipcMain.handle(IPC.WS_UPDATE, (_e, id, patch) => dbApi.updateWorkspace(id, patch))
  ipcMain.handle(IPC.WS_DELETE, (_e, id) => dbApi.deleteWorkspace(id))

  // ---- Terminals persistence ----
  ipcMain.handle(IPC.TERM_LIST, (_e, workspaceId: string) => dbApi.listTerminals(workspaceId))
  ipcMain.handle(IPC.TERM_UPSERT, (_e, t: TerminalSession) => dbApi.upsertTerminal(t))
  ipcMain.handle(IPC.TERM_DELETE, (_e, id: string) => dbApi.deleteTerminal(id))

  // ---- Layout ----
  ipcMain.handle(IPC.LAYOUT_GET, (_e, workspaceId: string) => dbApi.getLayout(workspaceId))
  ipcMain.handle(IPC.LAYOUT_SAVE, (_e, layout: WorkspaceLayout) => dbApi.saveLayout(layout))

  // ---- Snippets ----
  ipcMain.handle(IPC.SNIPPET_LIST, (_e, workspaceId?: string) => dbApi.listSnippets(workspaceId))
  ipcMain.handle(IPC.SNIPPET_CREATE, (_e, input: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>) => dbApi.createSnippet(input))
  ipcMain.handle(IPC.SNIPPET_UPDATE, (_e, id: string, patch: Partial<Snippet>) => dbApi.updateSnippet(id, patch))
  ipcMain.handle(IPC.SNIPPET_DELETE, (_e, id: string) => dbApi.deleteSnippet(id))

  // ---- Highlight Rules ----
  ipcMain.handle(IPC.HL_RULE_LIST, (_e, workspaceId?: string) => dbApi.listHighlightRules(workspaceId))
  ipcMain.handle(IPC.HL_RULE_CREATE, (_e, input: Omit<HighlightRule, 'id'>) => dbApi.createHighlightRule(input))
  ipcMain.handle(IPC.HL_RULE_UPDATE, (_e, id: string, patch: Partial<HighlightRule>) => dbApi.updateHighlightRule(id, patch))
  ipcMain.handle(IPC.HL_RULE_DELETE, (_e, id: string) => dbApi.deleteHighlightRule(id))

  // ---- SSH Profiles ----
  ipcMain.handle(IPC.SSH_PROFILE_LIST, (_e, workspaceId: string) => dbApi.listSshProfiles(workspaceId))
  ipcMain.handle(IPC.SSH_PROFILE_CREATE, (_e, input: Omit<SshProfile, 'id' | 'createdAt'>) => dbApi.createSshProfile(input))
  ipcMain.handle(IPC.SSH_PROFILE_UPDATE, (_e, id: string, patch: Partial<SshProfile>) => dbApi.updateSshProfile(id, patch))
  ipcMain.handle(IPC.SSH_PROFILE_DELETE, (_e, id: string) => dbApi.deleteSshProfile(id))

  // ---- Export / Import / Clone ----
  ipcMain.handle(IPC.WS_EXPORT, async (_e, workspaceId: string) => {
    const exp = buildWorkspaceExport(workspaceId)
    if (!exp) return
    const res = await dialog.showSaveDialog(getWindow()!, {
      title: 'Export Workspace',
      defaultPath: `${exp.workspace.name.replace(/\s+/g, '_')}.termflow.json`,
      filters: [{ name: 'TermFlow Workspace', extensions: ['termflow.json'] }]
    })
    if (!res.canceled && res.filePath) {
      await writeFile(res.filePath, JSON.stringify(exp, null, 2), 'utf-8')
    }
  })

  ipcMain.handle(IPC.WS_IMPORT, async () => {
    const res = await dialog.showOpenDialog(getWindow()!, {
      title: 'Import Workspace',
      filters: [{ name: 'TermFlow Workspace', extensions: ['termflow.json'] }],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    try {
      const source = await readFile(res.filePaths[0], 'utf-8')
      if (Buffer.byteLength(source, 'utf-8') > MAX_JSON_FILE_BYTES) throw new Error('Import file is too large')
      const checked = validateWorkspaceExport(JSON.parse(source))
      if (!checked.data) throw new Error(checked.errors.join(' '))
      return instantiateWorkspaceExport(checked.data)
    } catch (err) {
      console.error('Import failed:', err)
      return { error: err instanceof Error ? err.message : 'Import failed' }
    }
  })

  ipcMain.handle(IPC.WS_CLONE, async (_e, workspaceId: string) => {
    const exp = buildWorkspaceExport(workspaceId)
    if (!exp) return { error: 'Workspace not found' }
    return instantiateWorkspaceExport(exp, { name: `${exp.workspace.name} (Copy)` })
  })

  // ---- Templates ----
  ipcMain.handle(IPC.TEMPLATE_SAVE, (_e, workspaceId: string, templateName: string) => saveTemplate(workspaceId, templateName))
  ipcMain.handle(IPC.TEMPLATE_LIST, () => listTemplates())
  ipcMain.handle(IPC.TEMPLATE_CREATE_WORKSPACE, (_e, templateId: string, opts?: { name?: string; path?: string }) =>
    createWorkspaceFromTemplate(templateId, opts)
  )
  ipcMain.handle(IPC.TEMPLATE_DELETE, (_e, templateId: string) => deleteTemplate(templateId))

  // ---- Health / diagnostics ----
  ipcMain.handle(IPC.WS_HEALTH, (_e, workspaceId: string) => workspaceHealth(workspaceId))
  ipcMain.handle(IPC.DIAGNOSTICS_EXPORT, async (_e, workspaceId: string) => {
    const diagnostics = buildDiagnostics(workspaceId)
    if (!diagnostics) return
    const res = await dialog.showSaveDialog(getWindow()!, {
      title: 'Export Diagnostics',
      defaultPath: `termflow-diagnostics-${Date.now()}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!res.canceled && res.filePath) await writeFile(res.filePath, JSON.stringify(diagnostics, null, 2), 'utf-8')
  })
}

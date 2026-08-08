import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** Template ids become filenames — traversal there means arbitrary file delete/read. */

const harness = vi.hoisted(() => ({
  userData: '',
  workspaces: [] as Array<Record<string, unknown>>,
  created: [] as Array<Record<string, unknown>>
}))

vi.mock('electron', () => ({
  app: { getPath: () => harness.userData },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() }
}))

vi.mock('../../db/database', () => ({
  listWorkspaces: () => harness.workspaces,
  exportWorkspaceData: () => ({ terminals: [], nodes: [], snippets: [], highlightRules: [], sshProfiles: [], envVars: [] }),
  createWorkspace: (input: Record<string, unknown>) => {
    const ws = { id: `new${harness.created.length}`, ...input }
    harness.created.push(ws)
    return ws
  },
  importWorkspaceData: vi.fn(),
  remapPaneIds: (panes: unknown) => panes,
  getLayout: () => ({ workspaceId: 'ws1', nodes: [] }),
  listTerminals: () => [],
  listSnippets: () => [],
  listSshProfiles: () => [],
  listEnvVars: () => [],
  getSettings: () => ({})
}))

import {
  buildDiagnostics,
  buildWorkspaceExport,
  createWorkspaceFromTemplate,
  deleteTemplate,
  listTemplates,
  saveTemplate,
  templateFile,
  templatesDir
} from './workspaces'

beforeEach(() => {
  harness.userData = mkdtempSync(join(tmpdir(), 'termflow-ws-'))
  harness.workspaces = [{ id: 'ws1', name: 'Demo', path: harness.userData, updatedAt: '2024-01-01' }]
  harness.created = []
})

afterEach(() => {
  rmSync(harness.userData, { recursive: true, force: true })
})

const BAD_IDS = [
  '../../evil',
  '..\\..\\evil',
  '..',
  'a/b',
  'a\\b',
  'C:\\Windows\\System32\\config',
  '\\\\attacker\\share\\x',
  'has.dot',
  '',
  'a'.repeat(200)
]

describe('templateFile', () => {
  it('builds a path inside the templates dir', () => {
    expect(templateFile('abc123')).toBe(join(templatesDir(), 'abc123.termflow.json'))
  })

  it.each(BAD_IDS)('refuses id %j', (id) => {
    expect(() => templateFile(id)).toThrow(/Template id is invalid/)
  })

  it.each([null, undefined, 42, {}])('refuses non-string id %j', (id) => {
    expect(() => templateFile(id)).toThrow(/Template id is invalid/)
  })
})

describe('templates', () => {
  it('saves and lists a template', async () => {
    const res = (await saveTemplate('ws1', 'My template')) as { id: string }
    expect(res.id).toBeTruthy()
    const listed = await listTemplates()
    expect(listed).toHaveLength(1)
    expect(listed[0].name).toBe('My template')
  })

  it('falls back to the workspace name', async () => {
    await saveTemplate('ws1', '   ')
    expect((await listTemplates())[0].name).toBe('Demo')
  })

  it.each([
    ['unknown workspace', 'nope'],
    ['null workspace', null],
    ['number workspace', 7]
  ])('refuses to save from a %s', async (_label, workspaceId) => {
    expect(await saveTemplate(workspaceId, 'x')).toEqual({ error: 'Workspace not found' })
  })

  it.each(BAD_IDS)('refuses to instantiate traversal template %j', async (id) => {
    expect(await createWorkspaceFromTemplate(id)).toEqual({ error: 'Template id is invalid' })
    expect(harness.created).toHaveLength(0)
  })

  it.each(BAD_IDS)('refuses to delete traversal template %j without touching disk', async (id) => {
    const victim = join(harness.userData, 'evil.termflow.json')
    writeFileSync(victim, '{}', 'utf-8')
    await deleteTaskSafe(id)
    expect(existsSync(victim)).toBe(true)
  })

  it('deletes a real template', async () => {
    const res = (await saveTemplate('ws1', 'x')) as { id: string }
    await deleteTemplate(res.id)
    expect(readdirSync(templatesDir())).toHaveLength(0)
  })

  it('reports a corrupt template instead of throwing', async () => {
    mkdirSync(templatesDir(), { recursive: true })
    writeFileSync(join(templatesDir(), 'abc.termflow.json'), '{not json', 'utf-8')
    const result = await createWorkspaceFromTemplate('abc')
    expect(result).toHaveProperty('error')
    expect(await listTemplates()).toEqual([])
  })

  it('rejects a template that is not a valid workspace export', async () => {
    mkdirSync(templatesDir(), { recursive: true })
    writeFileSync(join(templatesDir(), 'abc.termflow.json'), JSON.stringify({ schemaVersion: 9 }), 'utf-8')
    expect(await createWorkspaceFromTemplate('abc')).toHaveProperty('error')
  })
})

async function deleteTaskSafe(id: unknown): Promise<void> {
  // deleteTemplate swallows errors by design; this just documents that no file
  // outside the templates dir is ever touched.
  await deleteTemplate(id)
}

describe('buildWorkspaceExport / buildDiagnostics', () => {
  it('exports a known workspace', () => {
    const exp = buildWorkspaceExport('ws1')
    expect(exp?.schemaVersion).toBe(1)
    expect(exp?.workspace.name).toBe('Demo')
  })

  it.each([
    ['unknown id', 'nope'],
    ['empty id', ''],
    ['null id', null as unknown as string]
  ])('returns null for %s', (_label, id) => {
    expect(buildWorkspaceExport(id)).toBeNull()
    expect(buildDiagnostics(id)).toBeNull()
  })

  it('builds diagnostics without secrets', () => {
    const diag = buildDiagnostics('ws1') as Record<string, unknown>
    expect(diag.workspace).toEqual({ name: 'Demo', pathExists: true })
    expect(JSON.stringify(diag)).not.toContain('encryptedValue')
  })
})

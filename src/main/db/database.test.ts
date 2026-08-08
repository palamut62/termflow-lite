import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** JSON store: atomic writes, corrupt-file recovery and backup rotation. */

const harness = vi.hoisted(() => ({ userData: '', home: '' }))

vi.mock('electron', () => ({
  app: { getPath: (key: string) => (key === 'home' ? harness.home : harness.userData) }
}))

import * as db from './database'

const storeFile = (): string => join(harness.userData, 'termflow.json')
const readStore = (): Record<string, any> => JSON.parse(readFileSync(storeFile(), 'utf-8'))

beforeEach(() => {
  harness.userData = mkdtempSync(join(tmpdir(), 'termflow-db-'))
  harness.home = harness.userData
})

afterEach(() => {
  rmSync(harness.userData, { recursive: true, force: true })
})

describe('initDatabase', () => {
  it('creates a default workspace on a fresh install', () => {
    db.initDatabase()
    db.flushPersist()
    expect(db.listWorkspaces()).toHaveLength(1)
    expect(db.listWorkspaces()[0].name).toBe('Default')
    expect(readStore().workspaces).toHaveLength(1)
  })

  it('loads an existing store', () => {
    writeFileSync(storeFile(), JSON.stringify({ workspaces: [{ id: 'w1', name: 'Kept', path: 'C:\\', updatedAt: '2024' }] }), 'utf-8')
    db.initDatabase()
    expect(db.listWorkspaces().map((w) => w.name)).toEqual(['Kept'])
  })

  it('backfills missing sections of a partial store', () => {
    writeFileSync(storeFile(), JSON.stringify({ workspaces: [{ id: 'w1', name: 'Kept', path: 'C:\\', updatedAt: '2024' }] }), 'utf-8')
    db.initDatabase()
    expect(db.listSnippets()).toEqual([])
    expect(db.listEnvVars('w1')).toEqual([])
    expect(db.getSettings().scrollback).toBeGreaterThan(0)
  })

  it('drops legacy agent-orchestration fields', () => {
    writeFileSync(storeFile(), JSON.stringify({ workspaces: [{ id: 'w1', name: 'Kept', path: 'C:\\', updatedAt: '2024' }], teams: [1], flowTemplates: [2] }), 'utf-8')
    db.initDatabase()
    db.flushPersist()
    expect(readStore().teams).toBeUndefined()
    expect(readStore().flowTemplates).toBeUndefined()
  })

  it('quarantines a corrupt store and starts fresh', () => {
    writeFileSync(storeFile(), '{ this is not json', 'utf-8')
    db.initDatabase()
    db.flushPersist()
    const corrupt = readdirSync(harness.userData).filter((f) => f.includes('.corrupt-'))
    expect(corrupt).toHaveLength(1)
    expect(readFileSync(join(harness.userData, corrupt[0]), 'utf-8')).toBe('{ this is not json')
    expect(db.listWorkspaces()[0].name).toBe('Default')
  })

  it('recovers from the .bak file when the primary store is corrupt', () => {
    writeFileSync(storeFile(), 'CORRUPT', 'utf-8')
    writeFileSync(storeFile() + '.bak', JSON.stringify({ workspaces: [{ id: 'w1', name: 'FromBackup', path: 'C:\\', updatedAt: '2024' }] }), 'utf-8')
    db.initDatabase()
    db.flushPersist()
    expect(db.listWorkspaces().map((w) => w.name)).toEqual(['FromBackup'])
    expect(readStore().workspaces[0].name).toBe('FromBackup')
  })

  it('falls back to an empty store when both the store and its backup are corrupt', () => {
    writeFileSync(storeFile(), 'CORRUPT', 'utf-8')
    writeFileSync(storeFile() + '.bak', 'ALSO CORRUPT', 'utf-8')
    db.initDatabase()
    db.flushPersist()
    expect(db.listWorkspaces()[0].name).toBe('Default')
  })
})

describe('atomic write', () => {
  beforeEach(() => {
    db.initDatabase()
    db.flushPersist()
  })

  it('leaves no .tmp file behind', () => {
    db.createWorkspace({ name: 'A', path: 'C:\\a' })
    db.flushPersist()
    expect(existsSync(storeFile() + '.tmp')).toBe(false)
    expect(readStore().workspaces).toHaveLength(2)
  })

  it('debounces writes until flushPersist', () => {
    const before = readStore().workspaces.length
    db.createWorkspace({ name: 'B', path: 'C:\\b' })
    expect(readStore().workspaces).toHaveLength(before) // not written yet
    db.flushPersist()
    expect(readStore().workspaces).toHaveLength(before + 1)
  })

  it('writes valid JSON after a burst of mutations', () => {
    for (let i = 0; i < 50; i++) db.createSnippet({ name: `s${i}`, command: 'echo', scope: 'global', workspaceId: null, params: [] })
    db.flushPersist()
    expect(() => readStore()).not.toThrow()
    expect(readStore().snippets).toHaveLength(50)
  })

  it('rotates a .bak copy at most once per interval', () => {
    db.createWorkspace({ name: 'A', path: 'C:\\a' })
    db.flushPersist()
    const first = existsSync(storeFile() + '.bak') ? readFileSync(storeFile() + '.bak', 'utf-8') : null
    db.createWorkspace({ name: 'B', path: 'C:\\b' })
    db.flushPersist()
    const second = existsSync(storeFile() + '.bak') ? readFileSync(storeFile() + '.bak', 'utf-8') : null
    expect(second).toBe(first) // throttled: no second backup within the interval
  })
})

describe('crud round-trips', () => {
  beforeEach(() => {
    db.initDatabase()
    db.flushPersist()
  })

  it('persists workspaces, terminals and layout together', () => {
    const ws = db.createWorkspace({ name: 'Proj', path: 'C:\\proj' })
    db.upsertTerminal({
      id: 't1', workspaceId: ws.id, name: 'sh', kind: 'shell', shell: 'cmd', args: [],
      cwd: 'C:\\proj', status: 'running', createdAt: '', updatedAt: ''
    } as never)
    db.saveLayout({ workspaceId: ws.id, nodes: [{ id: 'n1', workspaceId: ws.id, title: 'n', status: 'idle', terminalId: 't1' } as never], activeNodeId: 'n1' })
    db.flushPersist()
    expect(db.listTerminals(ws.id)).toHaveLength(1)
    expect(db.getLayout(ws.id).nodes).toHaveLength(1)
    // Legacy single-terminal nodes are migrated into a pane tree on read.
    expect(db.getLayout(ws.id).nodes[0].panes).toEqual({ type: 'leaf', terminalId: 't1', title: 'n' })
  })

  it('cascades a workspace delete', () => {
    const ws = db.createWorkspace({ name: 'Proj', path: 'C:\\proj' })
    db.createEnvVar({ workspaceId: ws.id, key: 'A', value: '1', masked: false })
    db.createSshProfile({ workspaceId: ws.id, name: 'p', host: 'h', user: 'u', port: 22 } as never)
    db.deleteWorkspace(ws.id)
    db.flushPersist()
    expect(db.listEnvVars(ws.id)).toEqual([])
    expect(db.listSshProfiles(ws.id)).toEqual([])
    expect(db.listWorkspaces().find((w) => w.id === ws.id)).toBeUndefined()
  })

  it('ignores updates for unknown ids instead of throwing', () => {
    expect(() => db.updateWorkspace('missing', { name: 'x' })).not.toThrow()
    expect(() => db.updateSnippet('missing', { name: 'x' })).not.toThrow()
    expect(() => db.updateEnvVar('missing', { value: 'x' })).not.toThrow()
    expect(() => db.updateHighlightRule('missing', { pattern: 'x' })).not.toThrow()
    expect(() => db.updateSshProfile('missing', { host: 'x' })).not.toThrow()
  })

  it('survives a reload from disk', () => {
    const ws = db.createWorkspace({ name: 'Reloaded', path: 'C:\\r' })
    db.createSnippet({ name: 's', command: 'echo', scope: 'workspace', workspaceId: ws.id, params: [] })
    db.flushPersist()
    db.initDatabase()
    expect(db.listWorkspaces().map((w) => w.name)).toContain('Reloaded')
    expect(db.listSnippets(ws.id)).toHaveLength(1)
  })
})

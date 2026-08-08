import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/** Task trigger files are named after the workspace id — that id is untrusted. */

const harness = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: () => harness.userData },
  ipcMain: { handle: vi.fn(), on: vi.fn() }
}))

import { deleteTaskTrigger, listTaskTriggers, saveTaskTrigger, taskTriggersDir } from './tasks'

beforeEach(() => {
  harness.userData = mkdtempSync(join(tmpdir(), 'termflow-tasks-'))
})

afterEach(() => {
  rmSync(harness.userData, { recursive: true, force: true })
})

const TRAVERSAL_IDS = [
  '../../pwned',
  '..\\..\\pwned',
  '..',
  'a/b',
  'a\\b',
  'C:\\Windows\\System32\\config',
  '\\\\attacker\\share\\x',
  'termflow.json',
  'plugin-state.json'
]

describe('saveTaskTrigger', () => {
  it('creates a trigger with a generated id', async () => {
    const res = await saveTaskTrigger({ workspaceId: 'ws1', kind: 'timer', everyMs: 1000 })
    expect(res).toHaveProperty('id')
    const stored = JSON.parse(readFileSync(join(taskTriggersDir(), 'ws1.json'), 'utf-8'))
    expect(stored).toHaveLength(1)
    expect(stored[0].kind).toBe('timer')
  })

  it('updates an existing trigger in place', async () => {
    const created = (await saveTaskTrigger({ workspaceId: 'ws1', kind: 'timer' })) as { id: string }
    await saveTaskTrigger({ workspaceId: 'ws1', id: created.id, kind: 'process_exit' })
    const stored = (await listTaskTriggers('ws1')) as Array<{ kind: string }>
    expect(stored).toHaveLength(1)
    expect(stored[0].kind).toBe('process_exit')
  })

  it.each(TRAVERSAL_IDS)('refuses workspace id %j', async (workspaceId) => {
    const res = await saveTaskTrigger({ workspaceId, kind: 'timer' })
    expect(res).toEqual({ error: 'Missing workspace' })
    expect(existsSync(join(harness.userData, 'pwned.json'))).toBe(false)
  })

  it.each(TRAVERSAL_IDS)('refuses trigger id %j', async (id) => {
    const res = await saveTaskTrigger({ workspaceId: 'ws1', id, kind: 'timer' })
    expect(res).toEqual({ error: 'Trigger id is invalid' })
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string', 'ws1'],
    ['array', []],
    ['empty object', {}],
    ['non-string workspace', { workspaceId: 42 }]
  ])('refuses a %s payload', async (_label, payload) => {
    expect(await saveTaskTrigger(payload)).toEqual({ error: 'Missing workspace' })
  })

  it('refuses a prototype-polluting payload', async () => {
    const payload = JSON.parse('{"workspaceId":"ws1","__proto__":{"polluted":true}}')
    expect(await saveTaskTrigger(payload)).toEqual({ error: 'Missing workspace' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('listTaskTriggers', () => {
  it('returns [] for an unknown or unsafe workspace', async () => {
    await expect(listTaskTriggers('ws-unknown')).resolves.toEqual([])
    await expect(listTaskTriggers('../../etc')).resolves.toEqual([])
    await expect(listTaskTriggers(null)).resolves.toEqual([])
  })

  it('returns [] for a corrupt file', async () => {
    mkdirSync(taskTriggersDir(), { recursive: true })
    writeFileSync(join(taskTriggersDir(), 'ws1.json'), '{not json', 'utf-8')
    await expect(listTaskTriggers('ws1')).resolves.toEqual([])
  })

  it('returns [] when the file holds a non-array', async () => {
    mkdirSync(taskTriggersDir(), { recursive: true })
    writeFileSync(join(taskTriggersDir(), 'ws1.json'), '{"a":1}', 'utf-8')
    await expect(listTaskTriggers('ws1')).resolves.toEqual([])
  })
})

describe('deleteTaskTrigger', () => {
  it('removes a single trigger', async () => {
    const a = (await saveTaskTrigger({ workspaceId: 'ws1', kind: 'timer' })) as { id: string }
    await saveTaskTrigger({ workspaceId: 'ws1', kind: 'process_exit' })
    await deleteTaskTrigger('ws1', a.id)
    expect(await listTaskTriggers('ws1')).toHaveLength(1)
  })

  it.each(TRAVERSAL_IDS)('ignores unsafe workspace id %j', async (workspaceId) => {
    await expect(deleteTaskTrigger(workspaceId, 'x')).resolves.toBeUndefined()
  })

  it('ignores a non-string trigger id', async () => {
    await saveTaskTrigger({ workspaceId: 'ws1', kind: 'timer' })
    await deleteTaskTrigger('ws1', null)
    expect(await listTaskTriggers('ws1')).toHaveLength(1)
  })
})

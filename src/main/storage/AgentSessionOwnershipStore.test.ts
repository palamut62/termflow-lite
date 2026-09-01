import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AgentSessionOwnershipStore } from './AgentSessionOwnershipStore'

let dir = ''
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'termflow-session-owner-')) })
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('AgentSessionOwnershipStore', () => {
  it('matches a new native session to the profile that launched it and persists the owner', () => {
    const file = join(dir, 'owners.json')
    const store = new AgentSessionOwnershipStore(file)
    store.recordLaunch({ agent: 'claude', profileId: 'provider:deepseek', cwd: 'C:\\work', startedAt: 10_000 })

    const sessions = store.enrich([{ agent: 'claude', id: 's1', title: 'Task', cwd: 'C:\\work', createdAt: 10_500, updatedAt: 20_000 }])
    expect(sessions[0].profileId).toBe('provider:deepseek')
    expect(new AgentSessionOwnershipStore(file).enrich(sessions)[0].profileId).toBe('provider:deepseek')
  })

  it('assigns a resumed native session directly to the selected compatible profile', () => {
    const store = new AgentSessionOwnershipStore(join(dir, 'owners.json'))
    store.recordLaunch({
      agent: 'codex', profileId: 'codex-work', cwd: 'C:\\repo', startedAt: 30_000,
      resumeSession: { agent: 'codex', id: 'existing' }
    })
    expect(store.enrich([{ agent: 'codex', id: 'existing', title: 'Existing', updatedAt: 1 }])[0].profileId).toBe('codex-work')
  })

  it('does not claim a session from another folder or outside the launch window', () => {
    const store = new AgentSessionOwnershipStore(join(dir, 'owners.json'))
    store.recordLaunch({ agent: 'claude', profileId: 'provider:deepseek', cwd: 'C:\\a', startedAt: 10_000 })
    const sessions = store.enrich([
      { agent: 'claude', id: 'wrong-cwd', title: 'A', cwd: 'C:\\b', createdAt: 10_100, updatedAt: 11_000 },
      { agent: 'claude', id: 'too-late', title: 'B', cwd: 'C:\\a', createdAt: 100_000, updatedAt: 100_000 }
    ])
    expect(sessions.every((session) => session.profileId === undefined)).toBe(true)
  })

  it('consumes a launch once so a later session cannot reuse the same profile hint', () => {
    const store = new AgentSessionOwnershipStore(join(dir, 'owners.json'))
    store.recordLaunch({ agent: 'claude', profileId: 'provider:deepseek', cwd: 'C:\\work', startedAt: 10_000 })

    expect(store.enrich([
      { agent: 'claude', id: 'first', title: 'First', cwd: 'C:\\work', createdAt: 10_500, updatedAt: 11_000 }
    ])[0].profileId).toBe('provider:deepseek')

    expect(store.enrich([
      { agent: 'claude', id: 'first', title: 'First', cwd: 'C:\\work', createdAt: 10_500, updatedAt: 11_000 },
      { agent: 'claude', id: 'second', title: 'Second', cwd: 'C:\\work', createdAt: 10_700, updatedAt: 11_200 }
    ])[1].profileId).toBeUndefined()
  })
})

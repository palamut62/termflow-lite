import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PersistedSession } from '../../shared/types'
import { SessionStore, paneTreeMatchesTabs, sanitizeSession } from './SessionStore'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'termflow-session-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.useRealTimers()
})

const file = (): string => join(dir, 'session.json')

const SESSION: PersistedSession = {
  version: 1,
  tabs: [
    { id: 'a', title: 'Bash', profileId: 'bash', cwd: '/work' },
    { id: 'b', title: 'Shell', profileId: 'sh' }
  ],
  activeTabId: 'b',
  paneTree: { type: 'split', dir: 'vertical', ratio: 0.5, a: { type: 'leaf', terminalId: 'a' }, b: { type: 'leaf', terminalId: 'b' } },
  splitDirection: 'vertical',
  splitRatio: 0.5
}

describe('SessionStore', () => {
  it('returns null when no session file exists yet', () => {
    const store = new SessionStore(file())
    expect(store.get()).toBeNull()
    expect(existsSync(file())).toBe(false)
  })

  it('returns null on corrupt JSON and leaves the file untouched', () => {
    writeFileSync(file(), '{not json!!', 'utf-8')
    expect(new SessionStore(file()).get()).toBeNull()
    expect(readFileSync(file(), 'utf-8')).toBe('{not json!!')
  })

  it('flush writes the session atomically', () => {
    const store = new SessionStore(file())
    store.save(SESSION)
    store.flush()
    const onDisk = JSON.parse(readFileSync(file(), 'utf-8')) as PersistedSession
    expect(onDisk.tabs.map((tab) => tab.id)).toEqual(['a', 'b'])
    expect(onDisk.activeTabId).toBe('b')
    expect(existsSync(`${file()}.tmp`)).toBe(false)
  })

  it('persists debounced writes after the debounce window', () => {
    vi.useFakeTimers()
    const store = new SessionStore(file())
    store.save(SESSION)
    store.save({ ...SESSION, activeTabId: 'a' })
    vi.advanceTimersByTime(299)
    expect(existsSync(file())).toBe(false)
    vi.advanceTimersByTime(1)
    expect((JSON.parse(readFileSync(file(), 'utf-8')) as PersistedSession).activeTabId).toBe('a')
  })

  it('clear removes the file and the in-memory session', () => {
    const store = new SessionStore(file())
    store.save(SESSION)
    store.flush()
    store.clear()
    expect(store.get()).toBeNull()
    expect(existsSync(file())).toBe(false)
  })

  it('never persists non-serializable extras such as resumeSession', () => {
    const store = new SessionStore(file())
    store.save({ ...SESSION, tabs: [{ ...SESSION.tabs[0], resumeSession: { agent: 'codex', id: 'x' } } as PersistedSession['tabs'][number]] })
    store.flush()
    expect(readFileSync(file(), 'utf-8')).not.toContain('resumeSession')
  })
})

describe('sanitizeSession', () => {
  it('rejects a foreign or unversioned payload', () => {
    expect(sanitizeSession(null)).toBeNull()
    expect(sanitizeSession({ version: 2, tabs: SESSION.tabs })).toBeNull()
    expect(sanitizeSession({ version: 1, tabs: [] })).toBeNull()
  })

  it('drops a paneTree whose terminal ids are not in tabs', () => {
    const clean = sanitizeSession({
      ...SESSION,
      paneTree: { type: 'split', dir: 'vertical', ratio: 0.5, a: { type: 'leaf', terminalId: 'a' }, b: { type: 'leaf', terminalId: 'ghost' } }
    })
    expect(clean?.paneTree).toBeNull()
    expect(clean?.splitDirection).toBeNull()
    expect(clean?.tabs).toHaveLength(2)
  })

  it('keeps a matching paneTree and clamps the split ratio', () => {
    const clean = sanitizeSession({ ...SESSION, splitRatio: 5 })
    expect(clean?.paneTree).toEqual(SESSION.paneTree)
    expect(clean?.splitRatio).toBe(0.85)
  })

  it('falls back to the first tab when activeTabId is unknown', () => {
    expect(sanitizeSession({ ...SESSION, activeTabId: 'ghost' })?.activeTabId).toBe('a')
  })
})

describe('paneTreeMatchesTabs', () => {
  it('rejects malformed nodes', () => {
    const ids = new Set(['a'])
    expect(paneTreeMatchesTabs(null, ids)).toBe(false)
    expect(paneTreeMatchesTabs({ type: 'leaf' }, ids)).toBe(false)
    expect(paneTreeMatchesTabs({ type: 'split', dir: 'diagonal', ratio: 0.5, a: { type: 'leaf', terminalId: 'a' }, b: { type: 'leaf', terminalId: 'a' } }, ids)).toBe(false)
    expect(paneTreeMatchesTabs({ type: 'leaf', terminalId: 'a' }, ids)).toBe(true)
  })
})

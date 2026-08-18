import { beforeEach, describe, expect, it } from 'vitest'
import { normalizeSavedCommand, normalizeStoredCommands, selectDueCommands, useSavedCommandStore, type SavedCommand } from './savedCommandStore'

describe('normalizeSavedCommand', () => {
  it('trims the name and command', () => {
    expect(normalizeSavedCommand(' Claude update ', ' claude update ', ' cmd ')).toEqual({
      name: 'Claude update',
      command: 'claude update',
      profileId: 'cmd'
    })
  })

  it('uses the command as the name when the name is empty', () => {
    expect(normalizeSavedCommand('', 'npm run dev', 'powershell')).toEqual({ name: 'npm run dev', command: 'npm run dev', profileId: 'powershell' })
  })

  it('rejects an empty command', () => {
    expect(normalizeSavedCommand('Empty', '   ', 'cmd')).toBeNull()
  })

  it('requires a target profile', () => {
    expect(normalizeSavedCommand('Update', 'claude update', '')).toBeNull()
  })
})

describe('normalizeStoredCommands', () => {
  it('keeps legacy entries without a schedule', () => {
    const result = normalizeStoredCommands([{ id: 'a', name: 'A', command: 'ls' }], 1000)
    expect(result.commands).toEqual([{ id: 'a', name: 'A', command: 'ls', profileId: '' }])
    expect(result.changed).toBe(false)
  })

  it('backfills a missing schedule anchor', () => {
    const result = normalizeStoredCommands([{ id: 'a', name: 'A', command: 'ls', profileId: 'cmd', schedule: { kind: 'daily', time: '08:00' } }], 1000)
    expect(result.commands[0].scheduleAnchor).toBe(1000)
    expect(result.changed).toBe(true)
  })

  it('drops an invalid schedule', () => {
    const result = normalizeStoredCommands([{ id: 'a', name: 'A', command: 'ls', profileId: 'cmd', schedule: { kind: 'daily', time: 'x' } }], 1000)
    expect(result.commands[0].schedule).toBeUndefined()
    expect(result.changed).toBe(true)
  })

  it('ignores non-array payloads', () => {
    expect(normalizeStoredCommands('nope', 1000)).toEqual({ commands: [], changed: false })
  })
})

describe('selectDueCommands', () => {
  const base: SavedCommand = { id: 'a', name: 'A', command: 'ls', profileId: 'cmd' }

  it('skips commands without a schedule', () => {
    expect(selectDueCommands([base], Date.now())).toEqual([])
  })

  it('returns commands whose interval has elapsed', () => {
    const now = new Date(2026, 7, 18, 10, 20).getTime()
    const item = { ...base, schedule: { kind: 'interval', minutes: 15 } as const, scheduleAnchor: new Date(2026, 7, 18, 10, 0).getTime() }
    expect(selectDueCommands([item], now)).toEqual([item])
  })

  it('honours lastRunAt over the anchor', () => {
    const now = new Date(2026, 7, 18, 10, 20).getTime()
    const item = { ...base, schedule: { kind: 'interval', minutes: 15 } as const, scheduleAnchor: new Date(2026, 7, 18, 10, 0).getTime(), lastRunAt: new Date(2026, 7, 18, 10, 15).getTime() }
    expect(selectDueCommands([item], now)).toEqual([])
  })

  it('catches up a daily command missed while the app was closed', () => {
    const item = { ...base, schedule: { kind: 'daily', time: '08:00' } as const, scheduleAnchor: new Date(2026, 7, 16, 9, 0).getTime() }
    expect(selectDueCommands([item], new Date(2026, 7, 18, 10, 0).getTime())).toEqual([item])
  })
})

describe('saved command store actions', () => {
  beforeEach(() => {
    useSavedCommandStore.setState({ commands: [] })
  })

  it('stores a schedule with an anchor', () => {
    expect(useSavedCommandStore.getState().add('Build', 'npm run build', 'cmd', { kind: 'daily', time: '08:00' })).toBe(true)
    const item = useSavedCommandStore.getState().commands[0]
    expect(item.schedule).toEqual({ kind: 'daily', time: '08:00' })
    expect(typeof item.scheduleAnchor).toBe('number')
    expect(item.lastRunAt).toBeUndefined()
  })

  it('adds without a schedule by default', () => {
    useSavedCommandStore.getState().add('Build', 'npm run build', 'cmd')
    expect(useSavedCommandStore.getState().commands[0].schedule).toBeUndefined()
  })

  it('keeps the anchor and last run when the schedule is unchanged', () => {
    useSavedCommandStore.getState().add('Build', 'npm run build', 'cmd', { kind: 'daily', time: '08:00' })
    const id = useSavedCommandStore.getState().commands[0].id
    useSavedCommandStore.getState().markRan(id, 1234)
    const anchor = useSavedCommandStore.getState().commands[0].scheduleAnchor
    useSavedCommandStore.getState().update(id, 'Build v2', 'npm run build', 'cmd', { kind: 'daily', time: '08:00' })
    const item = useSavedCommandStore.getState().commands[0]
    expect(item.name).toBe('Build v2')
    expect(item.scheduleAnchor).toBe(anchor)
    expect(item.lastRunAt).toBe(1234)
  })

  it('resets the anchor when the schedule changes', () => {
    useSavedCommandStore.getState().add('Build', 'npm run build', 'cmd', { kind: 'daily', time: '08:00' })
    const id = useSavedCommandStore.getState().commands[0].id
    useSavedCommandStore.getState().markRan(id, 1234)
    useSavedCommandStore.getState().update(id, 'Build', 'npm run build', 'cmd', { kind: 'interval', minutes: 10 })
    const item = useSavedCommandStore.getState().commands[0]
    expect(item.schedule).toEqual({ kind: 'interval', minutes: 10 })
    expect(item.lastRunAt).toBeUndefined()
  })

  it('clears schedule fields when the schedule is removed', () => {
    useSavedCommandStore.getState().add('Build', 'npm run build', 'cmd', { kind: 'daily', time: '08:00' })
    const id = useSavedCommandStore.getState().commands[0].id
    useSavedCommandStore.getState().update(id, 'Build', 'npm run build', 'cmd', null)
    const item = useSavedCommandStore.getState().commands[0]
    expect(item.schedule).toBeUndefined()
    expect(item.scheduleAnchor).toBeUndefined()
    expect(item.lastRunAt).toBeUndefined()
  })

  it('removes a command', () => {
    useSavedCommandStore.getState().add('Build', 'npm run build', 'cmd')
    useSavedCommandStore.getState().remove(useSavedCommandStore.getState().commands[0].id)
    expect(useSavedCommandStore.getState().commands).toEqual([])
  })
})

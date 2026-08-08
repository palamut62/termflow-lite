import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types'
import { SettingsStore } from './SettingsStore'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'termflow-settings-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  vi.useRealTimers()
})

const file = (): string => join(dir, 'settings.json')

describe('SettingsStore', () => {
  it('creates defaults when the file does not exist yet', () => {
    const store = new SettingsStore(file())
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(existsSync(file())).toBe(false) // nothing written until update/flush
  })

  it('loads an existing file', () => {
    writeFileSync(file(), JSON.stringify({ ...DEFAULT_SETTINGS, fontSize: 17, themeId: 'nord' }), 'utf-8')
    const store = new SettingsStore(file())
    expect(store.get().fontSize).toBe(17)
    expect(store.get().themeId).toBe('nord')
  })

  it('falls back to defaults on corrupt JSON and leaves the file untouched', () => {
    writeFileSync(file(), '{not json!!', 'utf-8')
    const store = new SettingsStore(file())
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(readFileSync(file(), 'utf-8')).toBe('{not json!!') // load never writes
  })

  it('normalizes missing fields from an incomplete file', () => {
    writeFileSync(file(), JSON.stringify({ themeId: 'light' }), 'utf-8')
    const store = new SettingsStore(file())
    const settings = store.get()
    expect(settings.themeId).toBe('light')
    expect(settings.fontSize).toBe(DEFAULT_SETTINGS.fontSize)
    expect(settings.shortcuts).toEqual(DEFAULT_SETTINGS.shortcuts) // nested deep merge
    expect(settings.profiles).toEqual([]) // profiles is replaced whole
  })

  it('update merges a partial patch and returns a fresh snapshot', () => {
    const store = new SettingsStore(file())
    const next = store.update({ fontSize: 21, themeId: 'gruvbox' })
    expect(next.fontSize).toBe(21)
    expect(next.themeId).toBe('gruvbox')
    expect(next.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily) // untouched fields survive
    expect(store.get().fontSize).toBe(21)
  })

  it('flush writes the file synchronously (atomic temp + rename)', () => {
    const store = new SettingsStore(file())
    store.update({ fontSize: 14 })
    store.flush()
    const onDisk = JSON.parse(readFileSync(file(), 'utf-8')) as AppSettings
    expect(onDisk.fontSize).toBe(14)
    expect(onDisk.windowWidth).toBe(DEFAULT_SETTINGS.windowWidth)
    expect(existsSync(`${file()}.tmp`)).toBe(false) // temp file renamed away
  })

  it('persists debounced writes after the debounce window', () => {
    vi.useFakeTimers()
    const store = new SettingsStore(file())
    store.update({ fontSize: 15 })
    store.update({ fontSize: 16 }) // second update resets the debounce
    vi.advanceTimersByTime(299)
    expect(existsSync(file())).toBe(false) // still within the 300ms window
    vi.advanceTimersByTime(1)
    const onDisk = JSON.parse(readFileSync(file(), 'utf-8')) as AppSettings
    expect(onDisk.fontSize).toBe(16)
  })
})

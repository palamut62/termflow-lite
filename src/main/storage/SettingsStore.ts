import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types'

const WRITE_DEBOUNCE_MS = 300

/**
 * JSON-backed settings persistence (userData/settings.json). Reads are
 * immutable copies; writes are debounced 300ms and atomic (temp + rename).
 */
export class SettingsStore {
  private settings: AppSettings
  private writeTimer: NodeJS.Timeout | null = null

  constructor(private readonly filePath: string) {
    this.settings = this.normalize(this.load())
  }

  private load(): AppSettings {
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return JSON.parse(raw) as AppSettings
    } catch (err) {
      // Missing file (first run) or corrupt JSON: fall back to defaults.
      console.warn(`[settings] could not read ${this.filePath}:`, err)
      return { ...DEFAULT_SETTINGS }
    }
  }

  /** Schema evolution: fill missing/stale fields from DEFAULT_SETTINGS. */
  normalize(settings: AppSettings): AppSettings {
    const merged: AppSettings = { ...DEFAULT_SETTINGS, ...settings }
    // shortcuts is a nested object -> deep merge; profiles is replaced whole.
    merged.shortcuts = { ...DEFAULT_SETTINGS.shortcuts, ...(settings.shortcuts ?? {}) }
    merged.profiles = Array.isArray(settings.profiles) ? settings.profiles : []
    return merged
  }

  /** Immutable snapshot — callers must never mutate the returned object. */
  get(): AppSettings {
    return structuredClone(this.settings)
  }

  update(patch: Partial<AppSettings>): AppSettings {
    this.settings = this.normalize({ ...this.settings, ...patch })
    this.scheduleWrite()
    return this.get()
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flush(), WRITE_DEBOUNCE_MS)
  }

  /** Synchronous write — call from before-quit so nothing is lost. */
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.settings, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.warn('[settings] failed to persist settings:', err)
    }
  }
}

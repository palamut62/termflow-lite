import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { PersistedSession } from '../../shared/types'

const WRITE_DEBOUNCE_MS = 300

/**
 * Açık sekme/split düzeninin kalıcılığı (userData/session.json). Ayarlardan
 * BİLİNÇLİ olarak ayrı bir dosyada tutulur: farklı yaşam döngüsü, bozulursa
 * ayarları da götürmesin. Yazma 300ms debounce'lu ve atomik (temp + rename).
 */
export class SessionStore {
  private session: PersistedSession | null
  private writeTimer: NodeJS.Timeout | null = null

  constructor(private readonly filePath: string) {
    this.session = this.load()
  }

  private load(): PersistedSession | null {
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return sanitizeSession(JSON.parse(raw))
    } catch {
      // Missing file (first run) or corrupt JSON: no session to restore.
      return null
    }
  }

  /** Immutable snapshot — callers must never mutate the returned object. */
  get(): PersistedSession | null {
    return this.session ? structuredClone(this.session) : null
  }

  save(session: PersistedSession): void {
    const clean = sanitizeSession(session)
    if (!clean) return
    this.session = clean
    this.scheduleWrite()
  }

  clear(): void {
    this.session = null
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    try {
      rmSync(this.filePath, { force: true })
    } catch (err) {
      console.warn('[session] failed to clear session:', err)
    }
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
    if (!this.session) return
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.session, null, 2), 'utf-8')
      renameSync(tmp, this.filePath)
    } catch (err) {
      console.warn('[session] failed to persist session:', err)
    }
  }
}

/**
 * Yalnızca serileştirilebilir, beklenen şekle uyan alanları geçirir. Bozuk
 * veya yabancı alanlar (ör. resumeSession) sessizce düşer; şekil hiç tutmuyorsa
 * null döner ve çağıran normal açılışa geri düşer.
 */
export function sanitizeSession(value: unknown): PersistedSession | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Partial<PersistedSession>
  if (raw.version !== 1 || !Array.isArray(raw.tabs)) return null
  const tabs = raw.tabs
    .filter((tab): tab is PersistedSession['tabs'][number] =>
      !!tab && typeof tab === 'object' && typeof tab.id === 'string' && typeof tab.profileId === 'string')
    .map((tab) => ({
      id: tab.id,
      title: typeof tab.title === 'string' ? tab.title : 'Terminal',
      profileId: tab.profileId,
      ...(typeof tab.cwd === 'string' ? { cwd: tab.cwd } : {})
    }))
  if (tabs.length === 0) return null
  const ids = new Set(tabs.map((tab) => tab.id))
  const paneTree = paneTreeMatchesTabs(raw.paneTree, ids) ? raw.paneTree : null
  const splitDirection = raw.splitDirection === 'vertical' || raw.splitDirection === 'horizontal'
    ? raw.splitDirection
    : null
  const ratio = typeof raw.splitRatio === 'number' && Number.isFinite(raw.splitRatio) ? raw.splitRatio : 0.5
  return {
    version: 1,
    tabs,
    activeTabId: typeof raw.activeTabId === 'string' && ids.has(raw.activeTabId) ? raw.activeTabId : tabs[0].id,
    paneTree,
    splitDirection: paneTree ? splitDirection : null,
    splitRatio: Math.max(0.15, Math.min(0.85, ratio)),
    ...(typeof raw.workspaceCwd === 'string' ? { workspaceCwd: raw.workspaceCwd } : {})
  }
}

/**
 * Bozuk dosyaya karşı savunma: pane ağacındaki HER terminal id'si gerçekten
 * sekme listesinde olmalı; olmuyorsa ağaç tamamen reddedilir.
 */
export function paneTreeMatchesTabs(pane: unknown, ids: Set<string>): boolean {
  if (!pane || typeof pane !== 'object') return false
  const node = pane as { type?: unknown; terminalId?: unknown; dir?: unknown; ratio?: unknown; a?: unknown; b?: unknown }
  if (node.type === 'leaf') return typeof node.terminalId === 'string' && ids.has(node.terminalId)
  if (node.type !== 'split') return false
  if (node.dir !== 'vertical' && node.dir !== 'horizontal') return false
  if (typeof node.ratio !== 'number' || !Number.isFinite(node.ratio)) return false
  return paneTreeMatchesTabs(node.a, ids) && paneTreeMatchesTabs(node.b, ids)
}

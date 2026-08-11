import { app, type BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import { IPC } from '../shared/ipc'
import type { AppSettings, UpdateStatus } from '../shared/types'

const { autoUpdater } = electronUpdater

/**
 * Otomatik güncelleme (electron-updater) sarmalayıcısı.
 *
 * Kurallar:
 * - Kullanıcı onayı olmadan indirme yok (`autoDownload = false`); indirilen
 *   paket ancak uygulama kapanırken kurulur (`autoInstallOnAppQuit = true`).
 * - Paketlenmemiş (dev) çalıştırmada updater'a HİÇ dokunulmaz: dev-app-update.yml
 *   olmadığı için autoUpdater exception fırlatır.
 * - Linux'ta yalnızca AppImage kendini güncelleyebilir; .deb paketleri sistem
 *   paket yöneticisiyle güncellenir, updater orada devre dışıdır.
 * - Tüm autoUpdater çağrıları try/catch içindedir: ağ hatası uygulamayı
 *   çökertmez, `state: 'error'` olarak raporlanır.
 */

let getMainWindow: (() => BrowserWindow | null) | null = null
let getAppSettings: (() => AppSettings) | null = null
let initialized = false
let lastStatus: UpdateStatus = { state: 'idle' }

function publish(status: UpdateStatus): void {
  lastStatus = status
  const win = getMainWindow?.() ?? null
  if (win && !win.isDestroyed()) win.webContents.send(IPC.UPDATE_STATUS, status)
}

/** Updater bu ortamda çalışabilir mi? Çalışamazsa nedeni durum olarak döner. */
function unsupportedReason(): UpdateStatus | null {
  if (!app.isPackaged) {
    return { state: 'idle', error: 'Güncelleme yalnızca kurulu sürümde çalışır.' }
  }
  if (process.platform === 'linux' && !process.env.APPIMAGE) {
    return { state: 'idle', error: 'Bu Linux paketi (.deb) paket yöneticisiyle güncellenir.' }
  }
  return null
}

/** Release notes HTML veya blok listesi olabilir — düz metne indirger. */
function normalizeReleaseNotes(notes: unknown): string | undefined {
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((n) => (n && typeof n === 'object' && 'note' in n ? String((n as { note?: unknown }).note ?? '') : ''))
      .filter(Boolean)
      .join('\n\n')
  }
  return undefined
}

export function initUpdater(getWindow: () => BrowserWindow | null, getSettings: () => AppSettings): void {
  getMainWindow = getWindow
  getAppSettings = getSettings
  if (initialized || unsupportedReason()) return
  initialized = true

  try {
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('checking-for-update', () => publish({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      publish({ state: 'available', version: info?.version, releaseNotes: normalizeReleaseNotes(info?.releaseNotes) })
    )
    autoUpdater.on('update-not-available', (info) => publish({ state: 'not-available', version: info?.version }))
    autoUpdater.on('download-progress', (progress) =>
      publish({ state: 'downloading', percent: Math.round(progress?.percent ?? 0) })
    )
    autoUpdater.on('update-downloaded', (info) => publish({ state: 'downloaded', version: info?.version }))
    autoUpdater.on('error', (error) =>
      publish({ state: 'error', error: error instanceof Error ? error.message : String(error) })
    )
  } catch (error) {
    console.warn('[updater] init failed:', error)
  }
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  const unsupported = unsupportedReason()
  if (unsupported) {
    lastStatus = unsupported
    return unsupported
  }
  try {
    const result = await autoUpdater.checkForUpdates()
    const version = result?.updateInfo?.version
    // Gerçek durum event'lerden gelir; burada yalnızca son bilinen durumu döneriz.
    return lastStatus.state === 'idle' && version ? { state: 'checking', version } : lastStatus
  } catch (error) {
    const status: UpdateStatus = {
      state: 'error',
      error: error instanceof Error ? error.message : String(error)
    }
    publish(status)
    return status
  }
}

export async function downloadUpdate(): Promise<void> {
  if (unsupportedReason()) return
  try {
    publish({ state: 'downloading', percent: 0 })
    await autoUpdater.downloadUpdate()
  } catch (error) {
    publish({ state: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

export function quitAndInstall(): void {
  if (unsupportedReason()) return
  try {
    autoUpdater.quitAndInstall()
  } catch (error) {
    publish({ state: 'error', error: error instanceof Error ? error.message : String(error) })
  }
}

/**
 * Açılışta bir kez sessiz kontrol. Pencere yüklendikten SONRA gecikmeli
 * çağrılır ki açılış hızını etkilemesin.
 */
export function maybeAutoCheck(): void {
  if (unsupportedReason()) return
  if (getAppSettings && getAppSettings().autoCheckUpdates === false) return
  void checkForUpdates()
}

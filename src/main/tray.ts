import { app, Menu, Tray, nativeImage } from 'electron'

/**
 * Sistem tepsisi (PRD §30 üslubunda): pencere kapatıldığında uygulama arka
 * planda çalışmaya devam eder; gerçekten çıkmak yalnızca tepsi menüsündeki
 * "Quit" ile mümkündür. Tek bir Tray örneği tutulur — Windows'ta ikinci bir
 * ikon oluşturmak tepside hayalet giriş bırakır.
 */
let tray: Tray | null = null

export interface TrayHandlers {
  /** Pencereyi göster + odakla (gerekirse yeniden oluştur). */
  onShow: () => void
  /** Pencereyi gizle. */
  onHide: () => void
  /** Gerçek çıkış (isQuitting bayrağını set edip app.quit çağırır). */
  onQuit: () => void
  /** Pencere şu an görünür mü — menü etiketi buna göre yazılır. */
  isWindowVisible: () => boolean
}

let handlers: TrayHandlers | null = null

function buildMenu(): Menu {
  const visible = handlers ? handlers.isWindowVisible() : false
  return Menu.buildFromTemplate([
    {
      label: visible ? 'Hide TermFlow Lite' : 'Show TermFlow Lite',
      click: () => {
        if (!handlers) return
        if (handlers.isWindowVisible()) handlers.onHide()
        else handlers.onShow()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit TermFlow Lite',
      click: () => handlers?.onQuit()
    }
  ])
}

/** Menü etiketleri (Show/Hide) pencere durumuna göre tazelenir. */
export function refreshTrayMenu(): void {
  if (!tray || tray.isDestroyed()) return
  tray.setContextMenu(buildMenu())
}

export function isTrayActive(): boolean {
  return tray !== null && !tray.isDestroyed()
}

/**
 * Tepsi ikonunu oluşturur. Zaten varsa hiçbir şey yapmaz (idempotent) —
 * ayarlar her değiştiğinde çağrılabilsin diye.
 */
export function createTray(iconPath: string, next: TrayHandlers): void {
  handlers = next
  if (isTrayActive()) {
    refreshTrayMenu()
    return
  }
  let image = nativeImage.createFromPath(iconPath)
  if (image.isEmpty()) {
    // İkon okunamazsa (paketleme filtresi kaçmış olabilir) tepsi ikonu boş
    // görünür; app ikonuna düşmek görünür bir hedef bırakır.
    image = nativeImage.createFromPath(app.getPath('exe'))
  }
  // Linux/macOS tepsisi küçük ikon bekler; 256px ikon devasa görünür.
  if (process.platform !== 'win32' && !image.isEmpty()) {
    image = image.resize({ width: 22, height: 22 })
  }
  try {
    tray = new Tray(image)
  } catch (error) {
    console.warn('[tray] could not create tray icon:', error)
    tray = null
    return
  }
  tray.setToolTip('TermFlow Lite')
  tray.setContextMenu(buildMenu())
  // Windows/Linux'ta tek tık pencereyi aç-kapat; macOS'ta tık menüyü açar.
  tray.on('click', () => {
    if (!handlers) return
    if (handlers.isWindowVisible()) handlers.onHide()
    else handlers.onShow()
  })
  tray.on('double-click', () => handlers?.onShow())
}

export function destroyTray(): void {
  if (tray && !tray.isDestroyed()) tray.destroy()
  tray = null
}

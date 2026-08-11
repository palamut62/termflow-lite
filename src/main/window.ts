import { screen } from 'electron'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'
import type { TitleBarOverlayPayload } from '../shared/ipc'
import type { AppSettings } from '../shared/types'

/** Windows overlay yüksekliği makul bir aralıkta tutulur. */
const MIN_TITLEBAR_HEIGHT = 28
const MAX_TITLEBAR_HEIGHT = 64
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Tema bilinmeden önceki makul varsayılan (renderer applyTheme'de günceller). */
const FALLBACK_DARK = { color: '#1e1e1e', symbolColor: '#cccccc' }
const FALLBACK_LIGHT = { color: '#ffffff', symbolColor: '#333333' }

/** .tab-bar'ın alt kenarlığı overlay'in dışında kalsın (renderer da aynısını yapar). */
const TAB_BAR_BORDER = 1

function clampHeight(height: number): number {
  if (!Number.isFinite(height)) return MIN_TITLEBAR_HEIGHT
  return Math.round(Math.min(MAX_TITLEBAR_HEIGHT, Math.max(MIN_TITLEBAR_HEIGHT, height)))
}

/**
 * Custom title bar seçenekleri (PRD §68): Windows'ta native pencere düğmeleri
 * Controls Overlay olarak korunur, macOS'ta trafik ışıkları gizli bar üstünde
 * kalır. Linux'ta overlay desteklenmediği için native title bar korunur.
 */
export function titleBarOptions(
  settings: Pick<AppSettings, 'themeId' | 'tabHeight'>
): BrowserWindowConstructorOptions {
  if (process.platform === 'linux') return {}
  if (process.platform !== 'win32') return { titleBarStyle: 'hidden' }
  // Açık temalar için açık fallback (id'ler VS Code temalarından — 'light-plus',
  // 'light-modern', 'solarized-light', 'quiet-light').
  const fallback = /light/.test(settings.themeId) ? FALLBACK_LIGHT : FALLBACK_DARK
  return {
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...fallback, height: clampHeight(settings.tabHeight - TAB_BAR_BORDER) }
  }
}

/**
 * Overlay renklerini canlı günceller (renderer tema uygularken bildirir).
 * Yalnızca Windows'ta anlamlı; geçersiz payload sessizce yok sayılır.
 */
export function applyTitleBarOverlay(win: BrowserWindow, payload: TitleBarOverlayPayload): void {
  if (process.platform !== 'win32') return
  if (!HEX_COLOR.test(payload.color) || !HEX_COLOR.test(payload.symbolColor)) return
  try {
    win.setTitleBarOverlay({
      color: payload.color,
      symbolColor: payload.symbolColor,
      height: clampHeight(payload.height ?? MIN_TITLEBAR_HEIGHT)
    })
  } catch {
    // Overlay desteklenmiyorsa (eski Windows / native bar) sessizce geç.
  }
}

/**
 * Gerçek pencere opaklığı + Windows 11 acrylic blur (PRD §30). `transparent:
 * true` bilinçli olarak kullanılmaz — stabilite görsel detaydan önce gelir
 * (PRD §68). Opaklık %30'un altına inmez ki pencere görünmez kalmasın.
 */
export function applyWindowAppearance(
  win: BrowserWindow,
  settings: Pick<AppSettings, 'opacity' | 'blur'>
): void {
  const raw = Number.isFinite(settings.opacity) ? settings.opacity / 100 : 1
  win.setOpacity(Math.min(1, Math.max(0.3, raw)))
  // setBackgroundMaterial yalnızca Windows'ta (11+ acrylic) anlamlıdır.
  if (process.platform === 'win32') {
    win.setBackgroundMaterial(settings.blur ? 'acrylic' : 'none')
  }
}

/** Quake penceresi ekranın tamamını kaplamasın, görünmez de kalmasın. */
const MIN_QUAKE_PERCENT = 20
const MAX_QUAKE_PERCENT = 100

export function clampQuakePercent(percent: number): number {
  if (!Number.isFinite(percent)) return 50
  return Math.round(Math.min(MAX_QUAKE_PERCENT, Math.max(MIN_QUAKE_PERCENT, percent)))
}

/**
 * Quake (açılır) yerleşimi: pencereyi primary display'in çalışma alanının
 * ÜSTÜNE yapıştırır ve yüksekliği yüzdeye göre ayarlar (PRD §30 üslubunda —
 * konum/boyut settings'e yazılmaz, quake ölçüsü kalıcı olmamalı).
 */
export function applyQuakeBounds(
  win: BrowserWindow,
  settings: Pick<AppSettings, 'quakeHeightPercent'>
): void {
  const { workArea } = screen.getPrimaryDisplay()
  const height = Math.max(200, Math.round((workArea.height * clampQuakePercent(settings.quakeHeightPercent)) / 100))
  win.setBounds({ x: workArea.x, y: workArea.y, width: workArea.width, height })
}

/** Quake kapatılınca normal pencere ölçüsüne dön ve ekranda ortala. */
export function restoreNormalBounds(
  win: BrowserWindow,
  settings: Pick<AppSettings, 'windowWidth' | 'windowHeight'>
): void {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(workArea.width, Math.max(640, settings.windowWidth))
  const height = Math.min(workArea.height, Math.max(400, settings.windowHeight))
  win.setBounds({
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height
  })
}

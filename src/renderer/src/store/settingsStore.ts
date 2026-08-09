import { create } from 'zustand'
import { mergeProfiles } from '../../../shared/profiles'
import { DEFAULT_SETTINGS, type AppSettings, type ShellInfo } from '../../../shared/types'
import { applyThemeToDom, resolveTheme, tabBarSurface } from '../themes/themes'

/** .tab-bar'ın alt kenarlığı (tabs.css: border-bottom: 1px). */
const TAB_BAR_BORDER = 1

/** Shells tried in order when the configured default profile is unavailable. */
const SHELL_PRIORITY: string[] = ['pwsh', 'powershell', 'cmd', 'gitbash', 'wsl', 'bash', 'sh']

/**
 * Resolve the profile used for a brand-new tab: the configured default when it
 * exists (shell id or custom profile id), otherwise the first available shell.
 */
export function resolveDefaultProfileId(settings: AppSettings, shells: ShellInfo[]): string {
  if (
    shells.some((s) => s.id === settings.defaultProfileId) ||
    mergeProfiles(settings.profiles).some((p) => p.id === settings.defaultProfileId)
  ) {
    return settings.defaultProfileId
  }
  return SHELL_PRIORITY.find((id) => shells.some((s) => s.id === id)) ?? shells[0]?.id ?? 'custom'
}

/** Title bar overlay yalnızca #rrggbb kabul eder; #rgb genişletilir. */
function normalizeHex(color: string, fallback: string): string {
  const v = (color ?? '').trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return `#${[...v.slice(1)].map((ch) => ch + ch).join('')}`
  return fallback
}

interface SettingsState {
  settings: AppSettings
  shells: ShellInfo[]
  loaded: boolean
  /** Settings modal açık mı (Ctrl+, / NewTabMenu "Settings" — Faz 6). */
  settingsOpen: boolean
  openSettings(): void
  closeSettings(): void
  /** Açık search bar'ın sahibi tab id; null = kapalı (Faz 7 — kısayol/menü açar). */
  uiSearchTabId: string | null
  openSearch(tabId: string): void
  closeSearch(): void
  /** settings.get + shells.discover; varsayılan tab için defaultProfileId resolve edilir. */
  load(): Promise<void>
  /** Optimistic update: set locally, then persist through window.termflow. */
  update(patch: Partial<AppSettings>): Promise<void>
  /** resolveTheme + applyThemeToDom + UI font ayarları (canlı uygulanır). */
  applyTheme(): void
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  shells: [],
  loaded: false,
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  uiSearchTabId: null,
  openSearch: (tabId) => set({ uiSearchTabId: tabId }),
  closeSearch: () => set({ uiSearchTabId: null }),

  async load() {
    const [settings, shells] = await Promise.all([
      window.termflow.settings.get(),
      window.termflow.shells.discover()
    ])
    // Re-resolve the default profile id against what is actually installed and
    // persist the corrected value once (e.g. defaultProfileId 'powershell' on
    // a machine where only bash exists).
    const resolved = resolveDefaultProfileId(settings, shells)
    const next = resolved !== settings.defaultProfileId ? { ...settings, defaultProfileId: resolved } : settings
    set({ settings: next, shells, loaded: true })
  },

  async update(patch) {
    const next = await window.termflow.settings.set(patch)
    set({ settings: next })
    get().applyTheme()
  },

  applyTheme() {
    const s = get().settings
    const theme = resolveTheme(s)
    applyThemeToDom(theme)
    // Windows Controls Overlay tema rengini alsın (PRD §68). Renkler CSS'e
    // yazılan --tab-background/--tab-foreground ile BİREBİR aynı kaynaktan
    // gelir; yükseklik ise .tab-bar'ın alt kenarlığı hariç tutularak verilir ki
    // sekme barının alt çizgisi overlay bölgesinde de kesintisiz görünsün.
    const surface = tabBarSurface(theme)
    window.termflow?.window?.setTitleBarOverlay({
      color: normalizeHex(surface.background, '#1e1e1e'),
      symbolColor: normalizeHex(surface.foreground, '#cccccc'),
      height: Math.max(1, s.tabHeight - TAB_BAR_BORDER)
    })
    // Letter-spacing + ligatures yalnızca UI metinlerine uygulanır — xterm
    // canvas renderer'ı bu CSS özelliklerini desteklemez (PRD §28).
    const style = document.documentElement.style
    style.setProperty('--ui-letter-spacing', `${s.letterSpacing}px`)
    style.setProperty('--ui-font-ligatures', s.fontLigatures ? 'contextual' : 'none')
    // Window border / corner radius (PRD §30) — .app üzerinde kullanılır.
    style.setProperty('--window-border', s.windowBorder ? '1px solid var(--border-color)' : 'none')
    style.setProperty('--window-corner-radius', `${s.cornerRadius}px`)
  }
}))

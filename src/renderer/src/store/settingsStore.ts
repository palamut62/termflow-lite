import { create } from 'zustand'
import { DEFAULT_SETTINGS, type AppSettings, type ShellInfo } from '../../../shared/types'
import { applyThemeToDom, resolveTheme } from '../themes/themes'

/** Shells tried in order when the configured default profile is unavailable. */
const SHELL_PRIORITY: string[] = ['pwsh', 'powershell', 'cmd', 'gitbash', 'wsl', 'bash', 'sh']

/**
 * Resolve the profile used for a brand-new tab: the configured default when it
 * exists (shell id or custom profile id), otherwise the first available shell.
 */
export function resolveDefaultProfileId(settings: AppSettings, shells: ShellInfo[]): string {
  if (
    shells.some((s) => s.id === settings.defaultProfileId) ||
    settings.profiles.some((p) => p.id === settings.defaultProfileId)
  ) {
    return settings.defaultProfileId
  }
  return SHELL_PRIORITY.find((id) => shells.some((s) => s.id === id)) ?? shells[0]?.id ?? 'custom'
}

interface SettingsState {
  settings: AppSettings
  shells: ShellInfo[]
  loaded: boolean
  /** Settings modal açık mı (Ctrl+, / NewTabMenu "Settings" — Faz 6). */
  settingsOpen: boolean
  openSettings(): void
  closeSettings(): void
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
    applyThemeToDom(resolveTheme(s))
    // Letter-spacing + ligatures yalnızca UI metinlerine uygulanır — xterm
    // canvas renderer'ı bu CSS özelliklerini desteklemez (PRD §28).
    const style = document.documentElement.style
    style.setProperty('--ui-letter-spacing', `${s.letterSpacing}px`)
    style.setProperty('--ui-font-ligatures', s.fontLigatures ? 'contextual' : 'none')
  }
}))

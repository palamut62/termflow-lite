import type { AppSettings } from '../../../shared/types'

export interface NewTerminalOpts {
  cwd?: string
  startupCommand?: string
  bypassArgs?: string
  customShell?: string
  args?: string[]
  name?: string
  env?: Record<string, string>
  cleanProviderEnv?: boolean
  // Sent to the CLI once it looks ready (AI_BANNER_RE match).
  initialPrompt?: string
  /** Always open a new window tab, ignoring the newTerminalTarget setting. */
  forceNewWindow?: boolean
}

// terminalId -> prompt text queued to be typed into the CLI once its startup
// banner is detected in the pty output (module-level: survives across renders,
// one-shot per terminal via delete-on-send).
export const pendingInitialPrompts = new Map<string, string>()

let systemThemeMql: MediaQueryList | null = null
let themeStore: { getState: () => { settings: AppSettings } } | null = null

// Late-bound reference to the assembled store so the system-theme media query
// listener can read the current theme without a circular import.
export function registerThemeStore(store: { getState: () => { settings: AppSettings } }): void {
  themeStore = store
}

// Startup banners of known AI CLIs — used only to detect that the CLI is ready
// so a queued initial prompt can be typed in. Conservative: specific phrases
// only, to avoid firing the prompt on a stray keyword in ordinary output.
export const AI_BANNER_RE = /welcome to claude code|claude code v|▐▛|welcome to codex|openai codex|gemini cli|aider v\d|opencode|goose session|╭─+ *codex/i

// Apply light/dark/system theme by toggling the root data-theme attribute.
export function applyTheme(theme: AppSettings['theme'], transparency: number): void {
  const root = document.documentElement
  const systemDark = (): boolean =>
    window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true
  const LEGACY: Record<string, string> = {
    dark: 'vscode-dark',
    light: 'vscode-light',
    mocha: 'vscode-dark',
    latte: 'vscode-light',
    matcha: 'vscode-light',
    frappe: 'vscode-dark',
    macchiato: 'vscode-dark',
    kanagawa: 'tokyo-night',
    ayu: 'one-dark-pro',
    'rose-pine': 'tokyo-night'
  }
  const resolve = (): void => {
    const raw: string = theme === 'system' ? (systemDark() ? 'vscode-dark' : 'vscode-light') : theme
    const resolved = LEGACY[raw] ?? raw
    const isLight = resolved === 'vscode-light'
    root.setAttribute('data-theme', resolved)
    const opacity = Math.max(45, Math.min(100, transparency))
    root.toggleAttribute('data-transparency', opacity < 100)
    root.style.setProperty('--user-opacity', String(opacity / 100))
    // Keep the native Windows titlebar overlay (min/max/close) in sync with the
    // ACTIVE theme's real palette: read the computed CSS variables instead of
    // hardcoding two colorways, so every theme matches the toolbar.
    const css = getComputedStyle(root)
    const bg = css.getPropertyValue('--bg-panel').trim()
    const symbol = css.getPropertyValue('--text-secondary').trim()
    window.termflow.window.setOverlay(
      bg || (isLight ? '#eaedf3' : '#20242c'),
      symbol || (isLight ? '#4a5162' : '#a0a7b4')
    )
  }
  if (!systemThemeMql && window.matchMedia) {
    systemThemeMql = window.matchMedia('(prefers-color-scheme: dark)')
    systemThemeMql.addEventListener('change', () => {
      if (themeStore?.getState().settings.theme === 'system') resolve()
    })
  }
  resolve()
}

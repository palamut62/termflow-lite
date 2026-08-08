import type { AppSettings } from '../../../shared/types'
import type { Theme, ThemeColors } from './themeTypes'

// Phase 5: full theme set. dark/light (GitHub palettes) ship with Phase 1;
// Dracula/Nord/Tokyo Night/Catppuccin/Gruvbox land now, plus the 'custom'
// entry whose colors come from settings.customTheme at resolve time.

const GITHUB_DARK: ThemeColors = {
  background: '#0d1117',
  foreground: '#e6edf3',
  cursor: '#58a6ff',
  selection: '#264f78',
  black: '#484f58',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc'
}

const GITHUB_LIGHT: ThemeColors = {
  background: '#ffffff',
  foreground: '#1f2328',
  cursor: '#0969da',
  selection: '#acccf9',
  black: '#24292f',
  red: '#cf222e',
  green: '#116329',
  yellow: '#4d2d00',
  blue: '#0969da',
  magenta: '#8250df',
  cyan: '#1b7c83',
  white: '#6e7781',
  brightBlack: '#57606a',
  brightRed: '#a40e26',
  brightGreen: '#1a7f37',
  brightYellow: '#633c01',
  brightBlue: '#218bff',
  brightMagenta: '#a475f9',
  brightCyan: '#3192aa',
  brightWhite: '#8c959f'
}

const DRACULA: ThemeColors = {
  background: '#282a36',
  foreground: '#f8f8f2',
  cursor: '#f8f8f2',
  selection: '#44475a',
  black: '#21222c',
  red: '#ff5555',
  green: '#50fa7b',
  yellow: '#f1fa8c',
  blue: '#bd93f9',
  magenta: '#ff79c6',
  cyan: '#8be9fd',
  white: '#f8f8f2',
  brightBlack: '#6272a4',
  brightRed: '#ff6e6e',
  brightGreen: '#69ff94',
  brightYellow: '#ffffa5',
  brightBlue: '#d6acff',
  brightMagenta: '#ff92df',
  brightCyan: '#a4ffff',
  brightWhite: '#ffffff'
}

const NORD: ThemeColors = {
  background: '#2e3440',
  foreground: '#d8dee9',
  cursor: '#d8dee9',
  selection: '#4c566a',
  black: '#3b4252',
  red: '#bf616a',
  green: '#a3be8c',
  yellow: '#ebcb8b',
  blue: '#81a1c1',
  magenta: '#b48ead',
  cyan: '#88c0d0',
  white: '#e5e9f0',
  brightBlack: '#4c566a',
  brightRed: '#bf616a',
  brightGreen: '#a3be8c',
  brightYellow: '#ebcb8b',
  brightBlue: '#81a1c1',
  brightMagenta: '#b48ead',
  brightCyan: '#8fbcbb',
  brightWhite: '#eceff4'
}

const TOKYO_NIGHT: ThemeColors = {
  background: '#1a1b26',
  foreground: '#c0caf5',
  cursor: '#c0caf5',
  selection: '#33467c',
  black: '#15161e',
  red: '#f7768e',
  green: '#9ece6a',
  yellow: '#e0af68',
  blue: '#7aa2f7',
  magenta: '#bb9af7',
  cyan: '#7dcfff',
  white: '#a9b1d6',
  brightBlack: '#414868',
  brightRed: '#f7768e',
  brightGreen: '#9ece6a',
  brightYellow: '#e0af68',
  brightBlue: '#7aa2f7',
  brightMagenta: '#bb9af7',
  brightCyan: '#7dcfff',
  brightWhite: '#c0caf5'
}

const CATPPUCCIN: ThemeColors = {
  background: '#1e1e2e',
  foreground: '#cdd6f4',
  cursor: '#f5e0dc',
  selection: '#585b70',
  black: '#45475a',
  red: '#f38ba8',
  green: '#a6e3a1',
  yellow: '#f9e2af',
  blue: '#89b4fa',
  magenta: '#cba6f7',
  cyan: '#94e2d5',
  white: '#bac2de',
  brightBlack: '#585b70',
  brightRed: '#f38ba8',
  brightGreen: '#a6e3a1',
  brightYellow: '#f9e2af',
  brightBlue: '#89b4fa',
  brightMagenta: '#cba6f7',
  brightCyan: '#94e2d5',
  brightWhite: '#a6adc8'
}

const GRUVBOX: ThemeColors = {
  background: '#282828',
  foreground: '#ebdbb2',
  cursor: '#ebdbb2',
  selection: '#504945',
  black: '#282828',
  red: '#cc241d',
  green: '#98971a',
  yellow: '#d79921',
  blue: '#458588',
  magenta: '#b16286',
  cyan: '#689d6a',
  white: '#a89984',
  brightBlack: '#928374',
  brightRed: '#fb4934',
  brightGreen: '#b8bb26',
  brightYellow: '#fabd2f',
  brightBlue: '#83a598',
  brightMagenta: '#d3869b',
  brightCyan: '#8ec07c',
  brightWhite: '#ebdbb2'
}

export const THEMES: Theme[] = [
  { id: 'dark', name: 'Dark', colors: GITHUB_DARK },
  { id: 'light', name: 'Light', colors: GITHUB_LIGHT },
  { id: 'dracula', name: 'Dracula', colors: DRACULA },
  { id: 'nord', name: 'Nord', colors: NORD },
  { id: 'tokyo-night', name: 'Tokyo Night', colors: TOKYO_NIGHT },
  { id: 'catppuccin', name: 'Catppuccin', colors: CATPPUCCIN },
  { id: 'gruvbox', name: 'Gruvbox', colors: GRUVBOX },
  // 'custom' kendi paletini settings.customTheme'ten alır (resolveTheme);
  // buradaki colors değeri yalnızca placeholder'dır (customTheme yoksa dark).
  { id: 'custom', name: 'Custom', colors: GITHUB_DARK }
]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/**
 * Resolve the theme actually rendered for the current settings: 'custom' uses
 * settings.customTheme (falling back to the dark palette), unknown ids fall
 * back to dark. All runtime callers use this instead of getTheme().
 */
export function resolveTheme(settings: Pick<AppSettings, 'themeId' | 'customTheme'>): Theme {
  if (settings.themeId === 'custom') {
    const fallback = getTheme('dark').colors
    return { id: 'custom', name: 'Custom', colors: settings.customTheme ? { ...fallback, ...settings.customTheme } : fallback }
  }
  return getTheme(settings.themeId)
}

/** Blend two hex colors; weight 0..1 of the second color. */
function mix(hex1: string, hex2: string, weight: number): string {
  const p = (h: string): [number, number, number] => {
    const n = parseInt(h.replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [r1, g1, b1] = p(hex1)
  const [r2, g2, b2] = p(hex2)
  const ch = (a: number, b: number): number => Math.round(a + (b - a) * weight)
  return `#${[ch(r1, r2), ch(g1, g2), ch(b1, b2)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * Apply a theme to the document as CSS custom properties (PRD §67).
 * Component colors are derived from the palette so nothing hardcodes hex.
 */
export function applyThemeToDom(theme: Theme): void {
  const style = document.documentElement.style
  const c = theme.colors

  style.setProperty('--app-background', c.background)
  style.setProperty('--app-foreground', c.foreground)
  style.setProperty('--tab-background', c.background)
  style.setProperty('--tab-active-background', mix(c.background, c.foreground, 0.06))
  style.setProperty('--tab-foreground', c.foreground)
  style.setProperty('--terminal-background', c.background)
  style.setProperty('--terminal-foreground', c.foreground)
  style.setProperty('--accent-color', c.cursor)
  style.setProperty('--border-color', mix(c.background, c.foreground, 0.18))
  style.setProperty('--selection-background', c.selection)
  style.setProperty('--cursor-color', c.cursor)

  // Terminal ANSI palette (used by xterm via resolveTheme().colors and
  // available to CSS consumers as --term-*).
  style.setProperty('--term-black', c.black)
  style.setProperty('--term-red', c.red)
  style.setProperty('--term-green', c.green)
  style.setProperty('--term-yellow', c.yellow)
  style.setProperty('--term-blue', c.blue)
  style.setProperty('--term-magenta', c.magenta)
  style.setProperty('--term-cyan', c.cyan)
  style.setProperty('--term-white', c.white)
  style.setProperty('--term-bright-black', c.brightBlack)
  style.setProperty('--term-bright-red', c.brightRed)
  style.setProperty('--term-bright-green', c.brightGreen)
  style.setProperty('--term-bright-yellow', c.brightYellow)
  style.setProperty('--term-bright-blue', c.brightBlue)
  style.setProperty('--term-bright-magenta', c.brightMagenta)
  style.setProperty('--term-bright-cyan', c.brightCyan)
  style.setProperty('--term-bright-white', c.brightWhite)
}

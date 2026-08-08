import type { Theme, ThemeColors } from './themeTypes'

// Two themes in Phase 1 (dark + light). Dracula/Nord/Tokyo Night/Catppuccin
// Mocha/Gruvbox land in a later phase — the structure already supports them.

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

export const THEMES: Theme[] = [
  { id: 'dark', name: 'Dark', colors: GITHUB_DARK },
  { id: 'light', name: 'Light', colors: GITHUB_LIGHT }
]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
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

  // Terminal ANSI palette (used by xterm via getTheme().colors and available
  // to CSS consumers as --term-*).
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

import type { AppSettings } from '../../../shared/types'
import type { Theme, ThemeColors, ThemeUiColors } from './themeTypes'

// Tema seti VS Code'un yerleşik temalarını taklit eder (PRD §27): renkler
// ilgili temanın `terminal.background` / `terminal.foreground` /
// `terminalCursor.foreground` / `terminal.selectionBackground` / `terminal.ansi*`
// tanımlarından alınmıştır. VS Code'un ANSI paletini açıkça tanımlamadığı
// temalarda (Abyss, Kimbie Dark, Red, Quiet Light) o temanın workbench
// paletiyle uyumlu değerler kullanılır. 'custom' girdisi paletini
// settings.customTheme'ten alır (resolveTheme).

const DARK_PLUS: ThemeColors = {
  background: '#1e1e1e',
  foreground: '#cccccc',
  cursor: '#ffffff',
  selection: '#264f78',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff'
}

const LIGHT_PLUS: ThemeColors = {
  background: '#ffffff',
  foreground: '#333333',
  cursor: '#000000',
  selection: '#add6ff',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5'
}

// Dark Modern / Light Modern ANSI paleti Dark+ / Light+ ile aynıdır; yalnızca
// yüzey renkleri (terminal.background/foreground) farklıdır.
const DARK_MODERN: ThemeColors = {
  ...DARK_PLUS,
  background: '#181818',
  foreground: '#cccccc',
  cursor: '#ffffff',
  selection: '#264f78'
}

const LIGHT_MODERN: ThemeColors = {
  ...LIGHT_PLUS,
  background: '#f8f8f8',
  foreground: '#3b3b3b',
  cursor: '#000000',
  selection: '#add6ff'
}

const MONOKAI: ThemeColors = {
  background: '#272822',
  foreground: '#f8f8f2',
  cursor: '#f8f8f0',
  selection: '#49483e',
  black: '#333333',
  red: '#f92672',
  green: '#a6e22e',
  yellow: '#f4bf75',
  blue: '#66d9ef',
  magenta: '#ae81ff',
  cyan: '#a1efe4',
  white: '#f8f8f2',
  brightBlack: '#75715e',
  brightRed: '#f92672',
  brightGreen: '#a6e22e',
  brightYellow: '#f4bf75',
  brightBlue: '#66d9ef',
  brightMagenta: '#ae81ff',
  brightCyan: '#a1efe4',
  brightWhite: '#f9f8f5'
}

const MONOKAI_DIMMED: ThemeColors = {
  background: '#1e1e1e',
  foreground: '#c5c8c6',
  cursor: '#c07020',
  selection: '#4a4a76',
  black: '#000000',
  red: '#c4265e',
  green: '#86b42b',
  yellow: '#b3b42b',
  blue: '#6a7ec8',
  magenta: '#8c6bc8',
  cyan: '#56adbc',
  white: '#e0e0e0',
  brightBlack: '#666666',
  brightRed: '#f92672',
  brightGreen: '#a6e22e',
  brightYellow: '#e2e22e',
  brightBlue: '#819aff',
  brightMagenta: '#ae81ff',
  brightCyan: '#66d9ef',
  brightWhite: '#f8f8f8'
}

const SOLARIZED_ANSI = {
  black: '#073642',
  red: '#dc322f',
  green: '#859900',
  yellow: '#b58900',
  blue: '#268bd2',
  magenta: '#d33682',
  cyan: '#2aa198',
  white: '#eee8d5',
  brightBlack: '#002b36',
  brightRed: '#cb4b16',
  brightGreen: '#586e75',
  brightYellow: '#657b83',
  brightBlue: '#839496',
  brightMagenta: '#6c71c4',
  brightCyan: '#93a1a1',
  brightWhite: '#fdf6e3'
} as const

const SOLARIZED_DARK: ThemeColors = {
  background: '#002b36',
  foreground: '#839496',
  cursor: '#93a1a1',
  selection: '#073642',
  ...SOLARIZED_ANSI
}

const SOLARIZED_LIGHT: ThemeColors = {
  background: '#fdf6e3',
  foreground: '#657b83',
  cursor: '#657b83',
  selection: '#eee8d5',
  ...SOLARIZED_ANSI
}

const ABYSS: ThemeColors = {
  background: '#000c18',
  foreground: '#6688cc',
  cursor: '#ddbb88',
  selection: '#770811',
  black: '#000c18',
  red: '#e35b5b',
  green: '#3ad900',
  yellow: '#ddbb88',
  blue: '#2277ff',
  magenta: '#c594c5',
  cyan: '#22aaaa',
  white: '#6688cc',
  brightBlack: '#384887',
  brightRed: '#ff7a7a',
  brightGreen: '#63f76a',
  brightYellow: '#ffd596',
  brightBlue: '#569cd6',
  brightMagenta: '#dda0dd',
  brightCyan: '#44cccc',
  brightWhite: '#c5d5f5'
}

const KIMBIE_DARK: ThemeColors = {
  background: '#221a0f',
  foreground: '#d3af86',
  cursor: '#d3af86',
  selection: '#84613d',
  black: '#221a0f',
  red: '#dc3958',
  green: '#889b4a',
  yellow: '#f79a32',
  blue: '#098bb8',
  magenta: '#98676a',
  cyan: '#5c9c9c',
  white: '#d3af86',
  brightBlack: '#7e602c',
  brightRed: '#f06431',
  brightGreen: '#a8b76a',
  brightYellow: '#f7b95c',
  brightBlue: '#3fadd6',
  brightMagenta: '#c78d8f',
  brightCyan: '#8ec0c0',
  brightWhite: '#e6cfb2'
}

const RED: ThemeColors = {
  background: '#390000',
  foreground: '#f8f8f8',
  cursor: '#970000',
  selection: '#750000',
  black: '#390000',
  red: '#cf6a4c',
  green: '#a8ff60',
  yellow: '#ff9d00',
  blue: '#9b859d',
  magenta: '#e18964',
  cyan: '#7fbfbf',
  white: '#f8f8f8',
  brightBlack: '#a26161',
  brightRed: '#ff7a5c',
  brightGreen: '#ceff9d',
  brightYellow: '#ffc266',
  brightBlue: '#c1b0c3',
  brightMagenta: '#ffb08a',
  brightCyan: '#b3dede',
  brightWhite: '#ffffff'
}

const QUIET_LIGHT: ThemeColors = {
  background: '#f5f5f5',
  foreground: '#333333',
  cursor: '#54494b',
  selection: '#c9d0d9',
  black: '#333333',
  red: '#ab6526',
  green: '#448c27',
  yellow: '#7a3e9d',
  blue: '#4b69c6',
  magenta: '#7a3e9d',
  cyan: '#0e6bb5',
  white: '#777777',
  brightBlack: '#999999',
  brightRed: '#cf5c33',
  brightGreen: '#59ae3c',
  brightYellow: '#a67f2b',
  brightBlue: '#6b86d6',
  brightMagenta: '#9a5cbb',
  brightCyan: '#2f8fd1',
  brightWhite: '#aaaaaa'
}

const TOMORROW_NIGHT_BLUE: ThemeColors = {
  background: '#002451',
  foreground: '#ffffff',
  cursor: '#ffffff',
  selection: '#003f8e',
  black: '#000000',
  red: '#ff9da4',
  green: '#d1f1a9',
  yellow: '#ffeead',
  blue: '#bbdaff',
  magenta: '#ebbbff',
  cyan: '#99ffff',
  white: '#ffffff',
  brightBlack: '#7285b7',
  brightRed: '#ff9da4',
  brightGreen: '#d1f1a9',
  brightYellow: '#ffeead',
  brightBlue: '#bbdaff',
  brightMagenta: '#ebbbff',
  brightCyan: '#99ffff',
  brightWhite: '#ffffff'
}

const HIGH_CONTRAST: ThemeColors = {
  background: '#000000',
  foreground: '#ffffff',
  cursor: '#ffffff',
  selection: '#264f78',
  black: '#000000',
  red: '#cd0000',
  green: '#00cd00',
  yellow: '#cdcd00',
  blue: '#0000ee',
  magenta: '#cd00cd',
  cyan: '#00cdcd',
  white: '#e5e5e5',
  brightBlack: '#7f7f7f',
  brightRed: '#ff0000',
  brightGreen: '#00ff00',
  brightYellow: '#ffff00',
  brightBlue: '#5c5cff',
  brightMagenta: '#ff00ff',
  brightCyan: '#00ffff',
  brightWhite: '#ffffff'
}

// ---- Workbench (UI) paletleri ----
// Değerler VS Code'un gerçek workbench renklerinden alınmıştır (titleBar.*,
// tab.*, editorWidget.*, input.*, button.*, menu.*, statusBar.*). UI bloğu
// verilmeyen temalar için deriveUiColors() terminal paletinden türetir.

const DARK_PLUS_UI: ThemeUiColors = {
  titleBarBackground: '#333333',
  titleBarForeground: '#cccccc',
  tabActiveBackground: '#1e1e1e',
  tabInactiveBackground: '#2d2d2d',
  tabActiveForeground: '#ffffff',
  tabInactiveForeground: '#8f8f8f',
  tabBorder: '#252526',
  activeTabTopBorder: '#0078d4',
  panelBackground: '#1e1e1e',
  sideBarBackground: '#252526',
  inputBackground: '#3c3c3c',
  inputForeground: '#cccccc',
  inputBorder: '#3c3c3c',
  buttonBackground: '#0078d4',
  buttonForeground: '#ffffff',
  buttonHoverBackground: '#026ec1',
  focusBorder: '#0078d4',
  menuBackground: '#252526',
  menuForeground: '#cccccc',
  menuSelectionBackground: '#094771',
  statusBarBackground: '#007acc',
  statusBarForeground: '#ffffff',
  widgetBorder: '#454545'
}

const DARK_MODERN_UI: ThemeUiColors = {
  ...DARK_PLUS_UI,
  titleBarBackground: '#181818',
  tabActiveBackground: '#1f1f1f',
  tabInactiveBackground: '#181818',
  tabBorder: '#2b2b2b',
  panelBackground: '#181818',
  sideBarBackground: '#181818',
  inputBackground: '#313131',
  inputBorder: '#3c3c3c',
  menuBackground: '#1f1f1f',
  statusBarBackground: '#181818',
  statusBarForeground: '#cccccc',
  widgetBorder: '#313131'
}

const LIGHT_PLUS_UI: ThemeUiColors = {
  titleBarBackground: '#dddddd',
  titleBarForeground: '#333333',
  tabActiveBackground: '#ffffff',
  tabInactiveBackground: '#ececec',
  tabActiveForeground: '#333333',
  tabInactiveForeground: '#7f7f7f',
  tabBorder: '#f3f3f3',
  activeTabTopBorder: '#005fb8',
  panelBackground: '#ffffff',
  sideBarBackground: '#f3f3f3',
  inputBackground: '#ffffff',
  inputForeground: '#333333',
  inputBorder: '#cecece',
  buttonBackground: '#005fb8',
  buttonForeground: '#ffffff',
  buttonHoverBackground: '#0258a8',
  focusBorder: '#005fb8',
  menuBackground: '#ffffff',
  menuForeground: '#333333',
  // VS Code açık temada seçimi koyu maviye boyayıp yazıyı beyaza çevirir; bizde
  // menü yazı rengi sabit kaldığı için kontrastı koruyan açık mavi kullanılır.
  menuSelectionBackground: '#d6ebff',
  statusBarBackground: '#005fb8',
  statusBarForeground: '#ffffff',
  widgetBorder: '#c8c8c8'
}

const LIGHT_MODERN_UI: ThemeUiColors = {
  ...LIGHT_PLUS_UI,
  titleBarBackground: '#f8f8f8',
  tabActiveBackground: '#ffffff',
  tabInactiveBackground: '#f8f8f8',
  tabBorder: '#e5e5e5',
  panelBackground: '#f8f8f8',
  sideBarBackground: '#f8f8f8',
  inputBorder: '#cecece',
  statusBarBackground: '#f8f8f8',
  statusBarForeground: '#3b3b3b',
  widgetBorder: '#e5e5e5'
}

const HIGH_CONTRAST_UI: ThemeUiColors = {
  titleBarBackground: '#000000',
  titleBarForeground: '#ffffff',
  tabActiveBackground: '#000000',
  tabInactiveBackground: '#000000',
  tabActiveForeground: '#ffffff',
  tabInactiveForeground: '#ffffff',
  tabBorder: '#6fc3df',
  activeTabTopBorder: '#6fc3df',
  panelBackground: '#000000',
  sideBarBackground: '#000000',
  inputBackground: '#000000',
  inputForeground: '#ffffff',
  inputBorder: '#6fc3df',
  buttonBackground: '#0f4a85',
  buttonForeground: '#ffffff',
  buttonHoverBackground: '#0f4a85',
  focusBorder: '#f38518',
  menuBackground: '#000000',
  menuForeground: '#ffffff',
  menuSelectionBackground: '#0f4a85',
  statusBarBackground: '#000000',
  statusBarForeground: '#ffffff',
  widgetBorder: '#6fc3df'
}

export const DEFAULT_THEME_ID = 'dark-plus'

export const THEMES: Theme[] = [
  { id: 'dark-plus', name: 'Dark+ (default dark)', colors: DARK_PLUS, ui: DARK_PLUS_UI },
  { id: 'light-plus', name: 'Light+ (default light)', colors: LIGHT_PLUS, ui: LIGHT_PLUS_UI },
  { id: 'dark-modern', name: 'Dark Modern', colors: DARK_MODERN, ui: DARK_MODERN_UI },
  { id: 'light-modern', name: 'Light Modern', colors: LIGHT_MODERN, ui: LIGHT_MODERN_UI },
  { id: 'monokai', name: 'Monokai', colors: MONOKAI },
  { id: 'monokai-dimmed', name: 'Monokai Dimmed', colors: MONOKAI_DIMMED },
  { id: 'solarized-dark', name: 'Solarized Dark', colors: SOLARIZED_DARK },
  { id: 'solarized-light', name: 'Solarized Light', colors: SOLARIZED_LIGHT },
  { id: 'abyss', name: 'Abyss', colors: ABYSS },
  { id: 'kimbie-dark', name: 'Kimbie Dark', colors: KIMBIE_DARK },
  { id: 'red', name: 'Red', colors: RED },
  { id: 'quiet-light', name: 'Quiet Light', colors: QUIET_LIGHT },
  { id: 'tomorrow-night-blue', name: 'Tomorrow Night Blue', colors: TOMORROW_NIGHT_BLUE },
  { id: 'high-contrast', name: 'High Contrast', colors: HIGH_CONTRAST, ui: HIGH_CONTRAST_UI },
  // 'custom' kendi paletini settings.customTheme'ten alır (resolveTheme);
  // buradaki colors değeri yalnızca placeholder'dır (customTheme yoksa dark+).
  { id: 'custom', name: 'Custom', colors: DARK_PLUS }
]

/**
 * Eski sürümlerden kalan tema id'leri (settings.json'da yaşayabilir) yeni VS
 * Code temalarına eşlenir; böylece mevcut kurulumlar güncellemeden sonra
 * varsayılana düşüp kullanıcının seçimini kaybetmez.
 */
const LEGACY_THEME_IDS: Record<string, string> = {
  dark: 'dark-plus',
  'github-dark': 'dark-plus',
  light: 'light-plus',
  'github-light': 'light-plus',
  dracula: 'dark-modern',
  nord: 'dark-modern',
  'tokyo-night': 'tomorrow-night-blue',
  catppuccin: 'dark-modern',
  gruvbox: 'monokai-dimmed'
}

export function getTheme(id: string): Theme {
  const mapped = LEGACY_THEME_IDS[id] ?? id
  return (
    THEMES.find((t) => t.id === mapped) ??
    THEMES.find((t) => t.id === DEFAULT_THEME_ID) ??
    THEMES[0]
  )
}

/**
 * Resolve the theme actually rendered for the current settings: 'custom' uses
 * settings.customTheme (falling back to the default palette), unknown ids fall
 * back to the default theme. All runtime callers use this instead of getTheme().
 */
export function resolveTheme(settings: Pick<AppSettings, 'themeId' | 'customTheme'>): Theme {
  if (settings.themeId === 'custom') {
    const fallback = getTheme(DEFAULT_THEME_ID).colors
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

/** Arka planın koyu olup olmadığı (türetmede yön belirler). */
function isDark(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

/**
 * `ui` bloğu vermeyen temalar için workbench renklerini terminal paletinden
 * türetir — türetme mantığı tek yerde yaşasın diye buraya toplanmıştır.
 */
function deriveUiColors(c: ThemeColors): ThemeUiColors {
  const dark = isDark(c.background)
  // Koyu temalarda yüzeyler foreground'a, açık temalarda background'a doğru
  // kaydırılır; böylece her iki yönde de kontrast korunur.
  const shift = (w: number): string => mix(c.background, dark ? c.foreground : c.black, w)
  const accent = c.cursor && c.cursor !== c.background ? c.cursor : c.blue
  return {
    titleBarBackground: shift(0.1),
    titleBarForeground: c.foreground,
    tabActiveBackground: c.background,
    tabInactiveBackground: shift(0.07),
    tabActiveForeground: mix(c.foreground, dark ? '#ffffff' : '#000000', 0.3),
    tabInactiveForeground: mix(c.foreground, c.background, 0.35),
    tabBorder: shift(0.14),
    activeTabTopBorder: accent,
    panelBackground: c.background,
    sideBarBackground: shift(0.05),
    inputBackground: shift(0.12),
    inputForeground: c.foreground,
    inputBorder: shift(0.2),
    buttonBackground: accent,
    buttonForeground: c.background,
    buttonHoverBackground: mix(accent, c.foreground, 0.2),
    focusBorder: accent,
    menuBackground: shift(0.05),
    menuForeground: c.foreground,
    menuSelectionBackground: c.selection,
    statusBarBackground: shift(0.1),
    statusBarForeground: c.foreground,
    widgetBorder: shift(0.22)
  }
}

/** Temanın workbench renkleri: açıkça verilmişse o, yoksa türetilmiş palet. */
export function themeUi(theme: Theme): ThemeUiColors {
  return theme.ui ?? deriveUiColors(theme.colors)
}

/**
 * Tab bar yüzey renkleri. Windows Controls Overlay ile sekme barının aynı
 * pikselleri paylaşması için hem CSS (--tab-background/--tab-foreground) hem de
 * overlay bildirimi (settingsStore.applyTheme) BU tek kaynaktan beslenir —
 * ikisi de tam olarak ui.titleBar* değerlerini kullanır.
 */
export function tabBarSurface(theme: Theme): { background: string; foreground: string } {
  const ui = themeUi(theme)
  return { background: ui.titleBarBackground, foreground: ui.titleBarForeground }
}

/**
 * Apply a theme to the document as CSS custom properties (PRD §67).
 * Component colors are derived from the palette so nothing hardcodes hex.
 */
export function applyThemeToDom(theme: Theme): void {
  const style = document.documentElement.style
  const c = theme.colors
  const ui = themeUi(theme)
  const tab = tabBarSurface(theme)

  style.setProperty('--app-background', ui.panelBackground)
  style.setProperty('--app-foreground', c.foreground)
  style.setProperty('--tab-background', tab.background)
  style.setProperty('--tab-active-background', ui.tabActiveBackground)
  style.setProperty('--tab-inactive-background', ui.tabInactiveBackground)
  style.setProperty('--tab-active-foreground', ui.tabActiveForeground)
  style.setProperty('--tab-inactive-foreground', ui.tabInactiveForeground)
  style.setProperty('--tab-border', ui.tabBorder)
  style.setProperty('--tab-active-top-border', ui.activeTabTopBorder)
  style.setProperty('--tab-foreground', tab.foreground)
  style.setProperty('--terminal-background', c.background)
  style.setProperty('--terminal-foreground', c.foreground)
  style.setProperty('--accent-color', ui.focusBorder)
  style.setProperty('--border-color', ui.widgetBorder)
  style.setProperty('--selection-background', c.selection)
  style.setProperty('--cursor-color', c.cursor)

  // Workbench (PRD §27 / VS Code paritesi)
  style.setProperty('--panel-background', ui.panelBackground)
  style.setProperty('--sidebar-background', ui.sideBarBackground)
  style.setProperty('--input-background', ui.inputBackground)
  style.setProperty('--input-foreground', ui.inputForeground)
  style.setProperty('--input-border', ui.inputBorder)
  style.setProperty('--button-background', ui.buttonBackground)
  style.setProperty('--button-foreground', ui.buttonForeground)
  style.setProperty('--button-hover-background', ui.buttonHoverBackground)
  style.setProperty('--focus-border', ui.focusBorder)
  style.setProperty('--menu-background', ui.menuBackground)
  style.setProperty('--menu-foreground', ui.menuForeground)
  style.setProperty('--menu-selection-background', ui.menuSelectionBackground)
  style.setProperty('--status-bar-background', ui.statusBarBackground)
  style.setProperty('--status-bar-foreground', ui.statusBarForeground)
  style.setProperty('--widget-border', ui.widgetBorder)

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

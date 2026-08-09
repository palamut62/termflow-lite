import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME_ID, getTheme, resolveTheme, THEMES } from './themes'

const HEX = /^#[0-9a-f]{6}$/

const COLOR_KEYS = [
  'background',
  'foreground',
  'cursor',
  'selection',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const

describe('THEMES', () => {
  it('contains the full built-in set in order', () => {
    expect(THEMES.map((t) => t.id)).toEqual([
      'dark-plus',
      'light-plus',
      'dark-modern',
      'light-modern',
      'monokai',
      'monokai-dimmed',
      'solarized-dark',
      'solarized-light',
      'abyss',
      'kimbie-dark',
      'red',
      'quiet-light',
      'tomorrow-night-blue',
      'high-contrast',
      'custom'
    ])
  })

  it('every built-in theme defines all 20 colors as #rrggbb', () => {
    for (const theme of THEMES) {
      for (const key of COLOR_KEYS) {
        expect(theme.colors[key], `${theme.id}.${key}`).toMatch(HEX)
      }
    }
  })
})

describe('resolveTheme', () => {
  it('custom with null customTheme falls back to the default theme', () => {
    const resolved = resolveTheme({ themeId: 'custom', customTheme: null })
    expect(resolved.id).toBe('custom')
    expect(resolved.colors).toEqual(getTheme(DEFAULT_THEME_ID).colors)
  })

  it('custom merges the customTheme over the default fallback', () => {
    const custom = { ...getTheme(DEFAULT_THEME_ID).colors, background: '#000000' }
    const resolved = resolveTheme({ themeId: 'custom', customTheme: custom })
    expect(resolved.colors.background).toBe('#000000')
    expect(resolved.colors.foreground).toBe(getTheme(DEFAULT_THEME_ID).colors.foreground)
  })

  it('unknown theme id falls back to the default theme', () => {
    const resolved = resolveTheme({ themeId: 'does-not-exist', customTheme: null })
    expect(resolved.id).toBe(DEFAULT_THEME_ID)
    expect(resolved.colors).toEqual(getTheme(DEFAULT_THEME_ID).colors)
  })

  // Eski sürümlerden kalan id'ler yeni VS Code temalarına eşlenir.
  it('migrates legacy theme ids', () => {
    expect(resolveTheme({ themeId: 'dark', customTheme: null }).id).toBe('dark-plus')
    expect(resolveTheme({ themeId: 'light', customTheme: null }).id).toBe('light-plus')
    expect(resolveTheme({ themeId: 'github-light', customTheme: null }).id).toBe('light-plus')
  })
})

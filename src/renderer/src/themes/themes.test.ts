import { describe, expect, it } from 'vitest'
import { getTheme, resolveTheme, THEMES } from './themes'

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
      'dark',
      'light',
      'dracula',
      'nord',
      'tokyo-night',
      'catppuccin',
      'gruvbox',
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
  it('custom with null customTheme falls back to dark', () => {
    const resolved = resolveTheme({ themeId: 'custom', customTheme: null })
    expect(resolved.id).toBe('custom')
    expect(resolved.colors).toEqual(getTheme('dark').colors)
  })

  it('custom merges the customTheme over the dark fallback', () => {
    const custom = { ...getTheme('dark').colors, background: '#000000' }
    const resolved = resolveTheme({ themeId: 'custom', customTheme: custom })
    expect(resolved.colors.background).toBe('#000000')
    expect(resolved.colors.foreground).toBe(getTheme('dark').colors.foreground)
  })

  it('unknown theme id falls back to dark', () => {
    const resolved = resolveTheme({ themeId: 'does-not-exist', customTheme: null })
    expect(resolved.id).toBe('dark')
    expect(resolved.colors).toEqual(getTheme('dark').colors)
  })
})

import { describe, expect, it } from 'vitest'
import { shouldShowUpdateBadge, updateBadgeLabel, updateBadgeTitle } from './updateStore'

describe('shouldShowUpdateBadge', () => {
  it('hides for non-actionable states', () => {
    for (const state of ['idle', 'checking', 'not-available', 'error'] as const) {
      expect(shouldShowUpdateBadge({ state }, null)).toBe(false)
    }
  })

  it('shows for available when nothing dismissed', () => {
    expect(shouldShowUpdateBadge({ state: 'available', version: '1.2.0' }, null)).toBe(true)
  })

  it('hides the dismissed version', () => {
    expect(shouldShowUpdateBadge({ state: 'available', version: '1.2.0' }, '1.2.0')).toBe(false)
  })

  it('shows again when a newer version arrives', () => {
    expect(shouldShowUpdateBadge({ state: 'available', version: '1.3.0' }, '1.2.0')).toBe(true)
  })

  it('always shows downloading and downloaded even if dismissed', () => {
    expect(shouldShowUpdateBadge({ state: 'downloading', version: '1.2.0', percent: 40 }, '1.2.0')).toBe(true)
    expect(shouldShowUpdateBadge({ state: 'downloaded', version: '1.2.0' }, '1.2.0')).toBe(true)
  })
})

describe('updateBadgeLabel', () => {
  it('formats each actionable state', () => {
    expect(updateBadgeLabel({ state: 'available', version: '1.2.0' })).toBe('v1.2.0')
    expect(updateBadgeLabel({ state: 'downloading', percent: 42 })).toBe('42%')
    expect(updateBadgeLabel({ state: 'downloaded', version: '1.2.0' })).toBe('Restart')
  })

  it('falls back when fields are missing', () => {
    expect(updateBadgeLabel({ state: 'available' })).toBe('v?')
    expect(updateBadgeLabel({ state: 'downloading' })).toBe('0%')
    expect(updateBadgeLabel({ state: 'idle' })).toBe('')
  })
})

describe('updateBadgeTitle', () => {
  it('describes each actionable state', () => {
    expect(updateBadgeTitle({ state: 'available', version: '1.2.0' })).toBe('Version 1.2.0 is available — click to download')
    expect(updateBadgeTitle({ state: 'downloading', percent: 42 })).toBe('Downloading update… 42%')
    expect(updateBadgeTitle({ state: 'downloaded', version: '1.2.0' })).toBe('Version 1.2.0 is ready — click to restart and install')
    expect(updateBadgeTitle({ state: 'not-available' })).toBe('')
  })
})

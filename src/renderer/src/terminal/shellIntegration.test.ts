import { describe, expect, it } from 'vitest'
import { badgeText, blockStatus, decodeCommandLine, formatDuration } from './shellIntegration'

describe('shell integration helpers', () => {
  it('maps exit codes to block status', () => {
    expect(blockStatus(undefined)).toBe('running')
    expect(blockStatus(0)).toBe('success')
    expect(blockStatus(1)).toBe('error')
    expect(blockStatus(130)).toBe('cancelled')
    expect(blockStatus(-1073741510)).toBe('cancelled')
  })

  it('formats durations compactly', () => {
    expect(formatDuration(450)).toBe('450ms')
    expect(formatDuration(2400)).toBe('2.4s')
    expect(formatDuration(42_000)).toBe('42s')
    expect(formatDuration(125_000)).toBe('2m 5s')
    expect(formatDuration(3_780_000)).toBe('1h 3m')
  })

  it('decodes OSC 633;E command line escapes', () => {
    expect(decodeCommandLine('git commit -m \\x3bfix')).toBe('git commit -m ;fix')
    expect(decodeCommandLine('dir C:\\\\Users')).toBe('dir C:\\Users')
    expect(decodeCommandLine('echo a\\x0ab')).toBe('echo a\nb')
  })

  it('builds badge text from status and duration', () => {
    expect(badgeText(0, 3200)).toBe('✓ 3.2s')
    expect(badgeText(2, 800)).toBe('✗ 2 800ms')
    expect(badgeText(130, 5000)).toBe('⊘ 5.0s')
  })
})

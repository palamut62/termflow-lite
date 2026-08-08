import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  pulseActivity,
  getActivityState,
  clearActivity,
  onActivityChanged,
  hasAttention,
  acknowledgeAttention,
  onAttentionRaised,
  getBusyElapsedMs,
  _resetActivityForTests
} from './terminalActivity'

describe('terminal activity tracker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    _resetActivityForTests()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is idle for a terminal that has never emitted output', () => {
    expect(getActivityState('never')).toBe('idle')
  })

  it('becomes busy on a pulse and returns to idle after the quiet window', () => {
    pulseActivity('t1')
    expect(getActivityState('t1')).toBe('busy')
    vi.advanceTimersByTime(801)
    expect(getActivityState('t1')).toBe('idle')
  })

  it('keeps a terminal busy while output keeps arriving', () => {
    pulseActivity('t1')
    vi.advanceTimersByTime(500)
    pulseActivity('t1')
    vi.advanceTimersByTime(500)
    expect(getActivityState('t1')).toBe('busy')
  })

  it('tracks terminals independently', () => {
    pulseActivity('t1')
    vi.advanceTimersByTime(801)
    pulseActivity('t2')
    expect(getActivityState('t1')).toBe('idle')
    expect(getActivityState('t2')).toBe('busy')
  })

  it('notifies subscribers and stops after unsubscribe', () => {
    const cb = vi.fn()
    const off = onActivityChanged(cb)
    pulseActivity('t1')
    expect(cb).toHaveBeenCalled()
    off()
    cb.mockClear()
    pulseActivity('t2')
    expect(cb).not.toHaveBeenCalled()
  })

  it('does not flag attention for a short (quick-command) busy stretch', () => {
    pulseActivity('t1')
    vi.advanceTimersByTime(801)
    expect(getActivityState('t1')).toBe('idle')
    expect(hasAttention('t1')).toBe(false)
  })

  it('flags attention when a long agent turn finishes', () => {
    pulseActivity('t1')
    // Sustained output for 5s (a real turn), then quiet.
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(500)
      pulseActivity('t1')
    }
    vi.advanceTimersByTime(2000)
    expect(getActivityState('t1')).toBe('idle')
    expect(hasAttention('t1')).toBe(true)
  })

  it('acknowledgeAttention clears the flag', () => {
    pulseActivity('t1')
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(500)
      pulseActivity('t1')
    }
    vi.advanceTimersByTime(2000)
    expect(hasAttention('t1')).toBe(true)
    acknowledgeAttention('t1')
    expect(hasAttention('t1')).toBe(false)
  })

  it('clearActivity wipes attention too', () => {
    pulseActivity('t1')
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(500)
      pulseActivity('t1')
    }
    vi.advanceTimersByTime(2000)
    expect(hasAttention('t1')).toBe(true)
    clearActivity('t1')
    expect(hasAttention('t1')).toBe(false)
  })

  it('fires onAttentionRaised once when a long turn finishes', () => {
    const raised = vi.fn()
    onAttentionRaised(raised)
    pulseActivity('t1')
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(500)
      pulseActivity('t1')
    }
    vi.advanceTimersByTime(2000)
    expect(raised).toHaveBeenCalledTimes(1)
    expect(raised).toHaveBeenCalledWith('t1')
  })

  it('does not fire onAttentionRaised for a short command', () => {
    const raised = vi.fn()
    onAttentionRaised(raised)
    pulseActivity('t1')
    vi.advanceTimersByTime(2000)
    expect(raised).not.toHaveBeenCalled()
  })

  it('reports busy elapsed time while working and null when idle', () => {
    expect(getBusyElapsedMs('t1')).toBeNull()
    pulseActivity('t1')
    vi.advanceTimersByTime(300)
    pulseActivity('t1')
    const e = getBusyElapsedMs('t1')
    expect(e).not.toBeNull()
    // Measured from the turn's first pulse, so ~300ms of continuous work.
    expect(e).toBeGreaterThanOrEqual(300)
    vi.advanceTimersByTime(2000)
    expect(getBusyElapsedMs('t1')).toBeNull()
  })

  it('does not throw when a listener throws', () => {
    const off = onActivityChanged(() => {
      throw new Error('boom')
    })
    expect(() => pulseActivity('t1')).not.toThrow()
    off()
  })
})

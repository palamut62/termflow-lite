import { describe, expect, it } from 'vitest'
import { describeSchedule, isDue, nextRunAt, normalizeSchedule } from './commandSchedule'

const at = (year: number, month: number, day: number, hours = 0, minutes = 0): number =>
  new Date(year, month - 1, day, hours, minutes, 0, 0).getTime()

describe('normalizeSchedule', () => {
  it('accepts valid schedules', () => {
    expect(normalizeSchedule({ kind: 'daily', time: '08:00' })).toEqual({ kind: 'daily', time: '08:00' })
    expect(normalizeSchedule({ kind: 'weekly', time: '9:30', weekday: 1 })).toEqual({ kind: 'weekly', time: '09:30', weekday: 1 })
    expect(normalizeSchedule({ kind: 'interval', minutes: 30 })).toEqual({ kind: 'interval', minutes: 30 })
  })

  it('rejects invalid input', () => {
    expect(normalizeSchedule(null)).toBeNull()
    expect(normalizeSchedule({ kind: 'daily', time: '25:00' })).toBeNull()
    expect(normalizeSchedule({ kind: 'daily', time: '08:70' })).toBeNull()
    expect(normalizeSchedule({ kind: 'weekly', time: '08:00', weekday: 7 })).toBeNull()
    expect(normalizeSchedule({ kind: 'interval', minutes: 0 })).toBeNull()
    expect(normalizeSchedule({ kind: 'interval', minutes: 44641 })).toBeNull()
    expect(normalizeSchedule({ kind: 'interval', minutes: 1.5 })).toBeNull()
    expect(normalizeSchedule({ kind: 'monthly', time: '08:00' })).toBeNull()
  })
})

describe('nextRunAt', () => {
  it('adds the interval to the last run', () => {
    const since = at(2026, 8, 18, 10, 0)
    expect(nextRunAt({ kind: 'interval', minutes: 30 }, since, since)).toBe(at(2026, 8, 18, 10, 30))
  })

  it('returns today for a daily slot still ahead', () => {
    const since = at(2026, 8, 18, 6, 0)
    expect(nextRunAt({ kind: 'daily', time: '08:00' }, since, since)).toBe(at(2026, 8, 18, 8, 0))
  })

  it('rolls a daily slot to the next day when it has passed', () => {
    const since = at(2026, 8, 18, 9, 0)
    expect(nextRunAt({ kind: 'daily', time: '08:00' }, since, since)).toBe(at(2026, 8, 19, 8, 0))
  })

  it('finds the next matching weekday', () => {
    const since = at(2026, 8, 18, 12, 0) // Tuesday
    const next = nextRunAt({ kind: 'weekly', time: '09:30', weekday: 1 }, since, since)
    expect(next).toBe(at(2026, 8, 24, 9, 30))
    expect(new Date(next).getDay()).toBe(1)
  })
})

describe('isDue', () => {
  it('is due after a missed daily run while the app was closed', () => {
    expect(isDue({ kind: 'daily', time: '08:00' }, at(2026, 8, 16, 8, 0), at(2026, 8, 18, 10, 0))).toBe(true)
  })

  it('is not due before the slot', () => {
    expect(isDue({ kind: 'daily', time: '08:00' }, at(2026, 8, 18, 6, 0), at(2026, 8, 18, 7, 0))).toBe(false)
  })

  it('is due for an elapsed interval', () => {
    expect(isDue({ kind: 'interval', minutes: 15 }, at(2026, 8, 18, 10, 0), at(2026, 8, 18, 10, 20))).toBe(true)
    expect(isDue({ kind: 'interval', minutes: 15 }, at(2026, 8, 18, 10, 0), at(2026, 8, 18, 10, 5))).toBe(false)
  })
})

describe('describeSchedule', () => {
  it('describes each kind in English', () => {
    expect(describeSchedule({ kind: 'daily', time: '08:00' })).toBe('Every day at 08:00')
    expect(describeSchedule({ kind: 'weekly', time: '09:30', weekday: 1 })).toBe('Every Monday at 09:30')
    expect(describeSchedule({ kind: 'interval', minutes: 30 })).toBe('Every 30 min')
  })
})

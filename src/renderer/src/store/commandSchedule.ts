export type CommandSchedule =
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; time: string; weekday: number }
  | { kind: 'interval'; minutes: number }

const TIME_PATTERN = /^([0-9]{1,2}):([0-9]{2})$/
const MAX_INTERVAL_MINUTES = 44640
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_MS = 24 * 60 * 60 * 1000

function parseTime(value: unknown): [number, number] | null {
  if (typeof value !== 'string') return null
  const match = TIME_PATTERN.exec(value.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return [hours, minutes]
}

function formatTime(time: string): string {
  const parsed = parseTime(time)
  if (!parsed) return time
  return `${String(parsed[0]).padStart(2, '0')}:${String(parsed[1]).padStart(2, '0')}`
}

export function normalizeSchedule(input: unknown): CommandSchedule | null {
  if (!input || typeof input !== 'object') return null
  const candidate = input as { kind?: unknown; time?: unknown; weekday?: unknown; minutes?: unknown }
  if (candidate.kind === 'daily') {
    const time = parseTime(candidate.time)
    return time ? { kind: 'daily', time: `${String(time[0]).padStart(2, '0')}:${String(time[1]).padStart(2, '0')}` } : null
  }
  if (candidate.kind === 'weekly') {
    const time = parseTime(candidate.time)
    const weekday = candidate.weekday
    if (!time || typeof weekday !== 'number' || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null
    return { kind: 'weekly', time: `${String(time[0]).padStart(2, '0')}:${String(time[1]).padStart(2, '0')}`, weekday }
  }
  if (candidate.kind === 'interval') {
    const minutes = candidate.minutes
    if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes < 1 || minutes > MAX_INTERVAL_MINUTES) return null
    return { kind: 'interval', minutes }
  }
  return null
}

function slotAt(base: number, dayOffset: number, hours: number, minutes: number): number {
  const date = new Date(base + dayOffset * DAY_MS)
  date.setHours(hours, minutes, 0, 0)
  return date.getTime()
}

export function nextRunAt(schedule: CommandSchedule, since: number, now: number): number {
  if (schedule.kind === 'interval') return since + schedule.minutes * 60000
  const parsed = parseTime(schedule.time) ?? [0, 0]
  const targetWeekday = schedule.kind === 'weekly' ? schedule.weekday : null
  for (let offset = 0; offset <= 14; offset += 1) {
    const candidate = slotAt(since, offset, parsed[0], parsed[1])
    if (candidate <= since) continue
    if (targetWeekday !== null && new Date(candidate).getDay() !== targetWeekday) continue
    return candidate
  }
  return since + DAY_MS
}

export function isDue(schedule: CommandSchedule, since: number, now: number): boolean {
  return nextRunAt(schedule, since, now) <= now
}

export function describeSchedule(schedule: CommandSchedule): string {
  if (schedule.kind === 'interval') return `Every ${schedule.minutes} min`
  if (schedule.kind === 'weekly') return `Every ${WEEKDAY_NAMES[schedule.weekday] ?? 'day'} at ${formatTime(schedule.time)}`
  return `Every day at ${formatTime(schedule.time)}`
}

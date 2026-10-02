import { describe, expect, it } from 'vitest'
import type { TerminalTab } from '../../../shared/types'
import { formatClock, taskName, widgetRowState, widgetRows, widgetSummary } from './widgetModel'

const tab = (overrides: Partial<TerminalTab>): TerminalTab => ({
  id: 't1', title: 'PowerShell', profileId: 'powershell', running: true, activity: 'running', startedAt: 1_000, ...overrides
})

describe('widgetRowState', () => {
  it('maps real tab state to the widget contract', () => {
    expect(widgetRowState(tab({ activity: 'running' }))).toBe('running')
    expect(widgetRowState(tab({ activity: 'unread' }))).toBe('running')
    expect(widgetRowState(tab({ activity: 'completed', running: false }))).toBe('done')
    expect(widgetRowState(tab({ activity: 'error', running: false }))).toBe('failed')
  })

  it('only says "needs you" when the agent actually asked', () => {
    expect(widgetRowState(tab({ activity: 'waiting' }), 'approval')).toBe('needs-you')
    expect(widgetRowState(tab({ activity: 'waiting' }), 'question')).toBe('needs-you')
    // A shell sitting at its prompt is idle, not waiting on you.
    expect(widgetRowState(tab({ activity: 'waiting' }))).toBe('idle')
    expect(widgetRowState(tab({ activity: 'waiting' }), 'tool')).toBe('idle')
  })

  it('never claims running without a live process', () => {
    expect(widgetRowState(tab({ activity: 'running', running: false }))).toBe('unknown')
  })
})

describe('formatClock', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(154_000)).toBe('02:34')
    expect(formatClock(3_723_000)).toBe('1:02:03')
    expect(formatClock(-5)).toBe('00:00')
  })
})

describe('taskName', () => {
  it('joins the profile and the working folder', () => {
    expect(taskName('Claude Code', { title: 'x', cwd: 'C:\\work\\build\\' })).toBe('Claude Code / build')
    expect(taskName('Codex', { title: 'x', launchCwd: '/home/u/test' })).toBe('Codex / test')
    expect(taskName('', { title: 'PowerShell' })).toBe('PowerShell')
  })
})

describe('widgetRows', () => {
  const now = 200_000
  const rows = widgetRows(
    [
      tab({ id: 'a', activity: 'running', busySince: 46_000 }),
      tab({ id: 'b', activity: 'completed', running: false, busySince: 10_000, busyUntil: 22_000 }),
      tab({ id: 'c', activity: 'waiting' }),
      tab({ id: 'd', activity: 'error', running: false }),
      tab({ id: 'e', activity: 'waiting' })
    ],
    () => 'Claude Code',
    (id) => (id === 'c' ? 'approval' : undefined),
    now
  )

  it('times running tasks live and freezes finished ones', () => {
    expect(rows[0]).toMatchObject({ state: 'running', label: '* running', time: '02:34' })
    expect(rows[1]).toMatchObject({ state: 'done', label: '✓ done', time: '00:12' })
  })

  it('labels the rest with words, not just colors', () => {
    expect(rows[2]).toMatchObject({ state: 'needs-you', label: '! needs you', time: 'waiting' })
    expect(rows[3]).toMatchObject({ state: 'failed', time: 'failed' })
    expect(rows[4]).toMatchObject({ state: 'idle', time: 'idle' })
  })

  it('counts the summary', () => {
    expect(widgetSummary(rows)).toEqual({ running: 1, done: 1, needsYou: 1, failed: 1 })
  })
})

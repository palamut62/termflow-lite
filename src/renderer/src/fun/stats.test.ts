import { describe, expect, it } from 'vitest'
import {
  achievements,
  busiestHour,
  emptyStats,
  longestStreak,
  parseStats,
  recordAgentSession,
  recordCommand,
  recordFinish,
  toolOf,
  topEntries
} from './stats'

const at = (iso: string): number => new Date(iso).getTime()

describe('usage stats', () => {
  it('keeps only the tool name of a command', () => {
    expect(toolOf('git commit -m "secret message"')).toBe('git')
    expect(toolOf('C:\\Tools\\node.exe server.js')).toBe('node')
    expect(toolOf('sudo apt install foo')).toBe('apt')
    expect(toolOf('npx vitest run')).toBe('vitest')
    expect(toolOf('./build.sh --prod')).toBe('build')
    expect(toolOf('   ')).toBe('')
  })

  it('records commands without storing arguments', () => {
    let s = emptyStats(at('2026-01-01T10:00:00'))
    s = recordCommand(s, 'git push --force token=abc', 'C:\\projects\\termflow', at('2026-01-01T23:30:00'))
    s = recordCommand(s, 'git status', '/home/u/termflow', at('2026-01-02T09:00:00'))
    expect(s.commands).toBe(2)
    expect(s.tools).toEqual({ git: 2 })
    expect(s.projects).toEqual({ termflow: 2 })
    expect(s.hours[23]).toBe(1)
    expect(JSON.stringify(s)).not.toContain('token')
    expect(busiestHour(s.hours)).toBe(9)
  })

  it('tracks failures, durations and the longest command', () => {
    let s = emptyStats()
    s = recordFinish(s, 'npm test', 1, 4000)
    s = recordFinish(s, 'cargo build --release', 0, 90_000)
    expect(s.failures).toBe(1)
    expect(s.timedCommands).toBe(2)
    expect(s.timedMs).toBe(94_000)
    expect(s.longest).toEqual({ tool: 'cargo', durationMs: 90_000 })
  })

  it('finds the longest run of consecutive days', () => {
    expect(longestStreak({ '2026-03-01': 1, '2026-03-02': 4, '2026-03-03': 2, '2026-03-05': 1 })).toBe(3)
    expect(longestStreak({})).toBe(0)
  })

  it('orders top entries by count', () => {
    expect(topEntries({ git: 3, npm: 5, ls: 3 }, 2)).toEqual([['npm', 5], ['git', 3]])
  })

  it('awards achievements from counters', () => {
    let s = emptyStats()
    for (let i = 0; i < 10; i++) s = recordAgentSession(s)
    const earned = achievements(s).filter((a) => a.earned).map((a) => a.id)
    expect(earned).toEqual(['agents'])
  })

  it('recovers from corrupt or foreign storage', () => {
    expect(parseStats('{oops').commands).toBe(0)
    expect(parseStats(JSON.stringify({ version: 2 })).commands).toBe(0)
    expect(parseStats(JSON.stringify({ ...emptyStats(), commands: 7, hours: [1] })).hours).toHaveLength(24)
  })
})

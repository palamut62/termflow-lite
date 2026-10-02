import { describe, expect, it } from 'vitest'
import type { AgentActivity } from '../fun/agentActivity'
import { companionEnergy, companionMood, renderCompanion, type CompanionInput, type CompanionMood } from './companionFrames'

const MOODS: CompanionMood[] = ['working', 'waiting', 'attention', 'done', 'error', 'sleeping']
const COLS = 52
const ROWS = 66
const frame = (mood: CompanionMood, tick: number, input: CompanionInput = {}): ReturnType<typeof renderCompanion> => renderCompanion(mood, tick, COLS, ROWS, 1.71, input)
const text = (mood: CompanionMood, tick: number, input: CompanionInput = {}): string => frame(mood, tick, input).lines.join('\n')
const act = (kind: AgentActivity['kind'], target = ''): AgentActivity => ({ kind, target, at: 0 })

describe('renderCompanion (ASCII scenes)', () => {
  it('fills exactly the requested grid, with a color per cell', () => {
    for (const [cols, rows] of [[COLS, ROWS], [30, 20], [70, 50]]) {
      for (const mood of MOODS) {
        const { lines, colors } = renderCompanion(mood, 9, cols, rows)
        expect(lines).toHaveLength(rows)
        expect(colors).toHaveLength(rows)
        lines.forEach((line, row) => {
          expect(line).toHaveLength(cols)
          expect(colors[row]).toHaveLength(cols)
        })
      }
    }
  })

  it('draws the same critter and props as the pixel scenes, in ASCII', () => {
    const colors = new Set(frame('working', 12, { activity: act('edit', 'app.ts') }).colors.flat())
    for (const token of ['r2', 'r3', 'bg', 'key', 'screen']) expect(colors, token).toContain(token)
  })

  it('types at the keyboard while the agent edits', () => {
    const typing = new Set(Array.from({ length: 10 }, (_, tick) => text('working', tick, { activity: act('edit', 'app.ts') })))
    expect(typing.size).toBeGreaterThan(5)
  })

  it('says what it is doing in an ASCII speech bubble', () => {
    const shown = text('working', 0, { activity: act('edit', 'TerminalView.tsx') })
    expect(shown).toContain('Editing')
    expect(shown).toContain('TerminalView')
    expect(shown).toMatch(/╭─+╮/)
    expect(text('working', 0, { activity: act('test', 'npm test') })).toContain('npm test')
    expect(text('working', 0)).toContain('Thinking')
  })

  it('reacts to the mood: asleep with z, done with confetti, listening while you type', () => {
    expect(text('sleeping', 9)).toMatch(/[zZ]/)
    const party = new Set(frame('done', 9).colors.flat())
    expect(['red', 'gold', 'green', 'blue', 'pink', 'cyan'].filter((c) => party.has(c as never)).length).toBeGreaterThan(2)
    expect(text('working', 0, { activity: act('edit', 'a.ts'), listening: true })).toContain('Listening')
  })

  it('animates the whole panel: the background field moves too', () => {
    const backgroundRow = (tick: number): string => frame('waiting', tick).lines[ROWS - 2]
    expect(new Set(Array.from({ length: 30 }, (_, tick) => backgroundRow(tick))).size).toBeGreaterThan(1)
  })

  it('is deterministic for the same tick', () => {
    for (const mood of MOODS) expect(frame(mood, 42)).toEqual(frame(mood, 42))
  })

  it('animates in every mood', () => {
    for (const mood of MOODS) expect(new Set(Array.from({ length: 40 }, (_, tick) => text(mood, tick))).size, mood).toBeGreaterThan(1)
  })

  it('glides between whole ticks: the background uses fractional time', () => {
    expect(text('working', 10.5)).not.toBe(text('working', 10))
  })

  it('tolerates negative ticks and tiny grids', () => {
    expect(frame('working', -3)).toEqual(frame('working', 0))
    expect(frame('working', Number.NaN)).toEqual(frame('working', 0))
    expect(renderCompanion('waiting', 0, 1, 1).lines.length).toBeGreaterThan(0)
  })
})

describe('companionMood', () => {
  it('maps tab activity while the process runs', () => {
    expect(companionMood(true, 'running')).toBe('working')
    expect(companionMood(true, 'waiting')).toBe('waiting')
    expect(companionMood(true, 'unread')).toBe('attention')
    expect(companionMood(true, 'completed')).toBe('done')
    expect(companionMood(true, 'error')).toBe('error')
  })

  it('sleeps once the process exited, unless it failed', () => {
    expect(companionMood(false, 'running')).toBe('sleeping')
    expect(companionMood(false, 'error')).toBe('error')
  })
})

describe('companionEnergy', () => {
  it('speeds up with output, gently', () => {
    expect(companionEnergy(0)).toBe(1)
    expect(companionEnergy(2_000)).toBeGreaterThan(1.4)
    expect(companionEnergy(10_000_000)).toBe(2)
    expect(companionEnergy(Number.NaN)).toBe(1)
  })
})

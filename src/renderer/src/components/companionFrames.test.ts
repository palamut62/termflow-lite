import { describe, expect, it } from 'vitest'
import {
  PROUD_TICKS,
  TIRED_TICKS,
  companionCaption,
  companionExpression,
  companionMood,
  renderCompanion,
  type CompanionMood
} from './companionFrames'

const MOODS: CompanionMood[] = ['working', 'waiting', 'attention', 'done', 'error', 'sleeping']
const COLS = 46
const ROWS = 30
const frame = (mood: CompanionMood, tick: number): ReturnType<typeof renderCompanion> => renderCompanion(mood, tick, COLS, ROWS)
const text = (mood: CompanionMood, tick: number): string => frame(mood, tick).lines.join('\n')
const eyeCells = (mood: CompanionMood, tick: number): number =>
  frame(mood, tick).colors.flat().filter((color) => color === 'eye' || color === 'glow').length

describe('renderCompanion', () => {
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

  it('animates the whole panel: the background field moves too', () => {
    const backgroundRow = (tick: number): string => frame('waiting', tick).lines[ROWS - 2]
    expect(new Set(Array.from({ length: 30 }, (_, tick) => backgroundRow(tick))).size).toBeGreaterThan(1)
  })

  it('draws one character in the agent color over a dim background', () => {
    const colors = frame('waiting', 5).colors.flat()
    for (const step of ['b0', 'b1', 'b2', 'b3', 'b4', 'bg', 'v']) expect(colors, step).toContain(step)
  })

  it('is deterministic for the same tick', () => {
    for (const mood of MOODS) expect(frame(mood, 42)).toEqual(frame(mood, 42))
  })

  it('animates in every mood', () => {
    for (const mood of MOODS) {
      expect(new Set(Array.from({ length: 40 }, (_, tick) => text(mood, tick))).size, mood).toBeGreaterThan(1)
    }
  })

  it('shows the emotion in the eyes', () => {
    // Wide open when surprised, half shut when tired, thin lines when asleep.
    expect(eyeCells('attention', 5)).toBeGreaterThan(eyeCells('waiting', 5))
    expect(eyeCells('working', TIRED_TICKS + 5)).toBeLessThan(eyeCells('waiting', 5))
    expect(eyeCells('sleeping', 5)).toBeLessThan(eyeCells('working', 5))
  })

  it('reacts with its own extras', () => {
    expect(text('sleeping', 5)).toMatch(/[zZ]/)
    expect(text('attention', 2)).toContain('!')
    const proud = new Set(frame('done', 5).colors.flat())
    expect([...proud].filter((color) => ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'].includes(color)).length).toBeGreaterThan(0)
  })

  it('tolerates negative and fractional ticks and tiny grids', () => {
    expect(frame('working', -3)).toEqual(frame('working', 0))
    expect(frame('done', 2.7)).toEqual(frame('done', 2))
    expect(renderCompanion('waiting', 0, 1, 1).lines.length).toBeGreaterThan(0)
  })
})

describe('companionExpression', () => {
  it('maps moods to expressions, changing over time', () => {
    expect(companionExpression('working', 0)).toBe('focused')
    expect(companionExpression('working', TIRED_TICKS)).toBe('tired')
    expect(companionExpression('waiting', 0)).toBe('waiting')
    expect(companionExpression('attention', 0)).toBe('surprised')
    expect(companionExpression('done', 0)).toBe('proud')
    expect(companionExpression('done', PROUD_TICKS)).toBe('rested')
    expect(companionExpression('error', 0)).toBe('angry')
    expect(companionExpression('sleeping', 0)).toBe('asleep')
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

describe('companionCaption', () => {
  it('follows the expression', () => {
    expect(companionCaption('working', 0)).not.toBe(companionCaption('working', 2))
    expect(companionCaption('working', TIRED_TICKS)).toBe('Still working...')
    expect(companionCaption('done', 0)).toBe('Done!')
    expect(companionCaption('done', PROUD_TICKS)).toBe('All done')
  })
})

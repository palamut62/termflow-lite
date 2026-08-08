import { describe, expect, it } from 'vitest'
import {
  applyMotion,
  clampPos,
  resolveCopyModeKey,
  selectionRange,
  wordBackward,
  wordForward,
  type CopyBuffer
} from './copyMode'

function buf(lines: string[]): CopyBuffer {
  return { lineCount: lines.length, lineText: (row) => lines[row] ?? '' }
}

const sample = buf(['hello world', '', 'foo.bar baz'])

describe('clampPos', () => {
  it('keeps a position inside the buffer', () => {
    expect(clampPos(sample, { row: 99, col: 99 })).toEqual({ row: 2, col: 10 })
    expect(clampPos(sample, { row: -3, col: -4 })).toEqual({ row: 0, col: 0 })
  })

  it('clamps an empty line to column 0', () => {
    expect(clampPos(sample, { row: 1, col: 7 })).toEqual({ row: 1, col: 0 })
  })
})

describe('wordForward', () => {
  it('moves to the start of the next word', () => {
    expect(wordForward(sample, { row: 0, col: 0 })).toEqual({ row: 0, col: 6 })
  })

  it('crosses lines and skips the empty one', () => {
    expect(wordForward(sample, { row: 0, col: 6 })).toEqual({ row: 2, col: 0 })
  })

  it('treats punctuation as its own word', () => {
    expect(wordForward(sample, { row: 2, col: 0 })).toEqual({ row: 2, col: 3 })
    expect(wordForward(sample, { row: 2, col: 3 })).toEqual({ row: 2, col: 4 })
  })

  it('stops at the end of the buffer', () => {
    expect(wordForward(sample, { row: 2, col: 8 })).toEqual({ row: 2, col: 10 })
  })
})

describe('wordBackward', () => {
  it('moves to the start of the current word', () => {
    expect(wordBackward(sample, { row: 0, col: 9 })).toEqual({ row: 0, col: 6 })
  })

  it('moves to the previous word when already at a word start', () => {
    expect(wordBackward(sample, { row: 0, col: 6 })).toEqual({ row: 0, col: 0 })
  })

  it('crosses lines backwards over an empty line', () => {
    expect(wordBackward(sample, { row: 2, col: 0 })).toEqual({ row: 0, col: 6 })
  })

  it('stops at the start of the buffer', () => {
    expect(wordBackward(sample, { row: 0, col: 0 })).toEqual({ row: 0, col: 0 })
  })
})

describe('applyMotion', () => {
  it('moves within a line without wrapping', () => {
    expect(applyMotion(sample, { row: 0, col: 0 }, 'left')).toEqual({ row: 0, col: 0 })
    expect(applyMotion(sample, { row: 0, col: 10 }, 'right')).toEqual({ row: 0, col: 10 })
    expect(applyMotion(sample, { row: 0, col: 3 }, 'right')).toEqual({ row: 0, col: 4 })
  })

  it('handles line start and line end', () => {
    expect(applyMotion(sample, { row: 0, col: 4 }, 'lineStart')).toEqual({ row: 0, col: 0 })
    expect(applyMotion(sample, { row: 0, col: 4 }, 'lineEnd')).toEqual({ row: 0, col: 10 })
    expect(applyMotion(sample, { row: 1, col: 0 }, 'lineEnd')).toEqual({ row: 1, col: 0 })
  })

  it('clamps the column when moving onto a shorter line', () => {
    expect(applyMotion(sample, { row: 0, col: 9 }, 'down')).toEqual({ row: 1, col: 0 })
  })

  it('stops at the buffer edges', () => {
    expect(applyMotion(sample, { row: 0, col: 2 }, 'up')).toEqual({ row: 0, col: 2 })
    expect(applyMotion(sample, { row: 2, col: 2 }, 'down')).toEqual({ row: 2, col: 2 })
    expect(applyMotion(sample, { row: 2, col: 5 }, 'bufferStart')).toEqual({ row: 0, col: 0 })
    expect(applyMotion(sample, { row: 0, col: 5 }, 'bufferEnd')).toEqual({ row: 2, col: 0 })
  })
})

describe('selectionRange', () => {
  it('orders the pair regardless of drag direction', () => {
    const a = { row: 2, col: 1 }
    const b = { row: 0, col: 5 }
    expect(selectionRange(a, b)).toEqual([b, a])
    expect(selectionRange(b, a)).toEqual([b, a])
    expect(selectionRange({ row: 1, col: 4 }, { row: 1, col: 2 })).toEqual([
      { row: 1, col: 2 },
      { row: 1, col: 4 }
    ])
  })
})

describe('resolveCopyModeKey', () => {
  const key = (k: string, mods: Partial<KeyboardEvent> = {}): Parameters<typeof resolveCopyModeKey>[0] => ({
    key: k,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods
  })

  it('maps vi motions', () => {
    expect(resolveCopyModeKey(key('h'))).toEqual({ type: 'move', motion: 'left' })
    expect(resolveCopyModeKey(key('ArrowDown'))).toEqual({ type: 'move', motion: 'down' })
    expect(resolveCopyModeKey(key('w'))).toEqual({ type: 'move', motion: 'wordForward' })
    expect(resolveCopyModeKey(key('$'))).toEqual({ type: 'move', motion: 'lineEnd' })
    expect(resolveCopyModeKey(key('G'))).toEqual({ type: 'move', motion: 'bufferEnd' })
  })

  it('maps scrolling, including Ctrl+B which beats the prefix', () => {
    expect(resolveCopyModeKey(key('u', { ctrlKey: true }))).toEqual({ type: 'scroll', amount: 'halfUp' })
    expect(resolveCopyModeKey(key('b', { ctrlKey: true }))).toEqual({ type: 'scroll', amount: 'pageUp' })
    expect(resolveCopyModeKey(key('f', { ctrlKey: true }))).toEqual({ type: 'scroll', amount: 'pageDown' })
  })

  it('maps selection, copy and exit keys', () => {
    expect(resolveCopyModeKey(key(' '))).toEqual({ type: 'beginSelection' })
    expect(resolveCopyModeKey(key('v'))).toEqual({ type: 'beginSelection' })
    expect(resolveCopyModeKey(key('y'))).toEqual({ type: 'copySelection' })
    expect(resolveCopyModeKey(key('Enter'))).toEqual({ type: 'copySelection' })
    expect(resolveCopyModeKey(key('Escape'))).toEqual({ type: 'cancel' })
    expect(resolveCopyModeKey(key('q'))).toEqual({ type: 'exit' })
  })

  it('maps search keys', () => {
    expect(resolveCopyModeKey(key('/'))).toEqual({ type: 'search', direction: 'forward' })
    expect(resolveCopyModeKey(key('?'))).toEqual({ type: 'search', direction: 'backward' })
    expect(resolveCopyModeKey(key('n'))).toEqual({ type: 'findNext' })
    expect(resolveCopyModeKey(key('N'))).toEqual({ type: 'findPrevious' })
  })

  it('ignores unbound keys and modifier combos', () => {
    expect(resolveCopyModeKey(key('z'))).toBeNull()
    expect(resolveCopyModeKey(key('a', { ctrlKey: true }))).toBeNull()
    expect(resolveCopyModeKey(key('h', { altKey: true }))).toBeNull()
  })
})

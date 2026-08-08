import { describe, expect, it } from 'vitest'
import type { PaneNode } from '../../shared/types'
import {
  buildTiledPane,
  closePane,
  computePaneRects,
  countLeaves,
  findLeafPath,
  findPaneInDirection,
  getLeafTerminalIds,
  setPaneRatio,
  splitPane
} from './paneUtils'

const root: PaneNode = { type: 'leaf', terminalId: 'a', title: 'A' }

describe('pane tree operations', () => {
  it('splits, locates and collapses panes without losing the survivor', () => {
    const split = splitPane(root, 'a', 'horizontal', 'A', 'b', 'B')
    expect(getLeafTerminalIds(split)).toEqual(['a', 'b'])
    expect(countLeaves(split)).toBe(2)
    expect(findLeafPath(split, 'b')).toEqual([1])
    expect(closePane(split, 'a')).toEqual({ type: 'leaf', terminalId: 'b', title: 'B' })
  })

  it('clamps pane ratios to usable bounds', () => {
    const split = splitPane(root, 'a', 'vertical', 'A', 'b', 'B')
    expect(setPaneRatio(split, [], 0.01)).toMatchObject({ ratio: 0.15 })
    expect(setPaneRatio(split, [], 0.99)).toMatchObject({ ratio: 0.85 })
  })
})

// Quad layout: two columns, each split into a top and a bottom pane.
const quad: PaneNode = {
  type: 'split',
  dir: 'horizontal',
  ratio: 0.5,
  a: {
    type: 'split',
    dir: 'vertical',
    ratio: 0.5,
    a: { type: 'leaf', terminalId: 'tl', title: 'TL' },
    b: { type: 'leaf', terminalId: 'bl', title: 'BL' }
  },
  b: {
    type: 'split',
    dir: 'vertical',
    ratio: 0.5,
    a: { type: 'leaf', terminalId: 'tr', title: 'TR' },
    b: { type: 'leaf', terminalId: 'br', title: 'BR' }
  }
}

describe('computePaneRects', () => {
  it('returns the whole area for a single leaf', () => {
    expect(computePaneRects(root)).toEqual([{ terminalId: 'a', rect: { x: 0, y: 0, w: 1, h: 1 } }])
  })

  it('splits width for horizontal and height for vertical splits', () => {
    const cols = splitPane(root, 'a', 'horizontal', 'A', 'b', 'B') as PaneNode
    expect(computePaneRects(cols)).toEqual([
      { terminalId: 'a', rect: { x: 0, y: 0, w: 0.5, h: 1 } },
      { terminalId: 'b', rect: { x: 0.5, y: 0, w: 0.5, h: 1 } }
    ])
    const rows = setPaneRatio(splitPane(root, 'a', 'vertical', 'A', 'b', 'B'), [], 0.25)
    expect(computePaneRects(rows)).toEqual([
      { terminalId: 'a', rect: { x: 0, y: 0, w: 1, h: 0.25 } },
      { terminalId: 'b', rect: { x: 0, y: 0.25, w: 1, h: 0.75 } }
    ])
  })

  it('lays out a four pane tree as a 2x2 grid', () => {
    expect(computePaneRects(quad).map((entry) => entry.terminalId)).toEqual(['tl', 'bl', 'tr', 'br'])
    expect(computePaneRects(quad).find((entry) => entry.terminalId === 'br')?.rect)
      .toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 })
  })
})

describe('findPaneInDirection', () => {
  it('moves h/j/k/l between grid panes', () => {
    expect(findPaneInDirection(quad, 'tl', 'right')).toBe('tr')
    expect(findPaneInDirection(quad, 'tl', 'down')).toBe('bl')
    expect(findPaneInDirection(quad, 'br', 'left')).toBe('bl')
    expect(findPaneInDirection(quad, 'br', 'up')).toBe('tr')
  })

  it('returns null at the edges and for unknown panes', () => {
    expect(findPaneInDirection(quad, 'tl', 'left')).toBeNull()
    expect(findPaneInDirection(quad, 'tl', 'up')).toBeNull()
    expect(findPaneInDirection(quad, 'ghost', 'down')).toBeNull()
    expect(findPaneInDirection(root, 'a', 'right')).toBeNull()
  })

  it('prefers the nearest pane in a three pane layout', () => {
    // Left column full height, right column split into two rows.
    const tri: PaneNode = {
      type: 'split',
      dir: 'horizontal',
      ratio: 0.5,
      a: { type: 'leaf', terminalId: 'left', title: 'L' },
      b: {
        type: 'split',
        dir: 'vertical',
        ratio: 0.5,
        a: { type: 'leaf', terminalId: 'rtop', title: 'RT' },
        b: { type: 'leaf', terminalId: 'rbot', title: 'RB' }
      }
    }
    // Both right panes are equally far horizontally; the tie breaks on the
    // smaller vertical offset, and either one is a legal tmux target.
    expect(['rtop', 'rbot']).toContain(findPaneInDirection(tri, 'left', 'right'))
    expect(findPaneInDirection(tri, 'rtop', 'left')).toBe('left')
    expect(findPaneInDirection(tri, 'rtop', 'down')).toBe('rbot')
    expect(findPaneInDirection(tri, 'rbot', 'up')).toBe('rtop')
  })
})

describe('buildTiledPane', () => {
  const leaves = (n: number): Array<{ terminalId: string; title: string }> =>
    Array.from({ length: n }, (_, i) => ({ terminalId: `t${i}`, title: `T${i}` }))

  it('returns null for an empty list and a bare leaf for one terminal', () => {
    expect(buildTiledPane([])).toBeNull()
    expect(buildTiledPane(leaves(1))).toEqual({ type: 'leaf', terminalId: 't0', title: 'T0' })
  })

  it('keeps every terminal exactly once and alternates split direction', () => {
    const tree = buildTiledPane(leaves(4))!
    expect(getLeafTerminalIds(tree)).toEqual(['t0', 't1', 't2', 't3'])
    expect(tree.type === 'split' && tree.dir).toBe('vertical')
    expect(tree.type === 'split' && tree.a.type === 'split' && tree.a.dir).toBe('horizontal')
  })

  it('stays balanced for an odd count', () => {
    const tree = buildTiledPane(leaves(5))!
    expect(countLeaves(tree)).toBe(5)
    // A balanced 5-pane tree is never deeper than ceil(log2(5)) + 1 levels.
    const rects = computePaneRects(tree)
    expect(rects).toHaveLength(5)
    const area = rects.reduce((sum, r) => sum + r.rect.w * r.rect.h, 0)
    expect(area).toBeCloseTo(1, 5)
  })
})

import { describe, expect, it } from 'vitest'
import { buildTiledPane, dropEdgeFor, movePane, paneTerminalIds, swapPaneTerminals, type PaneNode } from './paneUtils'

const leaf = (id: string): PaneNode => ({ type: 'leaf', terminalId: id })
const split = (dir: 'vertical' | 'horizontal', a: PaneNode, b: PaneNode): PaneNode => ({ type: 'split', dir, ratio: 0.5, a, b })

describe('dropEdgeFor', () => {
  it('treats the inner half as a swap target', () => {
    expect(dropEdgeFor(50, 50, 100, 100)).toBe('center')
    expect(dropEdgeFor(30, 70, 100, 100)).toBe('center')
  })

  it('picks the nearest border outside the center', () => {
    expect(dropEdgeFor(5, 50, 100, 100)).toBe('left')
    expect(dropEdgeFor(95, 50, 100, 100)).toBe('right')
    expect(dropEdgeFor(50, 5, 100, 100)).toBe('top')
    expect(dropEdgeFor(50, 95, 100, 100)).toBe('bottom')
  })

  it('resolves a corner to its closer axis', () => {
    // Nearer the top border (2%) than the left one (10%).
    expect(dropEdgeFor(10, 2, 100, 100)).toBe('top')
    expect(dropEdgeFor(2, 10, 100, 100)).toBe('left')
  })

  it('degrades safely for a zero-sized pane', () => {
    expect(dropEdgeFor(0, 0, 0, 0)).toBe('center')
  })
})

describe('swapPaneTerminals', () => {
  it('exchanges two leaves and keeps the shape', () => {
    const tree = split('vertical', leaf('a'), split('horizontal', leaf('b'), leaf('c')))
    const swapped = swapPaneTerminals(tree, 'a', 'c')
    expect(paneTerminalIds(swapped)).toEqual(['c', 'b', 'a'])
    expect(swapped).toMatchObject({ type: 'split', dir: 'vertical', b: { dir: 'horizontal' } })
  })
})

describe('movePane', () => {
  const three = split('vertical', leaf('a'), split('horizontal', leaf('b'), leaf('c')))

  it('joins a pane to the right of its target', () => {
    const moved = movePane(three, 'a', 'c', 'right')
    // 'a' left its split, which collapsed to the remaining subtree.
    expect(paneTerminalIds(moved)).toEqual(['b', 'c', 'a'])
    expect(moved).toEqual(split('horizontal', leaf('b'), split('vertical', leaf('c'), leaf('a'))))
  })

  it('joins a pane to the left of its target', () => {
    expect(movePane(three, 'a', 'c', 'left')).toEqual(
      split('horizontal', leaf('b'), split('vertical', leaf('a'), leaf('c')))
    )
  })

  it('stacks a pane above and below its target', () => {
    expect(movePane(three, 'c', 'a', 'top')).toEqual(
      split('vertical', split('horizontal', leaf('c'), leaf('a')), leaf('b'))
    )
    expect(movePane(three, 'c', 'a', 'bottom')).toEqual(
      split('vertical', split('horizontal', leaf('a'), leaf('c')), leaf('b'))
    )
  })

  it('swaps in place on a center drop, leaving the layout untouched', () => {
    const moved = movePane(three, 'a', 'c', 'center')
    expect(moved).toEqual(split('vertical', leaf('c'), split('horizontal', leaf('b'), leaf('a'))))
  })

  it('never loses or duplicates a terminal', () => {
    const tree = buildTiledPane(['a', 'b', 'c', 'd', 'e'], 'vertical')!
    for (const edge of ['left', 'right', 'top', 'bottom', 'center'] as const) {
      const ids = paneTerminalIds(movePane(tree, 'e', 'b', edge))
      expect([...ids].sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    }
  })

  it('is a no-op for unknown ids or a self-drop', () => {
    expect(movePane(three, 'a', 'a', 'left')).toBe(three)
    expect(movePane(three, 'zz', 'a', 'left')).toBe(three)
    expect(movePane(three, 'a', 'zz', 'left')).toBe(three)
  })

  it('is a no-op on a single-leaf tree', () => {
    const single = leaf('a')
    expect(movePane(single, 'a', 'a', 'left')).toBe(single)
  })

  it('handles a two-pane tree by re-tiling it', () => {
    const pair = split('vertical', leaf('a'), leaf('b'))
    expect(movePane(pair, 'a', 'b', 'bottom')).toEqual(split('horizontal', leaf('b'), leaf('a')))
  })
})

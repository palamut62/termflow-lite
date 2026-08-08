import type { PaneNode, LeafPane, SplitPane } from '../../shared/types'

/** Collect all leaf terminalIds from a pane tree. */
export function getLeafTerminalIds(pane: PaneNode): string[] {
  if (pane.type === 'leaf') return [pane.terminalId]
  return [...getLeafTerminalIds(pane.a), ...getLeafTerminalIds(pane.b)]
}

/** Get the active terminalId from a node, accounting for pane tree. */
export function getActiveTerminalId(
  activePaneId: string | undefined,
  panes: PaneNode | undefined,
  terminalId: string | undefined
): string | undefined {
  if (activePaneId) return activePaneId
  if (panes) {
    const leaves = getLeafTerminalIds(panes)
    return leaves[0]
  }
  return terminalId
}

/** Count total leaf terminals in a pane tree. */
export function countLeaves(pane: PaneNode): number {
  if (pane.type === 'leaf') return 1
  return countLeaves(pane.a) + countLeaves(pane.b)
}

/** Find a leaf by terminalId in a pane tree. Returns path array or null. */
export function findLeafPath(pane: PaneNode, terminalId: string): number[] | null {
  if (pane.type === 'leaf') {
    return pane.terminalId === terminalId ? [] : null
  }
  const pathA = findLeafPath(pane.a, terminalId)
  if (pathA) return [0, ...pathA]
  const pathB = findLeafPath(pane.b, terminalId)
  if (pathB) return [1, ...pathB]
  return null
}

/** Split a leaf pane into a split with two leaves. */
export function splitPane(
  pane: PaneNode,
  terminalIdToSplit: string,
  dir: 'horizontal' | 'vertical',
  existingTitle: string,
  newTermId: string,
  newTitle: string
): PaneNode {
  if (pane.type === 'leaf') {
    if (pane.terminalId !== terminalIdToSplit) return pane
    return {
      type: 'split',
      dir,
      ratio: 0.5,
      a: { type: 'leaf', terminalId: pane.terminalId, title: existingTitle },
      b: { type: 'leaf', terminalId: newTermId, title: newTitle }
    }
  }
  return {
    ...pane,
    a: splitPane(pane.a, terminalIdToSplit, dir, existingTitle, newTermId, newTitle),
    b: splitPane(pane.b, terminalIdToSplit, dir, existingTitle, newTermId, newTitle)
  }
}

/**
 * Build a balanced tiled pane tree out of a flat list of terminals, the way
 * tmux's `select-layout tiled` does: halve the list at every level and
 * alternate the split direction so the result stays close to a grid.
 */
export function buildTiledPane(leaves: Array<{ terminalId: string; title: string }>, dir: 'horizontal' | 'vertical' = 'vertical'): PaneNode | null {
  if (leaves.length === 0) return null
  if (leaves.length === 1) return { type: 'leaf', terminalId: leaves[0].terminalId, title: leaves[0].title }
  const mid = Math.ceil(leaves.length / 2)
  const next = dir === 'vertical' ? 'horizontal' : 'vertical'
  return {
    type: 'split',
    dir,
    ratio: 0.5,
    a: buildTiledPane(leaves.slice(0, mid), next)!,
    b: buildTiledPane(leaves.slice(mid), next)!
  }
}

/** Close a leaf pane; collapses splits that would have only one child. */
export function closePane(pane: PaneNode, terminalIdToClose: string): PaneNode | null {
  if (pane.type === 'leaf') {
    return pane.terminalId === terminalIdToClose ? null : pane
  }
  const newA = closePane(pane.a, terminalIdToClose)
  const newB = closePane(pane.b, terminalIdToClose)
  if (!newA && !newB) return null
  if (!newA) return newB!
  if (!newB) return newA!
  return { ...pane, a: newA, b: newB }
}

/** Update ratio of a split pane at the given path. */
export function setPaneRatio(pane: PaneNode, path: number[], ratio: number): PaneNode {
  if (path.length === 0) {
    if (pane.type === 'split') return { ...pane, ratio: Math.max(0.15, Math.min(0.85, ratio)) }
    return pane
  }
  if (pane.type === 'leaf') return pane
  const [head, ...tail] = path
  if (head === 0) return { ...pane, a: setPaneRatio(pane.a, tail, ratio) }
  return { ...pane, b: setPaneRatio(pane.b, tail, ratio) }
}

export interface PaneRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PaneRectEntry {
  terminalId: string
  rect: PaneRect
}

/**
 * Lay the pane tree out inside `rect` (normalized unit square by default) and
 * return one rectangle per leaf. Pure geometry — used for directional pane
 * navigation (tmux select-pane -L/-D/-U/-R).
 */
export function computePaneRects(
  pane: PaneNode,
  rect: PaneRect = { x: 0, y: 0, w: 1, h: 1 }
): PaneRectEntry[] {
  if (pane.type === 'leaf') return [{ terminalId: pane.terminalId, rect }]
  const split = pane as SplitPane
  if (split.dir === 'horizontal') {
    const wA = rect.w * split.ratio
    return [
      ...computePaneRects(split.a, { ...rect, w: wA }),
      ...computePaneRects(split.b, { ...rect, x: rect.x + wA, w: rect.w - wA })
    ]
  }
  const hA = rect.h * split.ratio
  return [
    ...computePaneRects(split.a, { ...rect, h: hA }),
    ...computePaneRects(split.b, { ...rect, y: rect.y + hA, h: rect.h - hA })
  ]
}

export type PaneDirection = 'left' | 'right' | 'up' | 'down'

/**
 * Pick the neighbouring pane in the given direction: among panes whose center
 * lies beyond the current center on the primary axis, take the closest one,
 * breaking ties by the smallest perpendicular offset.
 */
export function findPaneInDirection(
  pane: PaneNode,
  currentTerminalId: string,
  dir: PaneDirection
): string | null {
  const rects = computePaneRects(pane)
  const current = rects.find((entry) => entry.terminalId === currentTerminalId)
  if (!current) return null
  const center = (r: PaneRect): { cx: number; cy: number } => ({ cx: r.x + r.w / 2, cy: r.y + r.h / 2 })
  const from = center(current.rect)
  const horizontal = dir === 'left' || dir === 'right'
  const sign = dir === 'left' || dir === 'up' ? -1 : 1
  const EPS = 1e-6

  let best: { terminalId: string; primary: number; perp: number } | null = null
  for (const entry of rects) {
    if (entry.terminalId === currentTerminalId) continue
    const to = center(entry.rect)
    const primaryDelta = (horizontal ? to.cx - from.cx : to.cy - from.cy) * sign
    if (primaryDelta <= EPS) continue
    // Like tmux: only panes that share a band on the perpendicular axis with
    // the current pane are reachable in that direction.
    const aStart = horizontal ? current.rect.y : current.rect.x
    const aEnd = aStart + (horizontal ? current.rect.h : current.rect.w)
    const bStart = horizontal ? entry.rect.y : entry.rect.x
    const bEnd = bStart + (horizontal ? entry.rect.h : entry.rect.w)
    if (Math.min(aEnd, bEnd) - Math.max(aStart, bStart) <= EPS) continue
    const perp = Math.abs(horizontal ? to.cy - from.cy : to.cx - from.cx)
    if (!best || primaryDelta < best.primary - EPS || (Math.abs(primaryDelta - best.primary) <= EPS && perp < best.perp)) {
      best = { terminalId: entry.terminalId, primary: primaryDelta, perp }
    }
  }
  return best?.terminalId ?? null
}

/** Replace a leaf at the given path (for tab switching). */
export function getLeafAtPath(pane: PaneNode, path: number[]): LeafPane | null {
  if (path.length === 0) return pane.type === 'leaf' ? pane : null
  if (pane.type === 'leaf') return null
  const [head, ...tail] = path
  return head === 0 ? getLeafAtPath(pane.a, tail) : getLeafAtPath(pane.b, tail)
}

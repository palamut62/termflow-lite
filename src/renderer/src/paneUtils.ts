export type PaneNode =
  | { type: 'leaf'; terminalId: string }
  | { type: 'split'; dir: 'vertical' | 'horizontal'; ratio: number; a: PaneNode; b: PaneNode }

export function paneTerminalIds(pane: PaneNode): string[] {
  return pane.type === 'leaf' ? [pane.terminalId] : [...paneTerminalIds(pane.a), ...paneTerminalIds(pane.b)]
}

/**
 * Kalıcı oturumdan gelen ağacın şeklini ve id'lerini doğrular: her leaf gerçek
 * bir sekmeye işaret etmeli. Bozuk dosyaya karşı savunma — tutmazsa ağaç
 * tamamen reddedilir (paneTree null).
 */
export function isValidPaneTree(pane: unknown, ids: Set<string>): pane is PaneNode {
  if (!pane || typeof pane !== 'object') return false
  const node = pane as { type?: unknown; terminalId?: unknown; dir?: unknown; ratio?: unknown; a?: unknown; b?: unknown }
  if (node.type === 'leaf') return typeof node.terminalId === 'string' && ids.has(node.terminalId)
  if (node.type !== 'split') return false
  if (node.dir !== 'vertical' && node.dir !== 'horizontal') return false
  if (typeof node.ratio !== 'number' || !Number.isFinite(node.ratio)) return false
  return isValidPaneTree(node.a, ids) && isValidPaneTree(node.b, ids)
}

export function buildTiledPane(ids: string[], dir: 'vertical' | 'horizontal'): PaneNode | null {
  if (ids.length === 0) return null
  if (ids.length === 1) return { type: 'leaf', terminalId: ids[0] }
  const middle = Math.ceil(ids.length / 2)
  const next = dir === 'vertical' ? 'horizontal' : 'vertical'
  return { type: 'split', dir, ratio: 0.5, a: buildTiledPane(ids.slice(0, middle), next)!, b: buildTiledPane(ids.slice(middle), next)! }
}

export function splitPane(pane: PaneNode, targetId: string, newId: string, dir: 'vertical' | 'horizontal'): PaneNode {
  if (pane.type === 'leaf') {
    return pane.terminalId === targetId
      ? { type: 'split', dir, ratio: 0.5, a: pane, b: { type: 'leaf', terminalId: newId } }
      : pane
  }
  return { ...pane, a: splitPane(pane.a, targetId, newId, dir), b: splitPane(pane.b, targetId, newId, dir) }
}

export function closePane(pane: PaneNode, targetId: string): PaneNode | null {
  if (pane.type === 'leaf') return pane.terminalId === targetId ? null : pane
  const a = closePane(pane.a, targetId)
  const b = closePane(pane.b, targetId)
  if (!a) return b
  if (!b) return a
  return { ...pane, a, b }
}

/**
 * Bir yapraktaki terminali başka biriyle değiştirir: split düzeninde ağaç
 * dışı (arka plan) bir sekme seçildiğinde aktif yaprakla yer değiştirmesi
 * için. `from` ağaçta yoksa ağaç değişmeden döner.
 */
export function replacePaneTerminal(pane: PaneNode, from: string, to: string): PaneNode {
  if (pane.type === 'leaf') return pane.terminalId === from ? { ...pane, terminalId: to } : pane
  const a = replacePaneTerminal(pane.a, from, to)
  const b = replacePaneTerminal(pane.b, from, to)
  return a === pane.a && b === pane.b ? pane : { ...pane, a, b }
}

/**
 * Where a dragged pane is dropped relative to the pane under the cursor.
 * 'center' swaps the two panes instead of re-tiling the tree.
 */
export type PaneDropEdge = 'left' | 'right' | 'top' | 'bottom' | 'center'

/** Edge for a pointer at (x, y) inside a `rect`-sized pane; center is the inner 50%. */
export function dropEdgeFor(x: number, y: number, width: number, height: number): PaneDropEdge {
  if (width <= 0 || height <= 0) return 'center'
  const fx = x / width
  const fy = y / height
  if (fx >= 0.25 && fx <= 0.75 && fy >= 0.25 && fy <= 0.75) return 'center'
  // Outside the center square the nearest border wins, so a corner resolves to
  // whichever axis the pointer is closer to.
  const distances: [PaneDropEdge, number][] = [['left', fx], ['right', 1 - fx], ['top', fy], ['bottom', 1 - fy]]
  return distances.reduce((best, entry) => (entry[1] < best[1] ? entry : best))[0]
}

/** Exchange the positions of two terminals without reshaping the tree. */
export function swapPaneTerminals(pane: PaneNode, first: string, second: string): PaneNode {
  if (pane.type === 'leaf') {
    if (pane.terminalId === first) return { ...pane, terminalId: second }
    if (pane.terminalId === second) return { ...pane, terminalId: first }
    return pane
  }
  return { ...pane, a: swapPaneTerminals(pane.a, first, second), b: swapPaneTerminals(pane.b, first, second) }
}

/** Replace the `targetId` leaf with a split that also holds `newId`. */
function insertBeside(pane: PaneNode, targetId: string, newId: string, dir: 'vertical' | 'horizontal', before: boolean): PaneNode {
  if (pane.type === 'leaf') {
    if (pane.terminalId !== targetId) return pane
    const fresh: PaneNode = { type: 'leaf', terminalId: newId }
    return { type: 'split', dir, ratio: 0.5, a: before ? fresh : pane, b: before ? pane : fresh }
  }
  return { ...pane, a: insertBeside(pane.a, targetId, newId, dir, before), b: insertBeside(pane.b, targetId, newId, dir, before) }
}

/**
 * Move `sourceId` next to `targetId` (tmux's join-pane, driven by the mouse):
 * the source is lifted out of the tree — collapsing whatever split it leaves
 * behind — and re-inserted on the requested edge of the target.
 *
 * The tree is returned unchanged when the move is a no-op or the ids are not
 * both in the tree, so callers can apply the result unconditionally.
 */
export function movePane(pane: PaneNode, sourceId: string, targetId: string, edge: PaneDropEdge): PaneNode {
  if (sourceId === targetId) return pane
  const ids = paneTerminalIds(pane)
  if (!ids.includes(sourceId) || !ids.includes(targetId)) return pane
  if (edge === 'center') return swapPaneTerminals(pane, sourceId, targetId)

  const without = closePane(pane, sourceId)
  // Only reachable if the tree held nothing but the source, which the id check
  // above already rules out; kept so the return type stays non-null.
  if (!without) return pane

  const dir = edge === 'left' || edge === 'right' ? 'vertical' : 'horizontal'
  return insertBeside(without, targetId, sourceId, dir, edge === 'left' || edge === 'top')
}

export function setPaneRatio(pane: PaneNode, path: number[], ratio: number): PaneNode {
  if (path.length === 0) return pane.type === 'split' ? { ...pane, ratio: Math.max(0.15, Math.min(0.85, ratio)) } : pane
  if (pane.type === 'leaf') return pane
  const [head, ...tail] = path
  return head === 0 ? { ...pane, a: setPaneRatio(pane.a, tail, ratio) } : { ...pane, b: setPaneRatio(pane.b, tail, ratio) }
}

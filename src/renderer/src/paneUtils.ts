export type PaneNode =
  | { type: 'leaf'; terminalId: string }
  | { type: 'split'; dir: 'vertical' | 'horizontal'; ratio: number; a: PaneNode; b: PaneNode }

export function paneTerminalIds(pane: PaneNode): string[] {
  return pane.type === 'leaf' ? [pane.terminalId] : [...paneTerminalIds(pane.a), ...paneTerminalIds(pane.b)]
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

export function setPaneRatio(pane: PaneNode, path: number[], ratio: number): PaneNode {
  if (path.length === 0) return pane.type === 'split' ? { ...pane, ratio: Math.max(0.15, Math.min(0.85, ratio)) } : pane
  if (pane.type === 'leaf') return pane
  const [head, ...tail] = path
  return head === 0 ? { ...pane, a: setPaneRatio(pane.a, tail, ratio) } : { ...pane, b: setPaneRatio(pane.b, tail, ratio) }
}

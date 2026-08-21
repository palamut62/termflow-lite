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

export function setPaneRatio(pane: PaneNode, path: number[], ratio: number): PaneNode {
  if (path.length === 0) return pane.type === 'split' ? { ...pane, ratio: Math.max(0.15, Math.min(0.85, ratio)) } : pane
  if (pane.type === 'leaf') return pane
  const [head, ...tail] = path
  return head === 0 ? { ...pane, a: setPaneRatio(pane.a, tail, ratio) } : { ...pane, b: setPaneRatio(pane.b, tail, ratio) }
}

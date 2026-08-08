import { useEffect, useMemo, useRef, useState } from 'react'
import { History } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { getActiveTerminalId } from '../paneUtils'
import { readCommandHistory, type CommandHistoryEntry } from '../commandHistory'
import { fuzzyFilter, fuzzyScore } from '../fuzzy'
import { useModalClose } from '../hooks/useModalClose'

interface Props {
  open: boolean
  onClose: () => void
}

// Rough relative age; exact timestamps are noise in a picker list.
function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ''
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

// Only the tail of the path is useful for telling two cwds apart.
function shortCwd(cwd: string): string {
  if (!cwd) return ''
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean)
  return parts.slice(-2).join('/')
}

/**
 * Fuzzy command-history picker (Ctrl+Shift+R). Enter types the command into the
 * active terminal without running it; Ctrl+Enter runs it.
 */
export default function HistoryPickerModal({ open, onClose }: Props): React.JSX.Element | null {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const nodes = useAppStore((s) => s.nodes)
  const activeNodeId = useAppStore((s) => s.activeNodeId)
  const terminals = useAppStore((s) => s.terminals)
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  const activeNode = nodes.find((node) => node.id === activeNodeId)
  const activeTerminalId = activeNode
    ? getActiveTerminalId(activeNode.activePaneId, activeNode.panes, activeNode.terminalId)
    : undefined
  const activeCwd = activeTerminalId ? terminals[activeTerminalId]?.cwd ?? '' : ''

  // Read history once per opening: localStorage is a snapshot, not a stream.
  const entries = useMemo<CommandHistoryEntry[]>(() => {
    if (!open || !activeWorkspaceId) return []
    const seen = new Set<string>()
    const unique: CommandHistoryEntry[] = []
    // History is newest-first, so the first occurrence is the newest one.
    for (const entry of readCommandHistory(activeWorkspaceId)) {
      if (seen.has(entry.command)) continue
      seen.add(entry.command)
      unique.push(entry)
    }
    // Default order: same-cwd commands first, newest first inside each group.
    return unique.sort((a, b) => Number(b.cwd === activeCwd) - Number(a.cwd === activeCwd))
  }, [open, activeWorkspaceId, activeCwd])

  const rows = useMemo<CommandHistoryEntry[]>(() => {
    const q = query.trim()
    if (!q) return entries
    // Fuzzy score wins; cwd match only breaks ties.
    const matched = fuzzyFilter(q, entries, (entry) => entry.command)
    return matched.sort((a, b) => {
      const diff = (fuzzyScore(q, b.command) ?? 0) - (fuzzyScore(q, a.command) ?? 0)
      if (diff !== 0) return diff
      return Number(b.cwd === activeCwd) - Number(a.cwd === activeCwd)
    })
  }, [entries, query, activeCwd])

  useEffect(() => { setIdx(0) }, [query, open])
  useEffect(() => { if (!open) setQuery('') }, [open])

  // Keep the highlighted row visible while arrowing through a long list.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${idx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [idx, rows])

  const close = (): void => {
    // Hand the keyboard back to the terminal the user came from.
    if (activeNodeId && activeTerminalId) {
      window.dispatchEvent(new CustomEvent('termflow:focus-node', {
        detail: { nodeId: activeNodeId, terminalId: activeTerminalId }
      }))
    }
    onClose()
  }

  // Escape also works when the list is empty and the input is not rendered.
  useModalClose(() => { if (open) close() })

  if (!open) return null

  const pick = (i: number, run: boolean): void => {
    const entry = rows[i]
    if (!entry || !activeTerminalId) return
    window.termflow.pty.write(activeTerminalId, run ? `${entry.command}\r` : entry.command)
    close()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={close} style={{ alignItems: 'flex-start', paddingTop: 120 }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 620, padding: 10 }}>
        <h3 style={{ marginTop: 0 }}>
          <History size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Command history
        </h3>
        {!activeTerminalId ? (
          <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No active terminal.</div>
        ) : (
          <>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Fuzzy search command history… (Enter: insert, Ctrl+Enter: run)"
              aria-label="Search command history"
              style={{
                width: '100%',
                background: 'var(--bg-main)',
                border: '1px solid var(--border-soft)',
                borderRadius: 8,
                color: 'var(--text-primary)',
                padding: '10px 12px',
                fontSize: 13,
                outline: 'none'
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, rows.length - 1)) }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)) }
                else if (e.key === 'Enter') { e.preventDefault(); pick(idx, e.ctrlKey) }
                else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
              }}
            />
            <div ref={listRef} style={{ maxHeight: 340, overflowY: 'auto', marginTop: 8 }}>
              {rows.map((entry, i) => (
                <div
                  key={`${entry.command}-${entry.createdAt}`}
                  data-row={i}
                  className="menu-item"
                  style={{ background: i === idx ? 'var(--bg-panel-2)' : undefined, justifyContent: 'space-between', gap: 10 }}
                  onMouseEnter={() => setIdx(i)}
                  onClick={(e) => pick(i, e.ctrlKey)}
                >
                  <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {entry.command}
                  </span>
                  <span style={{ flex: '0 0 auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {shortCwd(entry.cwd)} · {relativeTime(entry.createdAt)}
                  </span>
                </div>
              ))}
              {rows.length === 0 && (
                <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No matching commands</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

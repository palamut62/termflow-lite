import { useState } from 'react'
import { FileSearch, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { getLeafTerminalIds } from '../paneUtils'
import { useModalClose } from '../hooks/useModalClose'

interface Props {
  onClose: () => void
}

interface ResultRow {
  nodeId: string
  nodeTitle: string
  termId: string
  line: string
  lineIndex: number
}

// Global search: scan every open terminal's ring-buffer for a query string and
// let the user jump straight to the matching node. (feature: global search)
export default function GlobalSearchModal({ onClose }: Props): React.JSX.Element {
  const nodes = useAppStore((s) => s.nodes)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ResultRow[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  useModalClose(onClose)

  const runSearch = async (): Promise<void> => {
    const q = query.trim()
    if (!q) { setResults([]); setSearched(false); return }
    setSearching(true)
    try {
      const needle = q.toLowerCase()
      const rows: ResultRow[] = []
      for (const node of nodes) {
        const termIds = node.panes ? getLeafTerminalIds(node.panes) : node.terminalId ? [node.terminalId] : []
        for (const termId of termIds) {
          const raw = await window.termflow.pty.buffer(termId)
          if (!raw) continue
          const lines = raw.split('\n')
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes(needle)) {
              rows.push({ nodeId: node.id, nodeTitle: node.title, termId, line: line.trim().slice(0, 200), lineIndex: idx })
            }
          })
        }
      }
      setResults(rows.slice(0, 300))
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  const jumpTo = (result: ResultRow): void => {
    window.dispatchEvent(new CustomEvent('termflow:focus-node', {
      detail: { nodeId: result.nodeId, terminalId: result.termId }
    }))
    onClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <h3><FileSearch size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />Search all terminals</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            autoFocus
            placeholder="Search text across every open terminal buffer…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void runSearch() }}
            style={{ flex: 1 }}
          />
          <button className="btn primary" disabled={searching || !query.trim()} onClick={() => void runSearch()}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        <div style={{ maxHeight: 360, overflowY: 'auto', marginTop: 8 }}>
          {searched && results.length === 0 && (
            <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 12 }}>No matches found.</div>
          )}
          {results.map((r, i) => (
            <div
              key={`${r.termId}-${r.lineIndex}-${i}`}
              className="menu-item"
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, cursor: 'pointer' }}
              onClick={() => jumpTo(r)}
            >
              <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{r.nodeTitle}</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--mono, monospace)', color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {r.line || <em style={{ color: 'var(--text-muted)' }}>(empty line)</em>}
              </span>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}><X size={13} /> Close</button>
        </div>
      </div>
    </div>
  )
}

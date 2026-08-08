import { useMemo, useState } from 'react'

export interface PaletteCommand {
  id: string
  title: string
  run: () => void
}

interface Props {
  commands: PaletteCommand[]
  onClose: () => void
}

// Command palette (PRD §10.8.4). Opened with Ctrl+K.
export default function CommandPalette({ commands, onClose }: Props): React.JSX.Element {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const filtered = useMemo(
    () => commands.filter((c) => c.title.toLowerCase().includes(q.toLowerCase())),
    [commands, q]
  )

  const runAt = (i: number): void => {
    const c = filtered[i]
    if (c) {
      onClose()
      c.run()
    }
  }

  return (
    <div className="modal-overlay" onMouseDown={onClose} style={{ alignItems: 'flex-start', paddingTop: 120 }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 520, padding: 10 }}>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setIdx(0)
          }}
          placeholder="Search commands..."
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
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(i + 1, filtered.length - 1))
            else if (e.key === 'ArrowUp') setIdx((i) => Math.max(i - 1, 0))
            else if (e.key === 'Enter') runAt(idx)
            else if (e.key === 'Escape') onClose()
          }}
        />
        <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 8 }}>
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className="menu-item"
              style={{ background: i === idx ? 'var(--bg-panel-2)' : undefined }}
              onMouseEnter={() => setIdx(i)}
              onClick={() => runAt(i)}
            >
              {c.title}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No commands found</div>
          )}
        </div>
      </div>
    </div>
  )
}

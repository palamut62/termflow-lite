import { Link, Trash2, Unplug, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { getLeafTerminalIds } from '../paneUtils'
import { useAppStore } from '../store/appStore'

export default function DetachedSessionsPanel(): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const terminals = useAppStore((s) => s.terminals)
  const nodes = useAppStore((s) => s.nodes)
  const reattach = useAppStore((s) => s.reattachTerminal)
  const terminate = useAppStore((s) => s.terminateDetached)
  const clearAll = useAppStore((s) => s.clearAllDetached)
  const detached = useMemo(() => {
    const attached = new Set(nodes.flatMap((node) => node.panes ? getLeafTerminalIds(node.panes) : node.terminalId ? [node.terminalId] : []))
    return Object.values(terminals).filter((terminal) => !attached.has(terminal.id))
  }, [nodes, terminals])

  useEffect(() => {
    const toggle = (): void => setOpen((v) => !v)
    window.addEventListener('termflow:toggle-detached', toggle)
    return () => window.removeEventListener('termflow:toggle-detached', toggle)
  }, [])

  if (!detached.length) return null
  if (!open) return null
  return (
    <aside className="detached-dock">
      <div className="detached-dock__head">
        <div className="detached-dock__title">
          <Unplug size={14} />
          <strong>Detached Sessions</strong>
          <span>{detached.length}</span>
        </div>
        <div className="detached-dock__actions">
          <button className="detached-dock__clear" title="Terminate & remove all detached sessions" onClick={() => clearAll()}>
            <Trash2 size={13} /> Clear all
          </button>
          <button className="hbtn" aria-label="Close detached sessions" onClick={() => setOpen(false)}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="detached-dock__list">
        {detached.map((terminal) => (
          <div className="detached-item" key={terminal.id}>
            <button
              className="detached-item__main"
              title="Re-attach in a new window"
              onClick={() => reattach(terminal.id)}
            >
              <Link size={13} />
              <span>{terminal.name}</span>
              <em>{terminal.status}</em>
            </button>
            <button
              className="detached-item__kill"
              title="Terminate & remove this session"
              aria-label={`Terminate ${terminal.name}`}
              onClick={() => terminate(terminal.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </aside>
  )
}

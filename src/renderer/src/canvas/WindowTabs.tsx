import { useEffect, useState } from 'react'
import { Plus, TerminalSquare, X, AlertTriangle } from 'lucide-react'
import { useAppStore } from '../store/appStore'

/**
 * tmux-style window tab strip. Click switches window, double-click renames,
 * middle-click / × closes, drag reorders, + opens a new window.
 */
export default function WindowTabs(): React.JSX.Element {
  const nodes = useAppStore((s) => s.nodes)
  const activeNodeId = useAppStore((s) => s.activeNodeId)
  const setActiveNode = useAppStore((s) => s.setActiveNode)
  const renameNode = useAppStore((s) => s.renameNode)
  const moveNode = useAppStore((s) => s.moveNode)
  const addTerminal = useAppStore((s) => s.addTerminal)
  const closeNode = useAppStore((s) => s.closeNode)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // tmux `prefix ,` renames the active window through the same inline editor.
  useEffect(() => {
    const onRename = (e: Event): void => {
      const nodeId = (e as CustomEvent<{ nodeId: string }>).detail?.nodeId
      if (nodeId) setEditingId(nodeId)
    }
    window.addEventListener('termflow:rename-window', onRename)
    return () => window.removeEventListener('termflow:rename-window', onRename)
  }, [])

  return (
    <div className="window-tabs" role="tablist" aria-label="Windows">
      {nodes.map((node, index) => (
        <div
          key={node.id}
          role="tab"
          aria-selected={node.id === activeNodeId}
          className={`window-tab ${node.id === activeNodeId ? 'active' : ''} ${node.status === 'error' ? 'errored' : ''}`}
          draggable={editingId !== node.id}
          onDragStart={() => setDragId(node.id)}
          onDragEnd={() => setDragId(null)}
          onDragOver={(e) => { if (dragId && dragId !== node.id) e.preventDefault() }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragId && dragId !== node.id) moveNode(dragId, index)
            setDragId(null)
          }}
          onClick={() => setActiveNode(node.id)}
          onDoubleClick={() => setEditingId(node.id)}
          onAuxClick={(e) => {
            if (e.button !== 1) return
            e.preventDefault()
            void closeNode(node.id, 'terminate')
          }}
        >
          {node.status === 'error' ? <AlertTriangle size={12} color="var(--danger)" /> : <TerminalSquare size={12} />}
          {editingId === node.id ? (
            <input
              className="window-tab-input"
              autoFocus
              defaultValue={node.title}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => {
                renameNode(node.id, e.target.value.trim() || node.title)
                setEditingId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
          ) : (
            <span className="window-tab-title">{node.title}</span>
          )}
          <button
            className="window-tab-close"
            title="Close window"
            aria-label={`Close ${node.title}`}
            onClick={(e) => { e.stopPropagation(); void closeNode(node.id, 'terminate') }}
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        className="window-tab-new"
        title="New window (Ctrl+Alt+T)"
        aria-label="New window"
        disabled={!activeWorkspaceId}
        onClick={() => void addTerminal('cmd')}
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

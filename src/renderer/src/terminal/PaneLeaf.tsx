import { useState } from 'react'
import { GripVertical } from 'lucide-react'
import { TerminalView } from './TerminalView'
import { useTerminalStore } from '../store/terminalStore'
import { dropEdgeFor, type PaneDropEdge } from '../paneUtils'

/** Private drag type so terminal panes never react to unrelated drags. */
const PANE_DRAG_TYPE = 'application/x-termflow-pane'

/**
 * One terminal inside a split, draggable onto another pane's edge (tmux's
 * join-pane, done with the mouse). The drag starts from a small grip rather
 * than the terminal body — xterm owns the pointer there, and a draggable
 * terminal would break text selection.
 */
export function PaneLeaf({ terminalId, active }: { terminalId: string; active: boolean }): React.JSX.Element {
  const [edge, setEdge] = useState<PaneDropEdge | null>(null)
  const [dragging, setDragging] = useState(false)

  const onDragStart = (event: React.DragEvent<HTMLElement>): void => {
    event.dataTransfer.setData(PANE_DRAG_TYPE, terminalId)
    event.dataTransfer.effectAllowed = 'move'
    setDragging(true)
  }

  const isPaneDrag = (event: React.DragEvent<HTMLDivElement>): boolean =>
    event.dataTransfer.types.includes(PANE_DRAG_TYPE)

  /** Edge under the cursor, derived from the event rather than from state. */
  const edgeFromEvent = (event: React.DragEvent<HTMLDivElement>): PaneDropEdge => {
    const rect = event.currentTarget.getBoundingClientRect()
    return dropEdgeFor(event.clientX - rect.left, event.clientY - rect.top, rect.width, rect.height)
  }

  const onDragOver = (event: React.DragEvent<HTMLDivElement>): void => {
    if (!isPaneDrag(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    setEdge(edgeFromEvent(event))
  }

  const onDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    if (!isPaneDrag(event)) return
    event.preventDefault()
    const sourceId = event.dataTransfer.getData(PANE_DRAG_TYPE)
    // Recomputed here on purpose: `edge` is the render state behind the visual
    // hint, and a drop can land before React has flushed the last dragover.
    const dropEdge = edgeFromEvent(event)
    setEdge(null)
    if (sourceId) useTerminalStore.getState().movePaneTo(sourceId, terminalId, dropEdge)
  }

  return (
    <div
      className={`pane-leaf${active ? ' pane-leaf-active' : ''}${dragging ? ' pane-leaf-dragging' : ''}`}
      data-tab-id={terminalId}
      onDragOver={onDragOver}
      onDragLeave={() => setEdge(null)}
      onDrop={onDrop}
    >
      <TerminalView tabId={terminalId} active={active} visible />
      <span
        className="pane-grip"
        draggable
        onDragStart={onDragStart}
        onDragEnd={() => { setDragging(false); setEdge(null) }}
        title="Drag to move this pane"
        aria-label="Move pane"
        role="button"
      >
        <GripVertical size={12} />
      </span>
      {/* Drop preview: highlights the half the pane will occupy, or the whole
          pane for a center drop (which swaps the two panes). */}
      {edge && <div className={`pane-drop-hint pane-drop-${edge}`} aria-hidden="true" />}
    </div>
  )
}

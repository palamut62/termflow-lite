import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { TerminalTab as TerminalTabModel } from '../../../shared/types'
import { TabIcon } from './TabIcon'

interface TerminalTabProps {
  tab: TerminalTabModel
  active: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (title: string) => void
  /** Drag & drop reorder (PRD §14). */
  onDragStart: (id: string) => void
  onDragEnd: () => void
  onDragOverTab: (targetId: string, before: boolean) => void
  /** Insertion indicator: null | 'before' | 'after' (hedef tab'a göre). */
  dropPos: 'before' | 'after' | null
}

const MAX_TITLE_LENGTH = 60

/**
 * Single tab: icon + title + close button (hover-visible; always faint when
 * active). Double-click the title to rename inline (PRD §14); draggable for
 * native HTML5 drag & drop reordering.
 */
export function TerminalTab({
  tab,
  active,
  onSelect,
  onClose,
  onRename,
  onDragStart,
  onDragEnd,
  onDragOverTab,
  dropPos
}: TerminalTabProps): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(tab.title)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const startEdit = (): void => {
    if (editing) return
    setDraft(tab.title)
    setEditing(true)
  }

  const commit = (): void => {
    setEditing(false)
    const value = draft.trim().slice(0, MAX_TITLE_LENGTH)
    if (value && value !== tab.title) onRename(value)
  }

  const cancel = (): void => {
    setEditing(false)
    setDraft(tab.title)
  }

  const dragPosClass = dropPos === 'before' ? ' tab-drop-before' : dropPos === 'after' ? ' tab-drop-after' : ''

  return (
    <div
      data-tab-id={tab.id}
      className={`tab${active ? ' tab-active' : ''}${dragging ? ' tab-dragging' : ''}${dragPosClass}`}
      draggable={!editing}
      onClick={onSelect}
      onAuxClick={(e) => {
        // Middle click closes the tab (PRD §14).
        if (e.button === 1) {
          e.preventDefault()
          onClose()
        }
      }}
      onDoubleClick={startEdit}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', tab.id)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(true)
        onDragStart(tab.id)
      }}
      onDragEnd={() => {
        setDragging(false)
        onDragEnd()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const rect = e.currentTarget.getBoundingClientRect()
        onDragOverTab(tab.id, e.clientX < rect.left + rect.width / 2)
      }}
      title={editing ? undefined : tab.title}
    >
      <TabIcon shellId={tab.profileId} />
      {editing ? (
        <input
          ref={inputRef}
          className="tab-edit-input"
          value={draft}
          maxLength={MAX_TITLE_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            else if (e.key === 'Escape') cancel()
          }}
          onBlur={commit}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          style={{ width: `${Math.max(draft.length, 4)}ch` }}
        />
      ) : (
        <span className="tab-title">{tab.title}</span>
      )}
      <span className={`tab-process-indicator tab-activity-${tab.activity}`} aria-label={`Activity: ${tab.activity}`} title={`Activity: ${tab.activity}`} />
      <button
        className="tab-close"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        title="Close tab"
        aria-label={`Close ${tab.title}`}
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  )
}

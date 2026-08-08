import { useEffect, useRef, useState } from 'react'

interface TerminalContextMenuProps {
  /** Fare pozisyonu (clientX/clientY). */
  x: number
  y: number
  /** Seçim yoksa Copy devre dışı. */
  hasSelection: boolean
  onClose: () => void
  onCopy: () => void
  onPaste: () => void
  onSelectAll: () => void
  onClear: () => void
  onSearch: () => void
  onNewTab: () => void
  onCloseTab: () => void
  onSettings: () => void
}

const VIEWPORT_MARGIN = 8

/**
 * Terminal context menu (PRD §24). Rendered fixed at the mouse position,
 * clamped into the viewport when it would overflow. Dismisses on outside
 * mousedown / Escape / scroll / window blur. Actions are passed in from
 * TerminalView; each action is responsible for closing the menu.
 */
export function TerminalContextMenu(props: TerminalContextMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: props.x, y: props.y })

  // Measure after paint and clamp into the viewport.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.max(VIEWPORT_MARGIN, Math.min(props.x, window.innerWidth - width - VIEWPORT_MARGIN)),
      y: Math.max(VIEWPORT_MARGIN, Math.min(props.y, window.innerHeight - height - VIEWPORT_MARGIN))
    })
  }, [props.x, props.y])

  useEffect(() => {
    const onMouseDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) props.onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.onClose()
    }
    const onScroll = (): void => props.onClose()
    const onWindowBlur = (): void => props.onClose()
    window.addEventListener('mousedown', onMouseDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onScroll, { passive: true })
    window.addEventListener('blur', onWindowBlur)
    return () => {
      window.removeEventListener('mousedown', onMouseDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onScroll)
      window.removeEventListener('blur', onWindowBlur)
    }
  }, [props.onClose])

  return (
    <div className="ctx-menu" ref={ref} role="menu" style={{ left: pos.x, top: pos.y }}>
      <button className="ctx-menu-item" role="menuitem" disabled={!props.hasSelection} onClick={props.onCopy}>
        Copy
      </button>
      <button className="ctx-menu-item" role="menuitem" onClick={props.onPaste}>
        Paste
      </button>
      <button className="ctx-menu-item" role="menuitem" onClick={props.onSelectAll}>
        Select All
      </button>
      <button className="ctx-menu-item" role="menuitem" onClick={props.onClear}>
        Clear
      </button>
      <div className="ctx-menu-divider" />
      <button className="ctx-menu-item" role="menuitem" onClick={props.onSearch}>
        Search
      </button>
      <div className="ctx-menu-divider" />
      <button className="ctx-menu-item" role="menuitem" onClick={props.onNewTab}>
        New Tab
      </button>
      <button className="ctx-menu-item" role="menuitem" onClick={props.onCloseTab}>
        Close Tab
      </button>
      <div className="ctx-menu-divider" />
      <button className="ctx-menu-item" role="menuitem" onClick={props.onSettings}>
        Settings
      </button>
    </div>
  )
}

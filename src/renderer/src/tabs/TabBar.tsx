import { useRef, useState } from 'react'
import type { CSSProperties, DragEvent } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { NewTabMenu } from './NewTabMenu'
import { PathLauncherModal } from './PathLauncherModal'
import { TerminalTab } from './TerminalTab'

interface TabBarProps {
  height: number
}

/**
 * Custom title bar (PRD §68): tab bar pencere başlığının yerini alır. Windows'ta
 * native pencere düğmeleri overlay olarak sağ üstte durur, macOS'ta trafik
 * ışıkları sol üstte — bu kadar yer boş bırakılır. Linux'ta native title bar
 * korunduğu için ekstra boşluk yok.
 */
const WINDOWS_OVERLAY_WIDTH = 140
const MACOS_TRAFFIC_LIGHTS_WIDTH = 78

export function TabBar({ height }: TabBarProps): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pathLauncherOpen, setPathLauncherOpen] = useState(false)
  const caretRef = useRef<HTMLButtonElement>(null)
  // Native HTML5 DnD reorder (PRD §14): dragged tab + insertion indicator.
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropPos, setDropPos] = useState<{ tabId: string; before: boolean } | null>(null)

  // "+" opens a tab with the default profile (PRD §15); the caret beside it
  // opens the NewTabMenu with every shell + custom profile.
  const newTab = (): void => {
    const { settings, shells } = useSettingsStore.getState()
    useTerminalStore.getState().addTab(resolveDefaultProfileId(settings, shells))
  }

  const handleDragEnd = (): void => {
    setDraggedId(null)
    setDropPos(null)
  }

  /**
   * Live reorder while dragging: the tab under the cursor is the insertion
   * point — mouse in the left half inserts before it, right half after it.
   */
  const handleDragOverTab = (targetId: string, before: boolean): void => {
    if (!draggedId || draggedId === targetId) return
    const store = useTerminalStore.getState()
    const from = store.tabs.findIndex((t) => t.id === draggedId)
    const to = store.tabs.findIndex((t) => t.id === targetId)
    if (from < 0 || to < 0) return
    // Remove the dragged tab first, then insert: indices after `from` shift.
    let targetIndex = before ? to : to + 1
    if (from < to) targetIndex -= 1
    const clamped = Math.max(0, Math.min(targetIndex, store.tabs.length - 1))
    setDropPos({ tabId: targetId, before })
    if (clamped !== from) store.moveTab(draggedId, clamped)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault()
    handleDragEnd()
  }

  const platform = window.termflow?.system.platform
  const titleBarInset: CSSProperties =
    platform === 'win32'
      ? { paddingRight: WINDOWS_OVERLAY_WIDTH }
      : platform === 'darwin'
        ? { paddingLeft: MACOS_TRAFFIC_LIGHTS_WIDTH }
        : {}

  return (
    <div className="tab-bar" style={{ height, ...titleBarInset } as CSSProperties}>
      <div className="tab-list" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onSelect={() => useTerminalStore.getState().setActiveTab(tab.id)}
            onClose={() => useTerminalStore.getState().requestCloseTab(tab.id)}
            onRename={(title) => useTerminalStore.getState().renameTab(tab.id, title)}
            onDragStart={setDraggedId}
            onDragEnd={handleDragEnd}
            onDragOverTab={handleDragOverTab}
            dropPos={
              dropPos && dropPos.tabId === tab.id ? (dropPos.before ? 'before' : 'after') : null
            }
          />
        ))}
      </div>
      <div className="new-tab-area">
        <button className="new-tab-btn" onClick={newTab} title="New Tab" aria-label="New tab">
          <Plus size={14} />
        </button>
        <button
          ref={caretRef}
          className="new-tab-caret"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="New tab options"
          aria-expanded={menuOpen}
          title="More"
        >
          <ChevronDown size={12} />
        </button>
        {menuOpen && caretRef.current && (
          <NewTabMenu
            anchor={caretRef.current}
            onClose={() => setMenuOpen(false)}
            onOpenAtPath={() => { setMenuOpen(false); setPathLauncherOpen(true) }}
          />
        )}
      </div>
      {pathLauncherOpen && <PathLauncherModal onClose={() => setPathLauncherOpen(false)} />}
    </div>
  )
}

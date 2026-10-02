import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent } from 'react'
import { ChevronDown, Columns2, PanelTopClose, PictureInPicture2, Plus, Rows2, PanelLeft } from 'lucide-react'
import { useWidgetStore } from '../widget/widgetStore'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { NewTabMenu } from './NewTabMenu'
import { PathLauncherModal } from './PathLauncherModal'
import { WorktreeLauncherModal } from './WorktreeLauncherModal'
import { GitHubPanel } from '../components/GitHubPanel'
import { TerminalTab } from './TerminalTab'
import { effectiveMotion } from '../motion'

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
  const splitDirection = useTerminalStore((s) => s.splitDirection)
  const showSessionRail = useSettingsStore((s) => s.settings.showSessionRail)
  const [menuOpen, setMenuOpen] = useState(false)
  const [pathLauncherOpen, setPathLauncherOpen] = useState(false)
  const [worktreeLauncherOpen, setWorktreeLauncherOpen] = useState(false)
  const [githubOpen, setGithubOpen] = useState(false)
  const caretRef = useRef<HTMLButtonElement>(null)
  // Native HTML5 DnD reorder (PRD §14): dragged tab + insertion indicator.
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropPos, setDropPos] = useState<{ tabId: string; before: boolean } | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const indicatorRef = useRef<HTMLDivElement>(null)
  /** Önceki render'daki sekme x konumları (FLIP). */
  const tabLefts = useRef(new Map<string, number>())

  // FLIP: sekme açılıp kapanınca ya da yer değiştirince kalanlar yeni yerlerine
  // kayar; aktif sekme çizgisi de hedef sekmeye süzülür. Sürüklerken FLIP
  // yapılmaz, yoksa dönüştürülmüş dikdörtgen hover hesabını şaşırtır.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const motion = effectiveMotion(useSettingsStore.getState().settings.motion)
    const next = new Map<string, number>()
    let activeEl: HTMLElement | null = null
    for (const el of list.querySelectorAll<HTMLElement>('[data-tab-id]')) {
      const id = el.dataset.tabId ?? ''
      const left = el.offsetLeft
      next.set(id, left)
      if (id === activeTabId) activeEl = el
      const prev = tabLefts.current.get(id)
      if (motion !== 'off' && !draggedId && prev !== undefined && prev !== left) {
        el.animate([{ transform: `translateX(${prev - left}px)` }, { transform: 'none' }], {
          duration: motion === 'full' ? 240 : 170,
          easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
        })
      }
    }
    tabLefts.current = next
    const indicator = indicatorRef.current
    if (!indicator) return
    if (!activeEl) {
      indicator.style.opacity = '0'
      return
    }
    // İlk konumlandırma animasyonsuz olsun (soldan kayarak gelmesin).
    const instant = indicator.style.opacity !== '1'
    indicator.classList.toggle('tab-indicator-instant', instant)
    indicator.style.transform = `translateX(${activeEl.offsetLeft}px)`
    indicator.style.width = `${activeEl.offsetWidth}px`
    indicator.style.opacity = '1'
    if (instant) void indicator.offsetWidth
    indicator.classList.remove('tab-indicator-instant')
  }, [tabs, activeTabId, draggedId])

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
      <div ref={listRef} className="tab-list" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
        <div ref={indicatorRef} className="tab-indicator" aria-hidden="true" />
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
        <button
          className={`split-tab-btn${showSessionRail ? ' split-tab-btn-active' : ''}`}
          onClick={() => useSettingsStore.getState().update({ showSessionRail: !showSessionRail })}
          title="Toggle session rail"
          aria-label="Toggle session rail"
          aria-pressed={showSessionRail}
        ><PanelLeft size={14} /></button>
        <button className="split-tab-btn" onClick={() => void useWidgetStore.getState().enter()} title="Widget view (compact status, always on top)" aria-label="Switch to widget view"><PictureInPicture2 size={14} /></button>
        <button className={`split-tab-btn${splitDirection === 'vertical' ? ' split-tab-btn-active' : ''}`} onClick={() => useTerminalStore.getState().splitActive('vertical')} title="Split terminal right" aria-label="Split terminal right"><Columns2 size={14} /></button>
        <button className={`split-tab-btn${splitDirection === 'horizontal' ? ' split-tab-btn-active' : ''}`} onClick={() => useTerminalStore.getState().splitActive('horizontal')} title="Split terminal down" aria-label="Split terminal down"><Rows2 size={14} /></button>
        {splitDirection && <button className="split-tab-btn" onClick={() => useTerminalStore.getState().closeSplit()} title="Close split view" aria-label="Close split view"><PanelTopClose size={14} /></button>}
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
            onOpenWorktree={() => { setMenuOpen(false); setWorktreeLauncherOpen(true) }}
            onOpenGithub={() => { setMenuOpen(false); setGithubOpen(true) }}
          />
        )}
      </div>
      {pathLauncherOpen && <PathLauncherModal onClose={() => setPathLauncherOpen(false)} />}
      {worktreeLauncherOpen && <WorktreeLauncherModal onClose={() => setWorktreeLauncherOpen(false)} />}
      {githubOpen && <GitHubPanel onClose={() => setGithubOpen(false)} />}
    </div>
  )
}

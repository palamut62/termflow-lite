import { useState } from 'react'
import type { CSSProperties } from 'react'
import { ChevronDown, Plus } from 'lucide-react'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { NewTabMenu } from './NewTabMenu'
import { TerminalTab } from './TerminalTab'

interface TabBarProps {
  height: number
}

export function TabBar({ height }: TabBarProps): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const [menuOpen, setMenuOpen] = useState(false)

  // "+" opens a tab with the default profile (PRD §15); the caret beside it
  // opens the NewTabMenu with every shell + custom profile.
  const newTab = (): void => {
    const { settings, shells } = useSettingsStore.getState()
    useTerminalStore.getState().addTab(resolveDefaultProfileId(settings, shells))
  }

  return (
    <div className="tab-bar" style={{ height } as CSSProperties}>
      <div className="tab-list">
        {tabs.map((tab) => (
          <TerminalTab
            key={tab.id}
            tab={tab}
            active={tab.id === activeTabId}
            onSelect={() => useTerminalStore.getState().setActiveTab(tab.id)}
            onClose={() => useTerminalStore.getState().closeTab(tab.id)}
          />
        ))}
      </div>
      <div className="new-tab-area">
        <button className="new-tab-btn" onClick={newTab} title="New Tab" aria-label="New tab">
          <Plus size={14} />
        </button>
        <button
          className="new-tab-caret"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="New tab options"
          aria-expanded={menuOpen}
          title="More"
        >
          <ChevronDown size={12} />
        </button>
        {menuOpen && <NewTabMenu onClose={() => setMenuOpen(false)} />}
      </div>
    </div>
  )
}

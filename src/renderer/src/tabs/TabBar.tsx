import type { CSSProperties } from 'react'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { TerminalTab } from './TerminalTab'

interface TabBarProps {
  height: number
}

export function TabBar({ height }: TabBarProps): React.JSX.Element {
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)

  // "+" opens a tab with the default profile (NewTabMenu lands in Faz 2-3).
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
      <button className="tab-add" onClick={newTab} title="New Tab" aria-label="New tab">
        +
      </button>
    </div>
  )
}

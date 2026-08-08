import { useEffect, useRef } from 'react'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { TabIcon } from './TabIcon'

interface NewTabMenuProps {
  /** Called after a row was picked or when the menu should close itself. */
  onClose: () => void
}

/**
 * Dropdown opened by the caret next to the "+" button (PRD §15): every
 * discovered shell plus custom profiles. Closes on outside click / Escape.
 * A Settings entry lands in Faz 6.
 */
export function NewTabMenu({ onClose }: NewTabMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const shells = useSettingsStore((s) => s.shells)
  const profiles = useSettingsStore((s) => s.settings.profiles)

  useEffect(() => {
    // mousedown (not click): the same press that opened the menu must not
    // immediately close it again.
    const onDocMouseDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const openTab = (profileId: string): void => {
    useTerminalStore.getState().addTab(profileId)
    onClose()
  }

  const defaultProfileId = resolveDefaultProfileId(useSettingsStore.getState().settings, shells)

  return (
    <div className="new-tab-menu" ref={ref} role="menu" aria-label="New tab">
      <div className="menu-section">Shells</div>
      {shells.map((shell) => (
        <button
          key={shell.id}
          className="menu-item"
          role="menuitem"
          onClick={() => openTab(shell.id)}
          title={shell.command}
        >
          <TabIcon shellId={shell.id} />
          <span className="menu-item-label">{shell.name}</span>
          {shell.id === defaultProfileId && <span className="menu-default-badge">Default</span>}
        </button>
      ))}
      {profiles.length > 0 && (
        <>
          <div className="menu-divider" />
          <div className="menu-section">Profiles</div>
          {profiles.map((profile) => (
            <button
              key={profile.id}
              className="menu-item"
              role="menuitem"
              onClick={() => openTab(profile.id)}
              title={profile.command}
            >
              <TabIcon shellId={profile.id} />
              <span className="menu-item-label">{profile.name}</span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

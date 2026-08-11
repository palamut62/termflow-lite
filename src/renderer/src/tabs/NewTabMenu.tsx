import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FolderOpen, Settings as SettingsIcon } from 'lucide-react'
import { mergeProfiles, providerProfileId, sshProfileId } from '../../../shared/profiles'
import { sshTarget } from '../../../shared/sshArgs'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { TabIcon } from './TabIcon'

interface NewTabMenuProps {
  /** Caret butonu — menü bunun alt-sağına hizalanır, dışa tıkta "içeri" sayılır. */
  anchor: HTMLElement
  /** Called after a row was picked or when the menu should close itself. */
  onClose: () => void
  onOpenAtPath: () => void
}

const VIEWPORT_MARGIN = 8
const ANCHOR_GAP = 4

/**
 * Dropdown opened by the caret next to the "+" button (PRD §15): every
 * discovered shell plus custom profiles, then a Settings entry (Faz 6).
 * `.tab-bar` overflow'a takılmasın diye body'ye portal edilir ve caret'in
 * ekran koordinatlarından fixed konumlandırılır (TerminalContextMenu ile aynı
 * measure-after-paint + viewport clamp deseni). Closes on outside click / Escape.
 */
export function NewTabMenu({ anchor, onClose, onOpenAtPath }: NewTabMenuProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const shells = useSettingsStore((s) => s.shells)
  const userProfiles = useSettingsStore((s) => s.settings.profiles)
  // Yerleşik CLI ajan profilleri + kullanıcı profilleri (tek liste).
  const profiles = mergeProfiles(userProfiles)
  const providers = useSettingsStore((s) => s.settings.providerProfiles)
  const sshConnections = useSettingsStore((s) => s.settings.sshConnections) ?? []
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  // Measure after paint: sağ kenarlar çakışacak şekilde hizala, taşarsa clamp'le.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const a = anchor.getBoundingClientRect()
    const { width, height } = el.getBoundingClientRect()
    setPos({
      x: Math.max(
        VIEWPORT_MARGIN,
        Math.min(a.right - width, window.innerWidth - width - VIEWPORT_MARGIN)
      ),
      y: Math.max(
        VIEWPORT_MARGIN,
        Math.min(a.bottom + ANCHOR_GAP, window.innerHeight - height - VIEWPORT_MARGIN)
      )
    })
    // profiles her render'da yeniden türetildiği için bağımlılık userProfiles.
  }, [anchor, shells, userProfiles])

  useEffect(() => {
    // mousedown (not click): the same press that opened the menu must not
    // immediately close it again. Caret'in kendisi de "içeri" sayılır — yoksa
    // kapat + toggle üst üste binip menü hiç açılmaz.
    const onDocMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target) && !anchor.contains(target)) onClose()
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
  }, [anchor, onClose])

  const openTab = (profileId: string): void => {
    useTerminalStore.getState().addTab(profileId)
    onClose()
  }

  const defaultProfileId = resolveDefaultProfileId(useSettingsStore.getState().settings, shells)

  return createPortal(
    <div
      className="new-tab-menu"
      ref={ref}
      role="menu"
      aria-label="New tab"
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? undefined : 'hidden' }}
    >
      <div className="menu-section">Shells</div>
      <button className="menu-item" role="menuitem" onClick={onOpenAtPath}>
        <FolderOpen size={14} />
        <span className="menu-item-label">Open at folder...</span>
      </button>
      <div className="menu-divider" />
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
              title={profile.command || profile.startupCommand}
            >
              {profile.color ? (
                <span className="menu-item-dot" style={{ background: profile.color }} aria-hidden="true" />
              ) : (
                <TabIcon shellId={profile.id} />
              )}
              <span className="menu-item-label">{profile.name}</span>
            </button>
          ))}
        </>
      )}
      {providers.length > 0 && (
        <>
          <div className="menu-divider" />
          <div className="menu-section">Providers</div>
          {providers.map((provider) => (
            <button className="menu-item" role="menuitem" key={provider.id} onClick={() => openTab(providerProfileId(provider.id))}>
              <span className="menu-item-dot" style={{ background: provider.color || '#6467f2' }} />
              <span className="menu-item-label">{provider.name}</span>
            </button>
          ))}
        </>
      )}
      {sshConnections.length > 0 && (
        <>
          <div className="menu-divider" />
          <div className="menu-section">SSH</div>
          {sshConnections.map((conn) => (
            <button
              className="menu-item"
              role="menuitem"
              key={conn.id}
              onClick={() => openTab(sshProfileId(conn.id))}
              title={sshTarget(conn)}
            >
              <TabIcon shellId={sshProfileId(conn.id)} />
              <span className="menu-item-label">{conn.name}</span>
            </button>
          ))}
        </>
      )}
      <div className="menu-divider" />
      <button
        className="menu-item"
        role="menuitem"
        onClick={() => {
          useSettingsStore.getState().openSettings()
          onClose()
        }}
      >
        <SettingsIcon size={14} />
        <span className="menu-item-label">Settings</span>
      </button>
    </div>,
    document.body
  )
}

import { ChevronsRight, Shell, SquareTerminal, Terminal, TerminalSquare } from 'lucide-react'
import { mergeProfiles } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'

interface TabIconProps {
  /** Profile id of the tab: a discovered shell id or a custom profile id. */
  shellId: string
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

/**
 * Small icon shown next to a tab / menu-row label. Kind-driven for built-in
 * shells, `profile.icon` (emoji or single char) for custom profiles, fallback
 * to a generic terminal glyph. Colors come from theme CSS variables only.
 */
export function TabIcon({ shellId }: TabIconProps): React.JSX.Element {
  const shell = useSettingsStore((s) => s.shells.find((sh) => sh.id === shellId))
  const userProfiles = useSettingsStore((s) => s.settings.profiles)
  const profile = mergeProfiles(userProfiles).find((p) => p.id === shellId)

  // Custom profile with an explicit emoji/short icon: render as text.
  const customIcon = profile?.icon
  if (customIcon && (customIcon.length === 1 || EMOJI.test(customIcon))) {
    return <span className="tab-icon tab-icon-text">{customIcon}</span>
  }

  // Renkli profiller (CLI ajanları) küçük bir renk noktasıyla gösterilir.
  if (profile?.color) {
    return <span className="tab-icon menu-item-dot" style={{ background: profile.color }} aria-hidden="true" />
  }

  switch (shell?.icon ?? shell?.kind) {
    case 'powershell':
    case 'pwsh':
      return (
        <span className="tab-icon tab-icon-powershell">
          <SquareTerminal size={14} />
        </span>
      )
    case 'cmd':
      return (
        <span className="tab-icon tab-icon-cmd">
          <TerminalSquare size={14} />
        </span>
      )
    case 'wsl':
    case 'gitbash':
    case 'bash':
    case 'linux':
      return (
        <span className="tab-icon">
          <Shell size={14} />
        </span>
      )
    case 'sh':
      return (
        <span className="tab-icon">
          <ChevronsRight size={14} />
        </span>
      )
    default:
      return (
        <span className="tab-icon">
          <Terminal size={14} />
        </span>
      )
  }
}

import { X } from 'lucide-react'
import type { TerminalTab as TerminalTabModel } from '../../../shared/types'
import { TabIcon } from './TabIcon'

interface TerminalTabProps {
  tab: TerminalTabModel
  active: boolean
  onSelect: () => void
  onClose: () => void
}

/** Single tab: icon + title + close button (hover-visible; always faint when active). */
export function TerminalTab({ tab, active, onSelect, onClose }: TerminalTabProps): React.JSX.Element {
  return (
    <div
      className={`tab${active ? ' tab-active' : ''}`}
      onClick={onSelect}
      onAuxClick={(e) => {
        // Middle click closes the tab (PRD §14).
        if (e.button === 1) {
          e.preventDefault()
          onClose()
        }
      }}
      title={tab.title}
    >
      <TabIcon shellId={tab.profileId} />
      <span className="tab-title">{tab.title}</span>
      <button
        className="tab-close"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        title="Close tab"
        aria-label={`Close ${tab.title}`}
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </div>
  )
}

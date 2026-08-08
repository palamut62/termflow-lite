import type { TerminalTab as TerminalTabModel } from '../../../shared/types'

interface TerminalTabProps {
  tab: TerminalTabModel
  active: boolean
  onSelect: () => void
  onClose: () => void
}

/** Single tab: title + hover-visible close button. Rename/reorder: Faz 7. */
export function TerminalTab({ tab, active, onSelect, onClose }: TerminalTabProps): React.JSX.Element {
  return (
    <div className={`tab${active ? ' tab-active' : ''}`} onClick={onSelect} title={tab.title}>
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
        &times;
      </button>
    </div>
  )
}

import { useModalClose } from '../hooks/useModalClose'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  tone?: 'default' | 'danger'
  onConfirm: () => void
  onClose: () => void
}

export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  tone = 'default',
  onConfirm,
  onClose
}: Props): React.JSX.Element {
  useModalClose(onClose)
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h3>{title}</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, lineHeight: 1.5 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

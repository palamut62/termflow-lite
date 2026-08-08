import { useModalClose } from '../hooks/useModalClose'

interface Props {
  name: string
  running: boolean
  onTerminate: () => void
  onDetach: () => void
  onClose: () => void
}

// PRD FR-015 — Terminate / Detach / Cancel when closing a running terminal.
export default function CloseModal({ name, running, onTerminate, onDetach, onClose }: Props): React.JSX.Element {
  useModalClose(onClose)
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 420 }}>
        <h3>Close Terminal</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 12.5, marginBottom: 4 }}>
          <b style={{ color: 'var(--text-primary)' }}>{name}</b>{' '}
          {running ? 'is running. What would you like to do?' : 'will be closed.'}
        </p>
        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {running && (
              <button className="btn" onClick={onDetach} title="Process keeps running, panel is removed">
                Detach
              </button>
            )}
            <button className="btn" style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={onTerminate}>
              Terminate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

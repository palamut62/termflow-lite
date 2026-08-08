import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useModalClose } from '../hooks/useModalClose'

interface Props {
  onSubmit: (command: string) => void
  onClose: () => void
}

// Dangerous command patterns (PRD §19.1)
const DANGER_RE = /\b(rm\s+-rf|del\s+\/s|format\b|Invoke-Expression|-EncodedCommand)\b|\|\s*(powershell|iex)/i

export default function CustomCommandModal({ onSubmit, onClose }: Props): React.JSX.Element {
  const [cmd, setCmd] = useState('')
  const [confirmedDanger, setConfirmedDanger] = useState(false)
  const danger = DANGER_RE.test(cmd)
  useModalClose(onClose)

  const submit = (): void => {
    if (!cmd.trim()) return
    if (danger && !confirmedDanger) {
      setConfirmedDanger(true)
      return
    }
    onSubmit(cmd.trim())
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Custom Command</h3>
        <div className="field">
          <label>Command to execute</label>
          <input
            value={cmd}
            onChange={(e) => {
              setCmd(e.target.value)
              setConfirmedDanger(false)
            }}
            placeholder="e.g. python agent.py"
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        </div>
        {danger && (
          <div style={{ display: 'flex', gap: 8, color: 'var(--warning)', fontSize: 12, marginTop: -6 }}>
            <AlertTriangle size={15} />{' '}
            {confirmedDanger ? 'Press Run Anyway to confirm this command.' : 'Dangerous command pattern detected.'}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!cmd.trim()} onClick={submit}>
            {danger && confirmedDanger ? 'Run Anyway' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

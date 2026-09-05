import { useState } from 'react'
import { useHandoverStore } from '../store/handoverStore'
export function HandoverDialog(): React.JSX.Element | null {
  const review = useHandoverStore(s => s.pending)
  const [text, setText] = useState(review?.prompt ?? '')
  const [notes, setNotes] = useState('')
  if (!review) return null
  return <div className="settings-backdrop"><section className="handover-dialog" role="dialog" aria-modal="true" aria-label="Review agent handover" onKeyDown={e => { if (e.key === 'Escape') useHandoverStore.getState().finish(null) }}>
    <h2>Review agent handover</h2><p>{review.source} → {review.target}</p><p>{review.cwd || 'Default folder'}</p>
    <label>Context to send<textarea autoFocus aria-label="Handover context" value={text} onChange={e => setText(e.target.value)} maxLength={6500} /></label>
    <label>Remaining work / notes<textarea aria-label="Remaining work" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} /></label>
    <p>The target receives this text. Your source session stays open.</p>
    <div className="profile-form-actions"><button className="settings-btn" onClick={() => useHandoverStore.getState().finish(null)}>Cancel</button>
      <button className="settings-btn settings-btn-primary" disabled={!text.trim()} onClick={() => useHandoverStore.getState().finish(text.trim() + (notes.trim() ? '\nRemaining work: ' + notes.trim() : ''))}>Start handover</button></div>
  </section></div>
}

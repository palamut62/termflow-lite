import { History, RotateCcw } from 'lucide-react'

export default function RecoveryModal({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }): React.JSX.Element {
  return <div className="modal-overlay"><div className="modal recovery-modal"><History size={28} /><h3>Previous session ended unexpectedly</h3><p>TermFlow restored the saved workspace layout and recreated its terminal sessions. Continue with the restored session or terminate all restored terminals and start clean.</p><div className="modal-actions"><button className="btn" onClick={onDiscard}>Start clean</button><button className="btn primary" onClick={onRestore}><RotateCcw size={13} />Continue restored session</button></div></div></div>
}

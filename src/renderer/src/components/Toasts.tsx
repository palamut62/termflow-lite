import { X } from 'lucide-react'
import { useToastStore } from '../store/toastStore'

export function Toasts(): React.JSX.Element | null {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span>{t.text}</span>
          <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

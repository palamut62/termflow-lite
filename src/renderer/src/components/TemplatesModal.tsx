import { useEffect, useState } from 'react'
import { Trash2, LayoutTemplate } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useModalClose } from '../hooks/useModalClose'

interface Props {
  onClose: () => void
}

interface TemplateEntry {
  id: string
  name: string
  savedAt: string
}

// Workspace templates: instantiate a new workspace from a previously saved
// layout (nodes/terminals/connections/snippets/...). The "save" side lives in
// Sidebar (per-workspace "Save as template" action); this modal covers listing
// and applying a template, plus deleting stale ones. (feature: workspace template)
export default function TemplatesModal({ onClose }: Props): React.JSX.Element {
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const [templates, setTemplates] = useState<TemplateEntry[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useModalClose(onClose)

  const reload = async (): Promise<void> => setTemplates(await window.termflow.templates.list())

  useEffect(() => {
    reload()
  }, [])

  const apply = async (t: TemplateEntry): Promise<void> => {
    setError(null)
    setBusyId(t.id)
    try {
      const res = await window.termflow.templates.createWorkspace(t.id, { name: t.name })
      if (res.error) {
        setError(res.error)
        return
      }
      if (res.id) {
        const workspaces = await window.termflow.workspaces.list()
        useAppStore.setState({ workspaces })
        await openWorkspace(res.id)
        onClose()
      }
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (t: TemplateEntry): Promise<void> => {
    await window.termflow.templates.remove(t.id)
    await reload()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 480 }}>
        <h3>Workspace Templates</h3>
        {error && <div className="side-error" role="alert">{error}</div>}
        {templates.length === 0 && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            No templates saved yet. Use "Save as template" on a workspace in the sidebar.
          </div>
        )}
        {templates.map((t) => (
          <div key={t.id} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
            borderBottom: '1px solid var(--border-soft)'
          }}>
            <LayoutTemplate size={15} />
            <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
            <button className="btn primary" disabled={busyId === t.id} onClick={() => apply(t)}>
              {busyId === t.id ? 'Creating…' : 'Use'}
            </button>
            <button className="hbtn" title="Delete template" onClick={() => remove(t)} style={{ color: 'var(--danger)' }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

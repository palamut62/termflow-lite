import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useModalClose } from '../hooks/useModalClose'

interface Props {
  onClose: () => void
}

export default function WorkspaceModal({ onClose }: Props): React.JSX.Element {
  const createWorkspace = useAppStore((s) => s.createWorkspace)
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  useModalClose(onClose)

  const pick = async (): Promise<void> => {
    const dir = await window.termflow.dialog.openDir()
    if (dir) {
      setPath(dir)
      if (!name) setName(dir.split(/[\\/]/).pop() || 'Workspace')
    }
  }

  const submit = async (): Promise<void> => {
    if (!name || !path) return
    setBusy(true)
    await createWorkspace({ name, path, description: description || undefined })
    setBusy(false)
    onClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>New Workspace</h3>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" autoFocus />
        </div>
        <div className="field">
          <label>Folder</label>
          <div className="path-pick">
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\\Projects\\..." />
            <button className="btn" onClick={pick}>
              <FolderOpen size={15} />
            </button>
          </div>
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!name || !path || busy} onClick={submit}>
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

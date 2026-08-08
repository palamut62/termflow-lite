import { FolderOpen } from 'lucide-react'
import { useState } from 'react'
import type { ShellKind } from '../../../shared/types'
import { PROFILES } from '../profiles'
import { useAppStore } from '../store/appStore'
import { useModalClose } from '../hooks/useModalClose'

export default function TerminalLauncherModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const addTerminal = useAppStore((s) => s.addTerminal)
  const [kind, setKind] = useState<ShellKind>('cmd')
  const [cwd, setCwd] = useState('')
  const [fullPermissions, setFullPermissions] = useState(false)
  const launchers = PROFILES.filter((profile) => !['custom', 'ssh', 'ollama'].includes(profile.kind))
  const selected = launchers.find((profile) => profile.kind === kind)
  useModalClose(onClose)

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <h3>Open terminal at folder</h3>
        <div className="field">
          <label>Terminal</label>
          <select value={kind} onChange={(event) => setKind(event.target.value as ShellKind)}>
            {launchers.map((profile) => <option key={profile.kind} value={profile.kind}>{profile.label}</option>)}
          </select>
        </div>
        {!!selected?.bypassArgs && <div className="field"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={fullPermissions} onChange={(event) => setFullPermissions(event.target.checked)} />Launch with full permissions</label><p style={{ marginTop: 5, color: 'var(--warning)', fontSize: 10 }}>Use only in a trusted project folder. The command can modify files and run without approval prompts.</p></div>}
        <div className="field">
          <label>Working directory</label>
          <div className="path-pick">
            <input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="C:\\projects\\my-app" />
            <button className="btn" onClick={async () => { const path = await window.termflow.dialog.openDir(); if (path) setCwd(path) }}>
              <FolderOpen size={14} /> Browse
            </button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!cwd.trim()} onClick={() => {
            const startupCommand = fullPermissions && selected?.bypassArgs ? `${selected.startupCommand} ${selected.bypassArgs}` : undefined
            addTerminal(kind, { cwd: cwd.trim(), startupCommand }); onClose()
          }}>Open terminal</button>
        </div>
      </div>
    </div>
  )
}

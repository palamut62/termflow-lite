import { useState, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import type { Snippet, ShellKind } from '../../../shared/types'
import { PROFILES } from '../profiles'
import { useModalClose } from '../hooks/useModalClose'

interface Props {
  snippet?: Snippet // if provided, edit mode
  onClose: () => void
}

const PARAM_RE = /\{\{(\w+)\}\}/g

function extractParams(command: string): string[] {
  const params = new Set<string>()
  let m: RegExpExecArray | null
  const re = new RegExp(PARAM_RE.source, 'g')
  while ((m = re.exec(command)) !== null) params.add(m[1])
  return [...params]
}

export default function SnippetModal({ snippet, onClose }: Props): React.JSX.Element {
  const createSnippet = useAppStore((s) => s.createSnippet)
  const updateSnippet = useAppStore((s) => s.updateSnippet)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)

  const [name, setName] = useState(snippet?.name || '')
  const [command, setCommand] = useState(snippet?.command || '')
  const [targetKind, setTargetKind] = useState<ShellKind | ''>(snippet?.targetKind || '')
  const [cwd, setCwd] = useState(snippet?.cwd || '')
  const [scope, setScope] = useState<'workspace' | 'global'>(snippet?.scope || 'workspace')
  useModalClose(onClose)

  const params = useMemo(() => extractParams(command), [command])

  const handleSubmit = async (): Promise<void> => {
    if (!name.trim() || !command.trim()) return
    const input = {
      name: name.trim(),
      command: command.trim(),
      params,
      targetKind: targetKind || undefined,
      cwd: cwd || undefined,
      scope,
      workspaceId: scope === 'workspace' ? activeWorkspaceId : null
    }
    if (snippet) {
      await updateSnippet(snippet.id, input as any)
    } else {
      await createSnippet(input as any)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 520 }}>
        <h3>{snippet ? 'Edit Snippet' : 'New Snippet'}</h3>

        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NPM Init" autoFocus />
        </div>

        <div className="field">
          <label>Command (use {'{{param}}'} for placeholders)</label>
          <textarea
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="e.g. npm install {{package_name}} --save-dev"
            rows={4}
            style={{ fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
          />
        </div>

        {params.length > 0 && (
          <div className="field">
            <label>Parameters</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {params.map((p) => (
                <span key={p} style={{
                  background: 'var(--accent-soft)', color: 'var(--accent)',
                  padding: '2px 8px', borderRadius: 5, fontSize: 11
                }}>
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <label>Target Shell (optional)</label>
          <select value={targetKind} onChange={(e) => setTargetKind(e.target.value as ShellKind | '')}>
            <option value="">Any Shell</option>
            {PROFILES.map((p) => (
              <option key={p.kind} value={p.kind}>{p.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Working Directory (optional)</label>
          <div className="path-pick">
            <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="e.g. C:\projects\myapp" />
            <button className="btn" onClick={async () => {
              const dir = await window.termflow.dialog.openDir()
              if (dir) setCwd(dir)
            }}>Browse</button>
          </div>
        </div>

        <div className="field">
          <label>Scope</label>
          <select value={scope} onChange={(e) => setScope(e.target.value as 'workspace' | 'global')}>
            <option value="workspace">Workspace</option>
            <option value="global">Global</option>
          </select>
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={handleSubmit} disabled={!name.trim() || !command.trim()}>
            {snippet ? 'Update' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

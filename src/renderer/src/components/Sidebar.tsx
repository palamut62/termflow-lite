import { lazy, Suspense, useState } from 'react'
import { Search, Plus, Folder, Bot, TerminalSquare, Trash2, X, Github, Download, Upload, Copy, LayoutTemplate, Save } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { getActiveTerminalId } from '../paneUtils'
import ConfirmModal from './ConfirmModal'
import PromptModal, { type PromptField } from './PromptModal'
// Rarely-opened heavy modal: code-split out of the startup bundle.
const TemplatesModal = lazy(() => import('./TemplatesModal'))

const XIcon = ({ size = 13 }: { size?: number }): React.JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5.3-7-6.1 7H1.7l8-9.2L1 2h7l4.8 6.4L18.9 2Zm-2.4 18h1.9L7.6 4H5.6l10.9 16Z" />
  </svg>
)

interface Props {
  onNewWorkspace: () => void
}

export default function Sidebar({ onNewWorkspace }: Props): React.JSX.Element {
  const workspaces = useAppStore((s) => s.workspaces)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const nodes = useAppStore((s) => s.nodes)
  const terminals = useAppStore((s) => s.terminals)
  const activeNodeId = useAppStore((s) => s.activeNodeId)
  const openWorkspace = useAppStore((s) => s.openWorkspace)
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace)
  const renameWorkspace = useAppStore((s) => s.renameWorkspace)
  const setActiveNode = useAppStore((s) => s.setActiveNode)
  const closeNode = useAppStore((s) => s.closeNode)
  const [filter, setFilter] = useState('')
  const [editingWs, setEditingWs] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templatePrompt, setTemplatePrompt] = useState<{ workspaceId: string; defaultName: string } | null>(null)
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    confirmLabel: string
    onConfirm: () => void
  } | null>(null)

  const filtered = workspaces.filter((w) => w.name.toLowerCase().includes(filter.toLowerCase()))
  const runningCount = Object.values(terminals).filter((t) => t.status === 'running').length

  return (
    <div className="sidebar">
      <div className="filter">
        <Search size={12} />
        <input placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>

      <div className="side-section-title">
        <span>Workspaces</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button title="Import workspace" onClick={async () => {
            setImportError(null)
            const result = await window.termflow.workspaces.import()
            if (result?.id) {
              const workspaces = await window.termflow.workspaces.list()
              useAppStore.setState({ workspaces })
              await openWorkspace(result.id)
            }
            if (result?.error) setImportError(result.error)
          }}>
            <Upload size={14} />
          </button>
          <button title="Export active workspace" onClick={async () => {
            const wsId = useAppStore.getState().activeWorkspaceId
            if (wsId) await window.termflow.workspaces.export(wsId)
          }}>
            <Download size={14} />
          </button>
          <button title="New workspace from template" onClick={() => setShowTemplates(true)}>
            <LayoutTemplate size={14} />
          </button>
          <button title="New workspace" onClick={onNewWorkspace}>
            <Plus size={14} />
          </button>
        </div>
      </div>
      {importError && <div className="side-error" role="alert">{importError}</div>}

      <div className="ws-list">
        {filtered.map((ws) => {
          const isActive = ws.id === activeWorkspaceId
          return (
            <div key={ws.id}>
              <div
                className={`ws-item ${isActive ? 'active' : ''}`}
                onClick={() => !isActive && openWorkspace(ws.id)}
              >
                <span className="ico">
                  <Folder size={14} />
                </span>
                {editingWs === ws.id ? (
                  <input
                    autoFocus
                    defaultValue={ws.name}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v) renameWorkspace(ws.id, v)
                      setEditingWs(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingWs(null)
                    }}
                    style={{
                      background: 'var(--bg-main)',
                      border: '1px solid var(--accent)',
                      borderRadius: 5,
                      color: 'var(--text-primary)',
                      fontSize: 12.5,
                      padding: '2px 6px',
                      outline: 'none',
                      width: '70%'
                    }}
                  />
                ) : (
                  <span
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onDoubleClick={(e) => {
                      e.stopPropagation()
                      setEditingWs(ws.id)
                    }}
                  >
                    {ws.name}
                  </span>
                )}
                {isActive && nodes.length > 0 && <span className="count">{nodes.length}</span>}
                <button
                  className="ws-action"
                  title="Clone workspace"
                  onClick={async (e) => {
                    e.stopPropagation()
                    const result = await window.termflow.workspaces.clone(ws.id)
                    if (result.id) {
                      const list = await window.termflow.workspaces.list()
                      useAppStore.setState({ workspaces: list })
                      await openWorkspace(result.id)
                    } else if (result.error) {
                      setImportError(result.error)
                    }
                  }}
                  style={{
                    marginLeft: isActive && nodes.length ? 6 : 'auto',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    display: 'inline-flex'
                  }}
                >
                  <Copy size={13} />
                </button>
                <button
                  className="ws-action"
                  title="Save as template"
                  onClick={(e) => {
                    e.stopPropagation()
                    setTemplatePrompt({ workspaceId: ws.id, defaultName: ws.name })
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'inline-flex' }}
                >
                  <Save size={13} />
                </button>
                <button
                  className="ws-action"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirm({
                      title: 'Delete workspace',
                      message: `Delete "${ws.name}"? Running terminals will be closed.`,
                      confirmLabel: 'Delete',
                      onConfirm: () => deleteWorkspace(ws.id)
                    })
                  }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'inline-flex' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {isActive && nodes.length > 0 && (
                <div className="term-sublist">
                  {nodes.map((n) => {
                    const activeId = getActiveTerminalId(n.activePaneId, n.panes, n.terminalId)
                    const t = activeId ? terminals[activeId] : undefined
                    return (
                      <div
                        key={n.id}
                        className={`term-subitem ${activeNodeId === n.id ? 'active' : ''}`}
                        onClick={() => setActiveNode(n.id)}
                      >
                        <span className={`dot ${t?.status ?? 'stopped'}`} />
                        <TerminalSquare size={13} />
                        <span
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}
                        >
                          {n.title}
                        </span>
                        <button
                          className="term-close"
                          title="Close"
                          onClick={(e) => {
                            e.stopPropagation()
                            const running = t?.status === 'running'
                            if (!running) {
                              closeNode(n.id, 'terminate')
                              return
                            }
                            setConfirm({
                              title: 'Close terminal',
                              message: `Close "${n.title}" and terminate its running process?`,
                              confirmLabel: 'Terminate',
                              onConfirm: () => closeNode(n.id, 'terminate')
                            })
                          }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="side-social">
        <span className="designer">palamut62</span>
        <div className="social-links">
          <button
            title="GitHub"
            onClick={() => window.open('https://github.com/palamut62', '_blank')}
          >
            <Github size={15} />
          </button>
          <button title="X" onClick={() => window.open('https://x.com/palamut62', '_blank')}>
            <XIcon size={13} />
          </button>
        </div>
      </div>

      <div className="side-runcount">{runningCount} running terminal{runningCount !== 1 ? 's' : ''}</div>
      {confirm && (
        <ConfirmModal
          {...confirm}
          tone="danger"
          onClose={() => setConfirm(null)}
        />
      )}
      {showTemplates && <Suspense fallback={null}><TemplatesModal onClose={() => setShowTemplates(false)} /></Suspense>}
      {templatePrompt && (
        <PromptModal
          title="Save as template"
          submitLabel="Save"
          fields={[{ key: 'name', label: 'Template name', required: true, defaultValue: templatePrompt.defaultName } as PromptField]}
          onSubmit={async (values) => {
            await window.termflow.templates.save(templatePrompt.workspaceId, values.name)
          }}
          onClose={() => setTemplatePrompt(null)}
        />
      )}
    </div>
  )
}

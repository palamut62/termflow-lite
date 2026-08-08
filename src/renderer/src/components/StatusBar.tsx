import { DownloadCloud, GitBranch, RefreshCw, TerminalSquare, TriangleAlert, Unplug } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { PtyBackendStatus } from '../../../shared/types'
import { APP_VERSION } from '../appInfo'
import { getLeafTerminalIds } from '../paneUtils'
import { useAppStore } from '../store/appStore'
import { prefixLabel } from '../prefixKeys'

/** Short, human-readable label for each electron-updater lifecycle state. */
function updateLabel(status: string, detail?: string): string {
  if (status === 'checking') return 'checking…'
  if (status === 'available') return `downloading${detail ? ` ${detail}` : ''}`
  if (status === 'downloading') return `downloading${detail ? ` ${detail}` : ''}`
  if (status === 'ready') return 'restart to update'
  if (status === 'current') return 'up to date'
  if (status === 'error') return 'check failed'
  if (status === 'development') return 'dev build'
  return ''
}

export default function StatusBar(): React.JSX.Element {
  const nodes = useAppStore((s) => s.nodes)
  const terminals = useAppStore((s) => s.terminals)
  const activeNodeId = useAppStore((s) => s.activeNodeId)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const workspaces = useAppStore((s) => s.workspaces)
  const prefixPending = useAppStore((s) => s.prefixPending)
  const prefixKey = useAppStore((s) => s.settings.prefixKey)
  const copyModePaneId = useAppStore((s) => s.copyModePaneId)
  const ws = workspaces.find((w) => w.id === activeWorkspaceId)
  // Whether terminals survive an app restart depends on the PTY backend; when
  // the persistent daemon is unavailable the user must know before relying on it.
  const [backend, setBackend] = useState<PtyBackendStatus | null>(null)
  useEffect(() => {
    window.termflow.pty.backendStatus().then(setBackend).catch(() => setBackend(null))
    return window.termflow.pty.onBackendChanged(setBackend)
  }, [])
  // Version + update state live here so a check is always one click away
  // instead of being buried in Settings > General.
  const updateChannel = useAppStore((s) => s.settings.updateChannel)
  const [update, setUpdate] = useState<{ status: string; detail?: string }>({ status: 'idle' })
  useEffect(() => window.termflow.updates.onStatus(setUpdate), [])
  const running = Object.values(terminals).filter((t) => t.status === 'running').length
  const detachedCount = useMemo(() => {
    const attached = new Set(
      nodes.flatMap((node) => (node.panes ? getLeafTerminalIds(node.panes) : node.terminalId ? [node.terminalId] : []))
    )
    return Object.values(terminals).filter((terminal) => !attached.has(terminal.id)).length
  }, [nodes, terminals])

  return (
    <div className="statusbar">
      <span className="sb-item">
        <GitBranch size={12} /> {ws?.name ?? 'No workspace'}
      </span>
      <span className="sb-item">
        <TerminalSquare size={12} /> {nodes.length} window{nodes.length !== 1 ? 's' : ''} · {running} running
      </span>
      {detachedCount > 0 && (
        <button
          className="sb-item sb-btn"
          title="Detached sessions"
          aria-label="Toggle detached sessions"
          onClick={() => window.dispatchEvent(new CustomEvent('termflow:toggle-detached'))}
        >
          <Unplug size={12} /> {detachedCount} detached
        </button>
      )}
      {prefixPending && (
        <span
          className="sb-item"
          title={`${prefixLabel(prefixKey)} pressed — waiting for a command key (press it again to send it to the terminal)`}
          style={{ fontWeight: 700, color: 'var(--warning)' }}
        >
          PREFIX
        </span>
      )}
      {copyModePaneId && (
        <span
          className="sb-item"
          title="Copy mode — hjkl/arrows move, Space or v selects, Enter or y copies, q or Escape exits"
          style={{ fontWeight: 700, color: 'var(--accent)' }}
        >
          COPY
        </span>
      )}
      {backend?.kind === 'in-process' && (
        <span
          className="sb-item"
          title={`Persistent session daemon unavailable${backend.reason ? ` (${backend.reason})` : ''} — terminals will close when TermFlow quits.`}
          style={{ color: 'var(--warning)' }}
        >
          <TriangleAlert size={12} /> no detach
        </span>
      )}
      <span className="sb-item" style={{ marginLeft: 'auto' }}>
        window: {nodes.find((n) => n.id === activeNodeId)?.title ?? '—'}
      </span>
      {update.status === 'ready' ? (
        <button
          className="sb-item sb-btn"
          title="An update has been downloaded — restart TermFlow to install it"
          onClick={() => void window.termflow.updates.install()}
          style={{ color: 'var(--success)', fontWeight: 700 }}
        >
          <DownloadCloud size={12} /> restart to update
        </button>
      ) : (
        <button
          className="sb-item sb-btn"
          title={`TermFlow v${APP_VERSION} — click to check for updates (${updateChannel} channel)`}
          aria-label="Check for updates"
          onClick={() => {
            setUpdate({ status: 'checking' })
            window.termflow.updates.check(updateChannel).catch(() => setUpdate({ status: 'error' }))
          }}
        >
          <RefreshCw size={12} /> v{APP_VERSION}
          {updateLabel(update.status, update.detail) && (
            <span style={{ marginLeft: 5, color: update.status === 'error' ? 'var(--warning)' : 'var(--text-muted)' }}>
              · {updateLabel(update.status, update.detail)}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

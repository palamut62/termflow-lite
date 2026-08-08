import { memo, useEffect, useState } from 'react'
import {
  RotateCw,
  Radio,
  CircleStop,
  Save,
  X,
  PanelRightClose,
  PanelRightOpen,
  Maximize2,
  AlertTriangle,
  GitBranch,
  Copy,
  Columns2,
  Rows2,
  Blocks,
  MoreHorizontal
} from 'lucide-react'
import TerminalView from '../components/TerminalView'
import CloseModal from '../components/CloseModal'
import WindowTabs from './WindowTabs'
import { ActivityBadge } from '../components/ActivityBadge'
import { useAppStore } from '../store/appStore'
import { profileFor } from '../profiles'
import type { PaneNode, SplitPane } from '../../../shared/types'
import { getLeafTerminalIds, countLeaves, setPaneRatio } from '../paneUtils'

function activeTermId(node: { activePaneId?: string; panes?: PaneNode; terminalId?: string }): string | undefined {
  return node.activePaneId || (node.panes ? getLeafTerminalIds(node.panes)[0] : node.terminalId)
}

function InfoArea({ nodeId }: { nodeId: string }): React.JSX.Element | null {
  const node = useAppStore((s) => s.nodes.find((n) => n.id === nodeId))
  const termId = node ? activeTermId(node) : undefined
  const terminal = useAppStore((s) => (termId ? s.terminals[termId] : undefined))
  const stats = useAppStore((s) => (termId ? s.procStats[termId] : undefined))
  if (!node || !terminal) return null
  const profile = profileFor(terminal.kind)

  return (
    <div className="tnode-info">
      <h4>Process</h4>
      <div className="info-row">
        <span>Shell</span>
        <span className="v">{profile.label}</span>
      </div>
      <div className="info-row">
        <span>Status</span>
        <span className="v" style={{ color: statusColor(terminal.status) }}>
          {terminal.status}
        </span>
      </div>
      <div className="info-row">
        <span>PID</span>
        <span className="v">{terminal.pid ?? '—'}</span>
      </div>

      <h4>Performance</h4>
      <div className="info-row">
        <span>CPU</span>
        <span className="v">{stats ? `${stats.cpu}%` : '—'}</span>
      </div>
      <div className="info-row">
        <span>RAM</span>
        <span className="v">{stats ? `${stats.memory} MB` : '—'}</span>
      </div>

      <h4>Context</h4>
      <div className="info-row">
        <span>CWD</span>
        <span className="v">{terminal.cwd}</span>
      </div>
    </div>
  )
}

function statusColor(status: string): string {
  if (status === 'running') return 'var(--success)'
  if (status === 'error') return 'var(--danger)'
  if (status === 'exited') return 'var(--warning)'
  return 'var(--text-secondary)'
}

/**
 * Leaf and split live in separate components on purpose: a leaf turning into a
 * split (and back) changes which hooks are needed, and calling a hook inside a
 * conditional branch corrupts React's hook order — that is what made the UI
 * break the moment a pane was split.
 */
function PaneLeaf({ nodeId, terminalId }: { nodeId: string; terminalId: string }): React.JSX.Element {
  const activeNodeId = useAppStore((s) => s.activeNodeId)
  const activePaneId = useAppStore((s) => s.nodes.find((n) => n.id === nodeId)?.activePaneId)
  const epoch = useAppStore((s) => s.termEpoch[terminalId] ?? 0)
  return (
    <div className="pane-leaf">
      <TerminalView
        key={`${terminalId}:${epoch}`}
        terminalId={terminalId}
        active={activeNodeId === nodeId && (activePaneId ?? terminalId) === terminalId}
      />
    </div>
  )
}

function PaneRenderer({ nodeId, pane, path }: { nodeId: string; pane: PaneNode; path: number[] }): React.JSX.Element {
  if (pane.type === 'leaf') return <PaneLeaf nodeId={nodeId} terminalId={pane.terminalId} />
  return <PaneSplit nodeId={nodeId} pane={pane} path={path} />
}

function PaneSplit({ nodeId, pane, path }: { nodeId: string; pane: SplitPane; path: number[] }): React.JSX.Element {
  const updateNode = useAppStore((s) => s.updateNode)
  const isHorizontal = pane.dir === 'horizontal'
  // Grow factors, not percentages: the splitter itself occupies space in the
  // same flex container, so two rounded percentages adding up to 100% overflow it.
  const wrap = (grow: number): React.CSSProperties => ({
    flex: `${grow} 1 0`,
    display: 'flex',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden'
  })

  const onSplitterDrag = (e: React.PointerEvent): void => {
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget as HTMLDivElement
    el.setPointerCapture(e.pointerId)
    const container = el.parentElement!
    const startPos = isHorizontal ? e.clientX : e.clientY
    const totalSize = isHorizontal ? container.clientWidth : container.clientHeight

    const onMove = (ev: PointerEvent): void => {
      const delta = (isHorizontal ? ev.clientX : ev.clientY) - startPos
      const newRatio = pane.ratio + delta / totalSize
      const n = useAppStore.getState().nodes.find(n => n.id === nodeId)
      if (n && n.panes) {
        updateNode(nodeId, { panes: setPaneRatio(n.panes, path, newRatio) })
      }
    }
    const onUp = (ev: PointerEvent): void => {
      try { el.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  return (
    <div className={`pane-split ${isHorizontal ? 'horizontal' : 'vertical'}`}>
      <div style={wrap(pane.ratio)}>
        <PaneRenderer nodeId={nodeId} pane={pane.a} path={[...path, 0]} />
      </div>
      <div className={`pane-splitter ${isHorizontal ? 'h' : 'v'}`} onPointerDown={onSplitterDrag} />
      <div style={wrap(1 - pane.ratio)}>
        <PaneRenderer nodeId={nodeId} pane={pane.b} path={[...path, 1]} />
      </div>
    </div>
  )
}

/**
 * The selected window, rendered full-bleed (tmux window). It owns the pane
 * tree, the pane header bar and the pane tab list — no card frame, no drag,
 * no resize handles, no z-index.
 */
function WindowViewInner({ id }: { id: string }): React.JSX.Element {
  const node = useAppStore((s) => s.nodes.find((n) => n.id === id))
  const termId = node ? activeTermId(node) : undefined
  const terminal = useAppStore((s) => (termId ? s.terminals[termId] : undefined))
  const terminals = useAppStore((s) => s.terminals)
  const restartNode = useAppStore((s) => s.restartNode)
  const closeNode = useAppStore((s) => s.closeNode)
  const duplicateNode = useAppStore((s) => s.duplicateNode)
  const splitNode = useAppStore((s) => s.splitNode)
  const closePaneInNode = useAppStore((s) => s.closePaneInNode)
  const setActivePane = useAppStore((s) => s.setActivePane)
  const setActiveNode = useAppStore((s) => s.setActiveNode)
  const addToBroadcastGroup = useAppStore((s) => s.addToBroadcastGroup)
  const removeFromBroadcastGroup = useAppStore((s) => s.removeFromBroadcastGroup)
  const startRecording = useAppStore((s) => s.startRecording)
  const stopRecording = useAppStore((s) => s.stopRecording)
  const saveRecording = useAppStore((s) => s.saveRecording)
  const recordingLimitWarning = useAppStore((s) => s.recordingLimitWarning)
  const dismissRecordingLimitWarning = useAppStore((s) => s.dismissRecordingLimitWarning)
  const gitStatus = useAppStore((s) => s.gitStatus)
  const fetchGitRemote = useAppStore((s) => s.fetchGitRemote)
  const refreshGitStatus = useAppStore((s) => s.refreshGitStatus)
  const copyGitBranch = useAppStore((s) => s.copyGitBranch)
  const broadcastEnabled = useAppStore((s) => s.broadcastEnabled)
  const broadcastGroup = useAppStore((s) => s.broadcastGroup)
  const infoPanelDefaultOpen = useAppStore((s) => s.settings.infoPanelDefaultOpen)
  const zoomedPaneId = useAppStore((s) => s.zoomedPaneId)

  // Info panel is view state (not persisted): it starts from the setting and
  // can be toggled per window from the ⋯ menu.
  const [showInfo, setShowInfo] = useState(infoPanelDefaultOpen)
  const [closing, setClosing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [showGitMenu, setShowGitMenu] = useState(false)
  const [gitActionMsg, setGitActionMsg] = useState<string | null>(null)
  const [showMoreMenu, setShowMoreMenu] = useState(false)

  // tmux `prefix x` on a single-pane window asks through the usual dialog.
  useEffect(() => {
    const onCloseRequest = (e: Event): void => {
      if ((e as CustomEvent<{ nodeId: string }>).detail?.nodeId === id) setClosing(true)
    }
    window.addEventListener('termflow:close-window', onCloseRequest)
    return () => window.removeEventListener('termflow:close-window', onCloseRequest)
  }, [id])

  useEffect(() => {
    if (!showMoreMenu) return undefined
    const onDocClick = (): void => setShowMoreMenu(false)
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [showMoreMenu])

  useEffect(() => {
    if (recordingLimitWarning && recordingLimitWarning.terminalId === termId) {
      setRecording(false)
      const t = setTimeout(() => dismissRecordingLimitWarning(), 8000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [recordingLimitWarning, termId, dismissRecordingLimitWarning])

  if (!node || !terminal) return <div />

  const hasError = node.status === 'error'
  const isBroadcasting = broadcastEnabled && termId !== undefined && broadcastGroup.includes(termId)
  const basePane: PaneNode = node.panes || { type: 'leaf', terminalId: node.terminalId!, title: node.title }
  // Zoom (tmux `prefix z`): render only the zoomed pane, full size.
  const zoomActive = !!zoomedPaneId && getLeafTerminalIds(basePane).includes(zoomedPaneId)
  const renderedPane: PaneNode = zoomActive
    ? { type: 'leaf', terminalId: zoomedPaneId!, title: terminals[zoomedPaneId!]?.name || node.title }
    : basePane

  return (
    <div className={`tnode ${hasError ? 'errored' : ''} ${isBroadcasting ? 'broadcasting' : ''}`}>
      <div className="tnode-header">
        {/* The window name is owned by the tab strip; repeating it as a title
            here is what made the two chrome rows look duplicated. */}
        <WindowTabs />
        {/* When this window is a single pane there is no per-pane tab to carry
            the activity dot, so surface it here next to the chrome. */}
        {termId && (!node.panes || countLeaves(node.panes) <= 1) && <ActivityBadge terminalId={termId} active showElapsed />}
        {hasError && <AlertTriangle size={14} color="var(--danger)" />}
        {recording && <span className="rec-dot" title="Recording in progress" />}
        {zoomActive && (
          <span
            className="kind-tag"
            title="Pane is zoomed — press the prefix then z to unzoom"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--warning)' }}
          >
            <Maximize2 size={11} /> ZOOM
          </span>
        )}
        {node.bypass && (
          <span
            title="This window was started with the permission-bypass flag"
            style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}
          >
            <AlertTriangle size={12} color="var(--danger)" />
          </span>
        )}
        {termId && terminal.cwd && gitStatus[termId] && (
          <span
            className="git-badge"
            style={{ cursor: 'pointer', position: 'relative' }}
            title={`${gitStatus[termId]!.branch}${gitStatus[termId]!.dirty ? ' (dirty)' : ''} — click for git actions`}
            onClick={() => setShowGitMenu((v) => !v)}
          >
            <GitBranch size={11} />
            {gitStatus[termId]!.branch}
            {gitStatus[termId]!.dirty && <span className="git-dirty">&#9679;</span>}
            {!!gitStatus[termId]!.ahead && <span style={{ marginLeft: 3, fontSize: 10 }}>↑{gitStatus[termId]!.ahead}</span>}
            {!!gitStatus[termId]!.behind && <span style={{ marginLeft: 2, fontSize: 10 }}>↓{gitStatus[termId]!.behind}</span>}
            {showGitMenu && (
              <div
                className="menu"
                style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, minWidth: 160 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="menu-item" onClick={async () => { setGitActionMsg('git fetch…'); const res = await fetchGitRemote(termId); setGitActionMsg(res.message); setTimeout(() => setGitActionMsg(null), 3000) }}>
                  <RotateCw size={12} /> Fetch
                </div>
                <div className="menu-item" onClick={() => { void refreshGitStatus(termId); setShowGitMenu(false) }}>
                  <GitBranch size={12} /> Refresh status
                </div>
                <div className="menu-item" onClick={() => { void copyGitBranch(termId); setShowGitMenu(false) }}>
                  <Copy size={12} /> Copy branch name
                </div>
              </div>
            )}
          </span>
        )}
        {gitActionMsg && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{gitActionMsg}</span>}
        {node.panes && countLeaves(node.panes) > 1 && (
          <div className="tnode-tabs" role="tablist" aria-label="Panes">
            {getLeafTerminalIds(node.panes).map((tid, i) => {
              const t = terminals[tid]
              const full = t?.name || tid.slice(0, 8)
              // Pane names are prefixed with the window title ("CMD 1.2"); showing
              // that prefix again next to the window tab is pure noise. Older
              // sessions whose pane name *is* the window title strip down to
              // nothing, so fall back to the full name rather than an empty chip.
              const stripped = full.startsWith(node.title) ? full.slice(node.title.length).replace(/^[.\s]+/, '') : full
              // A purely numeric leftover ("CMD 1.2" -> "2") repeats the index
              // badge next to it, which read as "2 2". Drop it and let the badge
              // speak; anything with real text still shows.
              const short = /^[\d.]+$/.test(stripped) ? '' : stripped || full
              const isActive = (node.activePaneId ?? getLeafTerminalIds(node.panes!)[0]) === tid
              return (
                <div
                  key={tid}
                  role="tab"
                  aria-selected={isActive}
                  title={full}
                  className={`tnode-tab ${isActive ? 'active' : ''}`}
                  onClick={() => setActivePane(id, tid)}
                  onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); closePaneInNode(id, tid) } }}
                >
                  <ActivityBadge terminalId={tid} active={isActive} size={6} />
                  <span className="pane-idx">{i + 1}</span>
                  {short && <span className="pane-name">{short}</span>}
                  <button
                    className="tab-close"
                    aria-label={`Close pane ${full}`}
                    onClick={(e) => { e.stopPropagation(); closePaneInNode(id, tid) }}
                  >
                    &times;
                  </button>
                </div>
              )
            })}
          </div>
        )}
        <div className="hactions">
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              className={`hbtn ${showMoreMenu ? 'active' : ''}`}
              title="More actions"
              onClick={(e) => {
                e.stopPropagation()
                setShowMoreMenu((v) => !v)
              }}
            >
              <MoreHorizontal size={15} />
            </button>
            {showMoreMenu && (
              <div
                className="menu"
                style={{ position: 'absolute', top: '100%', right: 0, zIndex: 20, minWidth: 210 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Icon = the divider you get: a vertical line splits side by
                    side, a horizontal line stacks. The lucide "split-square-*"
                    icons draw the opposite line to their name, which is exactly
                    what made these two look swapped. */}
                <div className="menu-item" onClick={() => { void splitNode(id, 'vertical'); setShowMoreMenu(false) }}>
                  <Columns2 size={13} /> Split pane right (side by side)
                </div>
                <div className="menu-item" onClick={() => { void splitNode(id, 'horizontal'); setShowMoreMenu(false) }}>
                  <Rows2 size={13} /> Split pane down (stacked)
                </div>
                <div className="menu-sep" />
                <div
                  className="menu-item"
                  onClick={() => {
                    // The panel reads the active window, so make this one active first.
                    setActiveNode(id)
                    window.dispatchEvent(new CustomEvent('termflow:command-blocks'))
                    setShowMoreMenu(false)
                  }}
                >
                  <Blocks size={13} /> Command blocks
                </div>
                <div className="menu-sep" />
                {termId && (
                  <div
                    className="menu-item"
                    onClick={() => {
                      if (broadcastGroup.includes(termId)) removeFromBroadcastGroup(termId)
                      else addToBroadcastGroup(termId)
                      setShowMoreMenu(false)
                    }}
                  >
                    <Radio size={13} /> {isBroadcasting ? 'Remove from broadcast group' : 'Add to broadcast group'}
                  </div>
                )}
                {termId && (
                  <div
                    className="menu-item"
                    onClick={async () => {
                      setShowMoreMenu(false)
                      if (recording) {
                        await stopRecording(termId)
                        setRecording(false)
                      } else {
                        startRecording(termId)
                        setRecording(true)
                      }
                    }}
                  >
                    <CircleStop size={13} /> {recording ? 'Stop recording' : 'Start recording'}
                  </div>
                )}
                {termId && (
                  <div className="menu-item" onClick={() => { saveRecording(termId); setShowMoreMenu(false) }}>
                    <Save size={13} /> Save recording
                  </div>
                )}
                <div className="menu-item" onClick={() => { setShowInfo((v) => !v); setShowMoreMenu(false) }}>
                  {showInfo ? <PanelRightClose size={13} /> : <PanelRightOpen size={13} />} {showInfo ? 'Hide info panel' : 'Show info panel'}
                </div>
                <div className="menu-item" onClick={() => { restartNode(id); setShowMoreMenu(false) }}>
                  <RotateCw size={13} /> Restart
                </div>
                <div className="menu-item" onClick={() => { duplicateNode(id); setShowMoreMenu(false) }}>
                  <Copy size={13} /> Duplicate into new window
                </div>
              </div>
            )}
          </div>
        </div>
        <button className="hbtn danger close-node" title="Close" aria-label={`Close ${node.title}`} onClick={() => setClosing(true)}>
          <X size={15} />
        </button>
        {recordingLimitWarning && recordingLimitWarning.terminalId === termId && (
          <div
            style={{
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--danger)',
              background: 'color-mix(in srgb, var(--danger) 14%, transparent)',
              borderTop: '1px solid var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>
              Recording hit the {recordingLimitWarning.reason === 'duration' ? 'duration' : 'size'} limit and was stopped automatically.
            </span>
            <button className="hbtn" onClick={() => dismissRecordingLimitWarning()} title="Dismiss">
              <X size={12} />
            </button>
          </div>
        )}
      </div>
      <div className="tnode-body">
        <PaneRenderer nodeId={id} pane={renderedPane} path={[]} />
        {showInfo && <InfoArea nodeId={id} />}
      </div>
      <div className="tnode-footer">
        <span className="cwd" title={terminal.cwd}>{terminal.cwd}</span>
        <span style={{ marginLeft: 'auto', color: statusColor(terminal.status) }}>
          {terminal.status} · pid {terminal.pid ?? '—'}
        </span>
      </div>

      {closing && (
        <CloseModal
          name={node.title}
          running={terminal.status === 'running'}
          onClose={() => setClosing(false)}
          onTerminate={() => {
            setClosing(false)
            closeNode(id, 'terminate')
          }}
          onDetach={() => {
            setClosing(false)
            closeNode(id, 'detach')
          }}
        />
      )}
    </div>
  )
}

export default memo(WindowViewInner)

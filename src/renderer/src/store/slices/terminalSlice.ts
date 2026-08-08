import type { StateCreator } from 'zustand'
import { nanoid } from 'nanoid'
import type { TerminalSession, WindowDef, ShellKind, ProcStats } from '../../../../shared/types'
import { profileFor } from '../../profiles'
import { getLeafTerminalIds, getActiveTerminalId, splitPane, closePane, countLeaves, buildTiledPane } from '../../paneUtils'
import {
  AI_BANNER_RE,
  pendingInitialPrompts,
  type NewTerminalOpts
} from '../storeShared'
import { initNotifications, notifyLongCommandDone, notifyError, notifyOutputPattern } from '../notifications'
import {
  awaitTerminalSize,
  forgetTerminalSize,
  markTerminalCreateReturned,
  markTerminalCreateStart,
  markTerminalFirstData
} from '../../terminalStartup'
import type { AppState } from '../appStore'

export interface TerminalSlice {
  terminals: Record<string, TerminalSession>
  procStats: Record<string, ProcStats>
  termEpoch: Record<string, number> // bump to force xterm remount on restart

  addTerminal: (kind: ShellKind, opts?: NewTerminalOpts) => Promise<void>
  duplicateNode: (nodeId: string) => Promise<void>
  closeNode: (nodeId: string, mode: 'terminate' | 'detach') => Promise<void>
  /** Terminate every terminal of the active workspace and drop its windows. */
  closeAllNodes: () => Promise<void>
  reattachTerminal: (terminalId: string) => Promise<void>
  terminateDetached: (terminalId: string) => Promise<void>
  clearAllDetached: () => Promise<void>
  restartNode: (nodeId: string) => Promise<void>

  // Broadcast (P0-4)
  broadcastEnabled: boolean
  broadcastGroup: string[]
  toggleBroadcast: () => void
  addToBroadcastGroup: (terminalId: string) => void
  removeFromBroadcastGroup: (terminalId: string) => void

  // Pane operations (P0-1)
  splitNode: (nodeId: string, dir: 'horizontal' | 'vertical') => Promise<void>
  closePaneInNode: (nodeId: string, terminalId: string, mode?: 'terminate' | 'detach') => Promise<void>
  setActivePane: (nodeId: string, terminalId: string) => void
  /** Merge every window of the active workspace into one tiled window. */
  tileAllWindows: () => void

  // Recording (P2-10)
  startRecording: (terminalId: string) => void
  stopRecording: (terminalId: string) => Promise<unknown[]>
  saveRecording: (terminalId: string) => Promise<void>
  recordingLimitWarning: { terminalId: string; reason: 'duration' | 'size' } | null
  dismissRecordingLimitWarning: () => void

  startRuntimeListeners: () => void
  refreshStats: () => Promise<void>
}

let listenersStarted = false
const cwdPersistTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const createTerminalSlice: StateCreator<AppState, [], [], TerminalSlice> = (set, get) => ({
  terminals: {},
  procStats: {},
  termEpoch: {},

  broadcastEnabled: false,
  broadcastGroup: [],

  recordingLimitWarning: null,

  addTerminal: async (kind, opts) => {
    const st = get()
    const wsId = st.activeWorkspaceId
    if (!wsId) return
    const ws = st.workspaces.find((w) => w.id === wsId)!
    const profile = profileFor(kind)
    const cleanProviderEnv = opts?.cleanProviderEnv ?? !!profile.startupCommand
    const termId = nanoid()
    const nodeId = nanoid()
    const name = opts?.name || `${profile.label} ${st.nodes.length + 1}`
    const cwd = opts?.cwd || ws.path
    const ts = new Date().toISOString()

    const session: TerminalSession = {
      id: termId,
      workspaceId: wsId,
      name,
      kind,
      shell: opts?.customShell || kind,
      args: opts?.args || [],
      cwd,
      env: opts?.env,
      cleanProviderEnv,
      // Optimistic: the pane is on screen before the PTY exists.
      status: 'starting',
      createdAt: ts,
      updatedAt: ts
    }
    // Persist only the plain startup command. The permission-bypass flag is
    // NEVER written into the saved session state; it is applied at runtime
    // (spawn time) based on the current agentAutoApprove setting so it cannot
    // silently re-enable itself on reload. (security)
    const baseStartup = opts?.startupCommand || profile.startupCommand
    session.startupCommand = baseStartup
    const bypassArgs = opts?.bypassArgs ?? profile.bypassArgs
    const useBypass = !!bypassArgs && st.settings.agentAutoApprove
    const runtimeStartup = useBypass ? `${baseStartup} ${bypassArgs}` : baseStartup

    // Tiled by default: a new terminal joins the active window as an extra
    // pane (tmux-style). With newTerminalTarget === 'window' — or when there is
    // no active window in this workspace, or the caller forces it — it opens as
    // its own window tab instead.
    const activeNode = st.nodes.find((n) => n.id === st.activeNodeId && n.workspaceId === wsId)
    const asPane = !opts?.forceNewWindow && st.settings.newTerminalTarget === 'pane' && !!activeNode

    const node: WindowDef = {
      id: nodeId,
      workspaceId: wsId,
      terminalId: termId,
      panes: { type: 'leaf', terminalId: termId, title: name },
      activePaneId: termId,
      title: name,
      status: 'running',
      bypass: useBypass
    }

    // ---- Optimistic render ----
    // The pane goes on screen NOW, before any IPC round trip. xterm mounts,
    // measures its real cell grid and reports it, so the PTY below can be
    // spawned at exactly that size (no startup resize, no ConPTY rewrap).
    if (asPane && activeNode) {
      set((s) => ({
        terminals: { ...s.terminals, [termId]: session },
        // Adding a pane breaks the zoom and leaves copy mode (tmux behaviour).
        zoomedPaneId: null,
        copyModePaneId: null,
        nodes: s.nodes.map((n) => {
          if (n.id !== activeNode.id) return n
          const current = n.panes || (n.terminalId ? { type: 'leaf' as const, terminalId: n.terminalId, title: n.title } : null)
          const existing = current ? getLeafTerminalIds(current) : []
          const leaves = [
            ...existing.map((tid) => ({ terminalId: tid, title: s.terminals[tid]?.name || n.title })),
            { terminalId: termId, title: name }
          ]
          return { ...n, panes: buildTiledPane(leaves)!, activePaneId: termId }
        })
      }))
    } else {
      set((s) => ({
        terminals: { ...s.terminals, [termId]: session },
        nodes: [...s.nodes, node],
        activeNodeId: nodeId
      }))
    }
    get().persist()

    // ---- Spawn (after the pane is visible) ----
    markTerminalCreateStart(termId, `${kind} terminal`)
    const size = await awaitTerminalSize(termId)
    let pid: number | undefined
    let failed = false
    try {
      const res = await window.termflow.pty.create(termId, {
        workspaceId: wsId,
        name,
        kind,
        shell: opts?.customShell,
        args: opts?.args,
        cwd,
        env: opts?.env,
        cleanProviderEnv,
        startupCommand: runtimeStartup,
        cols: size?.cols,
        rows: size?.rows,
        // Opt-in OSC 133 injection; off => the legacy spawn path.
        shellIntegration: st.settings.shellIntegration
      })
      pid = res.pid
    } catch (err) {
      failed = true
      console.error('[termflow] pty.create failed', err)
    }
    markTerminalCreateReturned(termId)

    // ConPTY can report pid 0 even though creation succeeded and the PTY is
    // usable. Only a rejected create call means startup failed.
    const persisted: TerminalSession = {
      ...session,
      pid: pid && pid > 0 ? pid : undefined,
      status: failed ? 'error' : 'running',
      updatedAt: new Date().toISOString()
    }

    // Queue an explicit initial prompt to be typed in once the CLI's startup
    // banner appears (one-shot).
    if (!failed && opts?.initialPrompt) pendingInitialPrompts.set(termId, opts.initialPrompt)

    set((s) => ({
      terminals: s.terminals[termId] ? { ...s.terminals, [termId]: persisted } : s.terminals,
      nodes: failed ? s.nodes.map((n) => (n.id === nodeId || n.id === activeNode?.id ? { ...n, status: 'error' as const } : n)) : s.nodes
    }))
    // Persistence must never gate the terminal becoming usable.
    void window.termflow.terminals.upsert(persisted).catch((err) => console.error('[termflow] terminals.upsert failed', err))
  },

  // Duplicate a node: spawn a fresh terminal with the same shell/cwd/startup
  // command as the source node's active terminal (feature: terminal duplicate).
  duplicateNode: async (nodeId) => {
    const st = get()
    const node = st.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const termId = getActiveTerminalId(node.activePaneId, node.panes, node.terminalId)
    const source = termId ? st.terminals[termId] : undefined
    if (!source) return
    await get().addTerminal(source.kind, {
      cwd: source.cwd,
      startupCommand: source.startupCommand,
      customShell: source.shell !== source.kind ? source.shell : undefined,
      args: source.args,
      name: `${node.title} copy`,
      env: source.env,
      cleanProviderEnv: source.cleanProviderEnv,
      // "Duplicate into new window" always opens a tab, whatever the setting.
      forceNewWindow: true
    })
  },

  closeNode: async (nodeId, mode) => {
    const st = get()
    const node = st.nodes.find((n) => n.id === nodeId)
    if (!node) return

    // If node has multiple panes with panes tree, close just the active pane
    if (node.panes && countLeaves(node.panes) > 1) {
      const activeTermId = node.activePaneId || getLeafTerminalIds(node.panes)[0]
      if (activeTermId) {
        return get().closePaneInNode(nodeId, activeTermId, mode)
      }
    }

    // Collect all terminalIds from pane tree
    const termIds = node.panes ? getLeafTerminalIds(node.panes) : (node.terminalId ? [node.terminalId] : [])
    if (mode === 'terminate') {
      for (const tid of termIds) {
        window.termflow.pty.kill(tid)
        forgetTerminalSize(tid)
        await window.termflow.terminals.remove(tid)
      }
    }
    const terminals = { ...st.terminals }
    if (mode === 'terminate') for (const tid of termIds) delete terminals[tid]
    set((s) => {
      const index = s.nodes.findIndex((n) => n.id === nodeId)
      const remaining = s.nodes.filter((n) => n.id !== nodeId)
      const gitStatus = { ...s.gitStatus }
      if (mode === 'terminate') for (const tid of termIds) delete gitStatus[tid]
      return {
        nodes: remaining,
        terminals,
        gitStatus,
        zoomedPaneId: null,
        // Closing the selected window falls back to its neighbour, like tmux.
        activeNodeId:
          s.activeNodeId === nodeId
            ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null
            : s.activeNodeId
      }
    })
    get().persist()
  },

  closeAllNodes: async () => {
    const st = get()
    // closeNode() on a split window closes only the *active* pane, so looping it
    // over the node list left every extra pane running. Collect the leaves up
    // front and tear them all down in one pass instead.
    const wsNodes = st.nodes.filter((n) => !st.activeWorkspaceId || n.workspaceId === st.activeWorkspaceId)
    if (wsNodes.length === 0) return
    const doomedNodes = new Set(wsNodes.map((n) => n.id))
    const termIds = wsNodes.flatMap((n) =>
      n.panes ? getLeafTerminalIds(n.panes) : n.terminalId ? [n.terminalId] : []
    )

    for (const tid of termIds) {
      window.termflow.pty.kill(tid)
      forgetTerminalSize(tid)
      await window.termflow.terminals.remove(tid)
    }

    // One set() at the end, reading the *current* state — the old per-node loop
    // ran concurrently and each call wrote back a stale `terminals` snapshot,
    // resurrecting sessions a sibling call had just deleted.
    set((s) => {
      const terminals = { ...s.terminals }
      const gitStatus = { ...s.gitStatus }
      for (const tid of termIds) {
        delete terminals[tid]
        delete gitStatus[tid]
      }
      const remaining = s.nodes.filter((n) => !doomedNodes.has(n.id))
      return {
        nodes: remaining,
        terminals,
        gitStatus,
        zoomedPaneId: null,
        copyModePaneId: null,
        activeNodeId: remaining.some((n) => n.id === s.activeNodeId) ? s.activeNodeId : remaining[0]?.id ?? null
      }
    })
    get().persist()
  },

  reattachTerminal: async (terminalId) => {
    const st = get()
    const terminal = st.terminals[terminalId]
    if (!terminal || !st.activeWorkspaceId || terminal.workspaceId !== st.activeWorkspaceId) return
    let nextTerminal = terminal
    if (terminal.status !== 'running') {
      try {
        const { pid } = await window.termflow.pty.create(terminal.id, {
          workspaceId: terminal.workspaceId,
          name: terminal.name,
          kind: terminal.kind,
          shell: terminal.shell,
          args: terminal.args,
          cwd: terminal.cwd,
          env: terminal.env,
          cleanProviderEnv: terminal.cleanProviderEnv,
          startupCommand: terminal.startupCommand,
          shellIntegration: st.settings.shellIntegration
        })
        nextTerminal = { ...terminal, pid, status: 'running', updatedAt: new Date().toISOString() }
      } catch {
        nextTerminal = { ...terminal, status: 'error', updatedAt: new Date().toISOString() }
      }
    }
    const nodeId = nanoid()
    const node: WindowDef = {
      id: nodeId,
      workspaceId: terminal.workspaceId,
      terminalId,
      panes: { type: 'leaf', terminalId, title: terminal.name },
      activePaneId: terminalId,
      title: terminal.name,
      status: nextTerminal.status === 'running' ? 'running' : 'error'
    }
    set((s) => ({
      terminals: { ...s.terminals, [terminalId]: nextTerminal },
      nodes: [...s.nodes, node],
      activeNodeId: nodeId
    }))
    await window.termflow.terminals.upsert(nextTerminal)
    get().persist()
  },

  // Permanently kill a detached (card-less but still running) session and drop
  // it from the store — the panel's cleanup action so orphaned processes don't
  // linger forever. Only valid for terminals not attached to any node.
  terminateDetached: async (terminalId) => {
    const st = get()
    if (!st.terminals[terminalId]) return
    try {
      window.termflow.pty.kill(terminalId)
      forgetTerminalSize(terminalId)
      await window.termflow.terminals.remove(terminalId)
    } catch {
      // Process may already be gone; still drop it from state below.
    }
    set((s) => {
      const terminals = { ...s.terminals }
      delete terminals[terminalId]
      const gitStatus = { ...s.gitStatus }
      delete gitStatus[terminalId]
      return { terminals, gitStatus }
    })
    get().persist()
  },

  // Terminate & remove every detached (card-less) session at once — the dock's
  // bulk-cleanup action for when orphaned sessions have piled up.
  clearAllDetached: async () => {
    const st = get()
    const attached = new Set(
      st.nodes.flatMap((n) => (n.panes ? getLeafTerminalIds(n.panes) : n.terminalId ? [n.terminalId] : []))
    )
    const detachedIds = Object.values(st.terminals)
      .filter((t) => !attached.has(t.id))
      .map((t) => t.id)
    if (!detachedIds.length) return
    for (const tid of detachedIds) {
      try {
        window.termflow.pty.kill(tid)
        forgetTerminalSize(tid)
        await window.termflow.terminals.remove(tid)
      } catch {
        // Already gone; still drop from state below.
      }
    }
    set((s) => {
      const terminals = { ...s.terminals }
      const gitStatus = { ...s.gitStatus }
      for (const tid of detachedIds) {
        delete terminals[tid]
        delete gitStatus[tid]
      }
      return { terminals, gitStatus }
    })
    get().persist()
  },

  restartNode: async (nodeId) => {
    const st = get()
    const node = st.nodes.find((n) => n.id === nodeId)
    if (!node) return
    const termId = getActiveTerminalId(node.activePaneId, node.panes, node.terminalId)
    if (!termId) return
    const res = await window.termflow.pty.restart(termId)
    if (res) {
      set((s) => ({
        terminals: {
          ...s.terminals,
          [termId]: { ...s.terminals[termId], pid: res.pid, status: 'running' }
        },
        nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, status: 'running' } : n)),
        termEpoch: { ...s.termEpoch, [termId]: (s.termEpoch[termId] ?? 0) + 1 }
      }))
    }
  },

  // ---- Broadcast ----
  toggleBroadcast: () => set((s) => ({ broadcastEnabled: !s.broadcastEnabled })),
  addToBroadcastGroup: (terminalId) =>
    set((s) => ({ broadcastGroup: s.broadcastGroup.includes(terminalId) ? s.broadcastGroup : [...s.broadcastGroup, terminalId] })),
  removeFromBroadcastGroup: (terminalId) =>
    set((s) => ({ broadcastGroup: s.broadcastGroup.filter((tid) => tid !== terminalId) })),

  // ---- Pane Operations ----
  splitNode: async (nodeId, dir) => {
    const st = get()
    const node = st.nodes.find((n) => n.id === nodeId)
    if (!node) return

    const activeTermId = node.activePaneId || (node.panes ? getLeafTerminalIds(node.panes)[0] : node.terminalId)
    if (!activeTermId) return

    const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)!
    const activeTerminal = st.terminals[activeTermId]
    const newTermId = nanoid()
    const inheritedKind = activeTerminal?.kind ?? 'cmd'
    // tmux-style `window.pane` naming. Appending " split" to the *active* pane's
    // name compounded on every split ("CMD 1 split split split") and made the
    // pane tab strip unreadable; numbering off the window keeps names flat.
    const existingLeafCount = node.panes ? countLeaves(node.panes) : 1
    const usedNames = new Set(
      (node.panes ? getLeafTerminalIds(node.panes) : [])
        .map((tid) => st.terminals[tid]?.name)
        .filter((n): n is string => !!n)
    )
    let paneIndex = existingLeafCount + 1
    while (usedNames.has(`${node.title}.${paneIndex}`)) paneIndex++
    const newName = `${node.title}.${paneIndex}`
    const cwd = activeTerminal?.cwd || ws.path
    const cleanProviderEnv = activeTerminal?.cleanProviderEnv ?? !!profileFor(inheritedKind).startupCommand
    const ts = new Date().toISOString()

    const session: TerminalSession = {
      id: newTermId,
      workspaceId: st.activeWorkspaceId!,
      name: newName,
      kind: inheritedKind,
      shell: activeTerminal?.shell || inheritedKind,
      args: activeTerminal?.args || [],
      cwd,
      cleanProviderEnv,
      status: 'starting',
      createdAt: ts,
      updatedAt: ts
    }

    const currentPane = node.panes || { type: 'leaf' as const, terminalId: node.terminalId!, title: node.title }
    const existingTitle = getLeafTerminalIds(currentPane).includes(activeTermId) ? (get().terminals[activeTermId]?.name || node.title) : node.title
    const newPane = splitPane(currentPane, activeTermId, dir === 'vertical' ? 'horizontal' : 'vertical', existingTitle, newTermId, newName)

    // Optimistic render: the split appears immediately, the PTY follows.
    set((s) => ({
      terminals: { ...s.terminals, [newTermId]: session },
      // Splitting breaks the zoom (tmux behaviour) and leaves copy mode.
      zoomedPaneId: null,
      copyModePaneId: null,
      nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, panes: newPane, activePaneId: newTermId } : n)
    }))
    get().persist()

    markTerminalCreateStart(newTermId, `${inheritedKind} split`)
    const size = await awaitTerminalSize(newTermId)
    let failed = false
    try {
      const res = await window.termflow.pty.create(newTermId, {
        workspaceId: st.activeWorkspaceId!,
        name: newName,
        kind: inheritedKind,
        shell: activeTerminal?.shell,
        args: activeTerminal?.args,
        cwd,
        cleanProviderEnv,
        cols: size?.cols,
        rows: size?.rows,
        shellIntegration: st.settings.shellIntegration
      })
      session.pid = res.pid
      session.status = 'running'
    } catch (err) {
      failed = true
      session.status = 'error'
      console.error('[termflow] pty.create failed', err)
    }
    markTerminalCreateReturned(newTermId)

    const spawned: TerminalSession = { ...session, updatedAt: new Date().toISOString() }
    set((s) => ({
      terminals: s.terminals[newTermId] ? { ...s.terminals, [newTermId]: spawned } : s.terminals,
      nodes: failed ? s.nodes.map((n) => (n.id === nodeId ? { ...n, status: 'error' as const } : n)) : s.nodes
    }))
    void window.termflow.terminals.upsert(spawned).catch((err) => console.error('[termflow] terminals.upsert failed', err))
  },

  closePaneInNode: async (nodeId, terminalId, mode = 'terminate') => {
    const st = get()
    const node = st.nodes.find((n) => n.id === nodeId)
    if (!node?.panes) return

    if (mode === 'terminate') {
      window.termflow.pty.kill(terminalId)
      forgetTerminalSize(terminalId)
      await window.termflow.terminals.remove(terminalId)
    }

    const newPane = closePane(node.panes, terminalId)
    // Closing a pane breaks the zoom (tmux behaviour) and leaves copy mode.
    set({ zoomedPaneId: null, copyModePaneId: null })
    const terminals = { ...st.terminals }
    if (mode === 'terminate') delete terminals[terminalId]

    if (!newPane) {
      // All panes closed — remove node
      set((s) => {
        const gitStatus = { ...s.gitStatus }
        if (mode === 'terminate') delete gitStatus[terminalId]
        const index = s.nodes.findIndex((n) => n.id === nodeId)
        const remaining = s.nodes.filter((n) => n.id !== nodeId)
        return {
          nodes: remaining,
          terminals,
          gitStatus,
          activeNodeId:
            s.activeNodeId === nodeId
              ? remaining[Math.min(index, remaining.length - 1)]?.id ?? null
              : s.activeNodeId
        }
      })
    } else {
      const remainingLeaves = getLeafTerminalIds(newPane)
      set((s) => {
        const gitStatus = { ...s.gitStatus }
        if (mode === 'terminate') delete gitStatus[terminalId]
        return {
        terminals,
        gitStatus,
        nodes: s.nodes.map((n) => n.id === nodeId ? {
          ...n,
          panes: newPane,
          activePaneId: remainingLeaves.includes(node.activePaneId || '') ? node.activePaneId : remainingLeaves[0],
          terminalId: newPane.type === 'leaf' ? newPane.terminalId : n.terminalId
        } : n)
      }})
    }
    get().persist()
  },

  setActivePane: (nodeId, terminalId) => {
    // Moving to another pane leaves copy mode (tmux behaviour).
    set((s) => ({
      copyModePaneId: s.copyModePaneId === terminalId ? s.copyModePaneId : null,
      nodes: s.nodes.map((n) => n.id === nodeId ? { ...n, activePaneId: terminalId } : n)
    }))
    get().persist()
  },

  // Merge every window of the active workspace into a single tiled window
  // (tmux `join-pane` for the whole session). No PTY is touched.
  tileAllWindows: () => {
    const st = get()
    const wsNodes = st.nodes.filter((n) => !st.activeWorkspaceId || n.workspaceId === st.activeWorkspaceId)
    if (wsNodes.length < 2) return

    const target = wsNodes[0]
    const leaves: Array<{ terminalId: string; title: string }> = []
    for (const n of wsNodes) {
      const ids = n.panes ? getLeafTerminalIds(n.panes) : n.terminalId ? [n.terminalId] : []
      for (const tid of ids) leaves.push({ terminalId: tid, title: st.terminals[tid]?.name || n.title })
    }
    const panes = buildTiledPane(leaves)
    if (!panes) return

    const previousActive = getActiveTerminalId(
      st.nodes.find((n) => n.id === st.activeNodeId)?.activePaneId,
      st.nodes.find((n) => n.id === st.activeNodeId)?.panes,
      st.nodes.find((n) => n.id === st.activeNodeId)?.terminalId
    )
    const survivors = leaves.map((l) => l.terminalId)
    const activePaneId = previousActive && survivors.includes(previousActive) ? previousActive : survivors[0]
    const mergedIds = new Set(wsNodes.slice(1).map((n) => n.id))

    set((s) => ({
      zoomedPaneId: null,
      copyModePaneId: null,
      activeNodeId: target.id,
      nodes: s.nodes
        .filter((n) => !mergedIds.has(n.id))
        .map((n) => (n.id === target.id ? { ...n, panes, activePaneId, terminalId: activePaneId } : n))
    }))
    get().persist()
  },

  startRuntimeListeners: () => {
    if (listenersStarted) return
    listenersStarted = true
    initNotifications()
    window.termflow.pty.onData((id, data) => {
      markTerminalFirstData(id)
      // Fire the queued initial prompt once the CLI's own startup banner shows
      // up in its output (one-shot per terminal).
      const queuedPrompt = pendingInitialPrompts.get(id)
      if (queuedPrompt && AI_BANNER_RE.test(data)) {
        pendingInitialPrompts.delete(id)
        window.termflow.pty.write(id, `${queuedPrompt}\r`)
      }
    })
    window.termflow.pty.onExit((id, exitCode, durationMs) => {
      const st = get()
      const t = st.terminals[id]
      if (t) notifyLongCommandDone(id, t.name, exitCode, durationMs)
      // Check if this terminalId belongs to any node (pane-tree aware)
      const nodeWithTerm = st.nodes.find((n) => {
        if (n.terminalId === id) return true
        if (n.panes) return getLeafTerminalIds(n.panes).includes(id)
        return false
      })
      set((s) => {
        const t = s.terminals[id]
        if (!t) return {}
        return {
          terminals: { ...s.terminals, [id]: { ...t, status: 'exited', pid: undefined } },
          nodes: s.nodes.map((n) => (n === nodeWithTerm ? { ...n, status: 'stopped' } : n))
        }
      })
      // Fire matching process_exit task triggers ("when command finishes, run X"). (feature: expanded task triggers)
      if (nodeWithTerm) {
        for (const trigger of get().taskTriggers) {
          if (trigger.kind !== 'process_exit' || !trigger.enabled || trigger.sourceNodeId !== nodeWithTerm.id) continue
          const filter = trigger.exitCodeFilter ?? 'any'
          if (filter === 'zero' && exitCode !== 0) continue
          if (filter === 'nonzero' && exitCode === 0) continue
          void get().runTaskTriggerAction(trigger)
        }
      }
    })
    window.termflow.pty.onActivity((id, error) => {
      if (!error) return
      const t = get().terminals[id]
      if (t) notifyError(id, t.name)
      set((s) => ({
        nodes: s.nodes.map((n) => {
          const isMatch = n.terminalId === id || (n.panes ? getLeafTerminalIds(n.panes).includes(id) : false)
          return isMatch && n.id !== s.activeNodeId ? { ...n, status: 'error' } : n
        })
      }))
    })
    window.termflow.pty.onAwaiting((id) => {
      const t = get().terminals[id]
      if (t) notifyOutputPattern(id, t.name)
    })
    // OSC 7 cwd tracking: keep the terminal's cwd (and thus the git badge)
    // in sync as the user `cd`s around, without polling. (deep git)
    window.termflow.pty.onCwd((id, cwd) => {
      const terminal = get().terminals[id]
      if (!terminal || terminal.cwd === cwd) return
      const updated = { ...terminal, cwd, updatedAt: new Date().toISOString() }
      set((s) => ({ terminals: { ...s.terminals, [id]: updated } }))
      const pending = cwdPersistTimers.get(id)
      if (pending) clearTimeout(pending)
      cwdPersistTimers.set(id, setTimeout(() => {
        cwdPersistTimers.delete(id)
        const latest = get().terminals[id]
        if (latest) void window.termflow.terminals.upsert(latest)
      }, 300))
    })
    window.termflow.recording.onLimit((id, reason) => {
      set({ recordingLimitWarning: { terminalId: id, reason } })
    })
    // Poll process CPU/RAM. Large workspaces need a slower cadence to avoid UI stalls.
    const poll = (): void => {
      get().refreshStats()
      const count = Object.keys(get().terminals).length
      setTimeout(poll, count > 8 ? 6000 : 2500)
    }
    setTimeout(poll, 1500)
  },

  refreshStats: async () => {
    try {
      const procStats = await window.termflow.proc.stats()
      set({ procStats })
    } catch {
      /* ignore */
    }
  },

  // ---- Recording ----
  startRecording: (terminalId) => window.termflow.recording.start(terminalId),
  stopRecording: (terminalId) => window.termflow.recording.stop(terminalId),
  saveRecording: (terminalId) => window.termflow.recording.save(terminalId),
  dismissRecordingLimitWarning: () => set({ recordingLimitWarning: null })
})

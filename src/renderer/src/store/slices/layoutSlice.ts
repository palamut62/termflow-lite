import type { StateCreator } from 'zustand'
import type { WindowDef } from '../../../../shared/types'
import type { AppState } from '../appStore'

/**
 * Window (tmux window) state. There is no free canvas anymore: the selected
 * window fills the whole work area and `nodes` is simply the tab-strip order.
 */
export interface LayoutSlice {
  nodes: WindowDef[]
  activeNodeId: string | null
  developerCenterOpen: boolean
  /** Zoomed pane (tmux `prefix z`). Runtime only — never persisted. */
  zoomedPaneId: string | null
  /** True while the tmux prefix was pressed and we wait for the command key. */
  prefixPending: boolean
  /** Pane currently in copy mode (tmux `prefix [`). Runtime only — never persisted. */
  copyModePaneId: string | null

  setCopyModePane: (terminalId: string | null) => void
  setZoomedPane: (terminalId: string | null) => void
  toggleZoomedPane: (terminalId: string) => void
  setPrefixPending: (pending: boolean) => void
  setActiveNode: (nodeId: string | null) => void
  setDeveloperCenterOpen: (open: boolean) => void
  updateNode: (nodeId: string, patch: Partial<WindowDef>) => void
  renameNode: (nodeId: string, title: string) => void
  moveNode: (nodeId: string, targetIndex: number) => void

  persist: () => void
  flushPersist: () => void
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

export const createLayoutSlice: StateCreator<AppState, [], [], LayoutSlice> = (set, get) => ({
  nodes: [],
  activeNodeId: null,
  developerCenterOpen: false,
  zoomedPaneId: null,
  prefixPending: false,
  copyModePaneId: null,

  setCopyModePane: (terminalId) => set({ copyModePaneId: terminalId }),

  setZoomedPane: (terminalId) => set({ zoomedPaneId: terminalId }),

  toggleZoomedPane: (terminalId) =>
    set((s) => ({ zoomedPaneId: s.zoomedPaneId === terminalId ? null : terminalId })),

  setPrefixPending: (pending) => set({ prefixPending: pending }),

  setActiveNode: (nodeId) => {
    if (!nodeId) {
      set({ activeNodeId: null, zoomedPaneId: null, copyModePaneId: null })
      return
    }
    set((s) => ({
      activeNodeId: nodeId,
      // Switching windows drops the zoom, like tmux.
      zoomedPaneId: null,
      // ...and leaves copy mode.
      copyModePaneId: null,
      // Selecting a window clears its "unseen error" marker, like before.
      nodes: s.nodes.map((n) => (n.id === nodeId && n.status === 'error' ? { ...n, status: 'idle' as const } : n))
    }))
    get().persist()
  },

  setDeveloperCenterOpen: (open) => set({ developerCenterOpen: open }),

  updateNode: (nodeId, patch) => {
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }))
    get().persist()
  },

  renameNode: (nodeId, title) => {
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === nodeId ? { ...n, title } : n)) }))
    get().persist()
  },

  // Tab-strip drag-to-reorder: array order == tab order.
  moveNode: (nodeId, targetIndex) => {
    const st = get()
    const from = st.nodes.findIndex((n) => n.id === nodeId)
    if (from < 0) return
    const to = Math.max(0, Math.min(targetIndex, st.nodes.length - 1))
    if (from === to) return
    const nodes = st.nodes.slice()
    const [moved] = nodes.splice(from, 1)
    nodes.splice(to, 0, moved)
    set({ nodes })
    get().persist()
  },

  persist: () => {
    const st = get()
    if (!st.activeWorkspaceId) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => get().flushPersist(), 400)
  },

  flushPersist: () => {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const s = get()
    if (!s.activeWorkspaceId) return
    window.termflow.layout.save({
      workspaceId: s.activeWorkspaceId,
      nodes: s.nodes,
      activeNodeId: s.activeNodeId || undefined
    })
  }
})

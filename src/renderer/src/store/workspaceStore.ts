import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { PersistedSession } from '../../../shared/types'
import { useTerminalStore } from './terminalStore'
import { useSavedCommandStore, type SavedCommand } from './savedCommandStore'
import { isValidPaneTree, paneTerminalIds, type PaneNode } from '../paneUtils'

export interface Workspace { id: string; name: string; savedAt: number; session: PersistedSession; commands: SavedCommand[] }
const KEY = 'termflow.workspaces.v1'
function load(): Workspace[] { try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.filter(w => w && typeof w.id === 'string' && typeof w.name === 'string' && Array.isArray(w.session?.tabs) && Array.isArray(w.commands)).slice(0, 50) : [] } catch { return [] } }
function persist(workspaces: Workspace[]): void { localStorage.setItem(KEY, JSON.stringify(workspaces)) }

export const useWorkspaceStore = create<{ workspaces: Workspace[]; save(name: string): void; remove(id: string): void; replace(workspaces: Workspace[]): void }>((set, get) => ({
  workspaces: load(),
  save(name) {
    const state = useTerminalStore.getState()
    if (!name.trim() || !state.tabs.length) return
    const selected = new Set(state.paneTree ? paneTerminalIds(state.paneTree) : state.tabs.map(t => t.id))
    const tabs = state.tabs.filter(t => selected.has(t.id)).map(t => ({ id: t.id, title: t.title, profileId: t.profileId, cwd: t.cwd || t.launchCwd, permissionMode: t.permissionMode, model: t.model, resumeSession: t.resumeSession }))
    const folders = new Set(tabs.map(t => t.cwd).filter(Boolean))
    const item: Workspace = { id: nanoid(10), name: name.trim(), savedAt: Date.now(), session: {
      version: 1, tabs, activeTabId: state.activeTabId, paneTree: state.paneTree,
      splitDirection: state.splitDirection, splitRatio: state.splitRatio, workspaceCwd: state.workspaceCwd
    }, commands: useSavedCommandStore.getState().commands.filter(c => c.cwd && folders.has(c.cwd)).map(c => ({ ...c, activeTabId: undefined, enabled: false, results: [] })) }
    const workspaces = [...get().workspaces, item].slice(-50)
    persist(workspaces); set({ workspaces })
  },
  remove(id) { const workspaces = get().workspaces.filter(w => w.id !== id); persist(workspaces); set({ workspaces }) },
  replace(workspaces) { persist(workspaces); set({ workspaces }) }
}))

export function openWorkspace(workspace: Workspace): void {
  const ids = new Map<string, string>()
  for (const tab of workspace.session.tabs) {
    const id = useTerminalStore.getState().addTab(tab.profileId, false, tab.cwd, undefined, tab.permissionMode)
    ids.set(tab.id, id)
    useTerminalStore.setState(state => ({ tabs: state.tabs.map(t => t.id === id ? { ...t, model: tab.model, title: tab.title, resumeSession: tab.resumeSession } : t) }))
  }
  const remap = (node: PaneNode): PaneNode => node.type === 'leaf' ? { ...node, terminalId: ids.get(node.terminalId)! } : { ...node, a: remap(node.a), b: remap(node.b) }
  const tree = isValidPaneTree(workspace.session.paneTree, new Set(ids.keys())) ? remap(workspace.session.paneTree as PaneNode) : null
  useTerminalStore.setState({ paneTree: tree, splitTabIds: tree ? paneTerminalIds(tree) : null,
    splitDirection: tree ? workspace.session.splitDirection : null, splitRatio: workspace.session.splitRatio,
    activeTabId: ids.get(workspace.session.activeTabId ?? '') ?? [...ids.values()][0], workspaceCwd: workspace.session.workspaceCwd || workspace.session.tabs[0]?.cwd })
  const store = useSavedCommandStore.getState()
  const existing = new Set(store.commands.map(c => c.id))
  store.replace([...store.commands, ...workspace.commands.filter(c => !existing.has(c.id)).map(c => ({ ...c, enabled: false, activeTabId: undefined }))])
}

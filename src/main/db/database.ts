import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync } from 'fs'
import fsp from 'fs/promises'
import { nanoid } from 'nanoid'
import type {
  Workspace,
  TerminalSession,
  WorkspaceLayout,
  WindowDef,
  AppSettings,
  Snippet,
  HighlightRule,
  SshProfile,
  EnvEntry,
  PaneNode
} from '../../shared/types'
import { DEFAULT_SETTINGS } from '../../shared/types'

/**
 * Lightweight JSON-file persistence for workspaces, terminals and canvas
 * layouts. The API mirrors a repository layer so the storage backend can be
 * swapped later without touching IPC.
 * Writes are atomic (temp file + rename). (PRD §15 — same schema, JSON shape.)
 *
 * Mutations are debounced (500ms trailing); flushPersist() is called from the
 * app's before-quit handler so pending writes never get lost on shutdown.
 */

interface StoreShape {
  workspaces: Workspace[]
  terminals: TerminalSession[]
  nodes: WindowDef[]
  /** Per-workspace UI state. Older builds also stored layoutMode/zoom/x/y here; those are dropped on load. */
  viewports: Record<string, { activeNodeId?: string }>
  settings: AppSettings
  snippets: Snippet[]
  highlightRules: HighlightRule[]
  sshProfiles: SshProfile[]
  envVars: EnvEntry[]
}

let store: StoreShape
let filePath: string

function empty(): StoreShape {
  return {
    workspaces: [], terminals: [], nodes: [],
    viewports: {}, settings: { ...DEFAULT_SETTINGS },
    snippets: [], highlightRules: [], sshProfiles: [], envVars: []
  }
}

// ---- Settings ----

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...store.settings }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  store.settings = { ...getSettings(), ...patch }
  persist()
  return store.settings
}

// ---- Persistence (debounced, atomic write) ----

const PERSIST_DEBOUNCE_MS = 500
const BACKUP_INTERVAL_MS = 60_000

let persistTimer: ReturnType<typeof setTimeout> | null = null
let lastBackupAt = 0

/**
 * Synchronous atomic write. Backs up at most once per BACKUP_INTERVAL_MS.
 * Only used on the shutdown path, where the process may die at any moment.
 */
function writeStore(): void {
  const tmp = filePath + '.flush.tmp'
  writeFileSync(tmp, JSON.stringify(store), 'utf-8')
  const nowMs = Date.now()
  if (existsSync(filePath) && nowMs - lastBackupAt >= BACKUP_INTERVAL_MS) {
    copyFileSync(filePath, filePath + '.bak')
    lastBackupAt = nowMs
  }
  renameSync(tmp, filePath)
}

/**
 * Asynchronous atomic write, serialized through a single-slot queue so two
 * writes can never interleave on the same temp file. The JSON is serialized
 * eagerly (on the caller's tick) so the snapshot matches the state at schedule
 * time; only the disk I/O is deferred, keeping the main thread responsive.
 */
let writeChain: Promise<void> = Promise.resolve()
let shuttingDown = false

function writeStoreAsync(): Promise<void> {
  const payload = JSON.stringify(store)
  writeChain = writeChain.then(async () => {
    if (shuttingDown) return // flushPersist() owns the file from here on
    const tmp = filePath + '.tmp'
    await fsp.writeFile(tmp, payload, 'utf-8')
    if (shuttingDown) return
    const nowMs = Date.now()
    if (existsSync(filePath) && nowMs - lastBackupAt >= BACKUP_INTERVAL_MS) {
      await fsp.copyFile(filePath, filePath + '.bak')
      lastBackupAt = nowMs
    }
    await fsp.rename(tmp, filePath)
  }).catch((err) => {
    console.error('[termflow] persist failed:', err)
  })
  return writeChain
}

/**
 * Schedule a persist. Trailing debounce: coalesces bursts of mutations into a
 * single disk write after PERSIST_DEBOUNCE_MS of quiescence. If a timer is
 * already pending it is left in place (no reset), so writes cannot be starved.
 */
function persist(): void {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    void writeStoreAsync()
  }, PERSIST_DEBOUNCE_MS)
}

/**
 * Cancel any pending debounced write and flush the store to disk immediately
 * (synchronous). Must be called on app shutdown so buffered mutations are not
 * lost.
 */
export function flushPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  // Any queued/in-flight async write is abandoned: this synchronous write has
  // the newest state and its own temp file, so the two cannot interleave.
  shuttingDown = true
  writeStore()
}

/** Test seam: wait for every scheduled async write to reach the disk. */
export function __drainPersistForTests(): Promise<void> {
  return writeChain
}

/** Test seam: re-enable async persistence after a flush. */
export function __resumePersistForTests(): void {
  shuttingDown = false
}

function now(): string {
  return new Date().toISOString()
}

// Ajan orkestrasyonu kaldırıldı: eski sürümlerin diskte bıraktığı takım /
// akış şablonu / bağlantı alanlarını ilk yüklemede sessizce düşür. Bilinmeyen
// alanlar asla "bozuk dosya" sayılmaz; yalnızca temizlenip üzerine yazılır.
const LEGACY_STORE_FIELDS = [
  'teams', 'teamMembers', 'teamTasks', 'teamEvents', 'agentTeams',
  'connections', 'flowTemplates'
] as const

function dropLegacyFields(): void {
  const raw = store as unknown as Record<string, unknown>
  for (const key of LEGACY_STORE_FIELDS) delete raw[key]
}

export function initDatabase(): void {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  filePath = join(dir, 'termflow.json')
  if (existsSync(filePath)) {
    try {
      store = { ...empty(), ...JSON.parse(readFileSync(filePath, 'utf-8')) }
    } catch {
      const corruptPath = filePath.replace(/\.json$/, `.corrupt-${Date.now()}.json`)
      renameSync(filePath, corruptPath)
      const backupPath = filePath + '.bak'
      if (existsSync(backupPath)) {
        try {
          store = { ...empty(), ...JSON.parse(readFileSync(backupPath, 'utf-8')) }
          dropLegacyFields()
          persist()
          return
        } catch {
          // Keep the corrupt primary file and fall back to a new store.
        }
      }
      store = empty()
    }
  } else {
    store = empty()
  }
  dropLegacyFields()
  if (store.workspaces.length === 0) {
    createWorkspace({
      name: 'Default',
      path: app.getPath('home'),
      description: 'Default workspace'
    })
  } else {
    persist()
  }
}

// ---- Workspaces ----

export function listWorkspaces(): Workspace[] {
  return [...store.workspaces].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
}

export function createWorkspace(input: {
  name: string
  path: string
  description?: string
  icon?: string
}): Workspace {
  const ts = now()
  const ws: Workspace = {
    id: nanoid(),
    name: input.name,
    path: input.path,
    description: input.description,
    icon: input.icon,
    createdAt: ts,
    updatedAt: ts,
    lastOpenedAt: ts
  }
  store.workspaces.push(ws)
  store.viewports[ws.id] = {}
  persist()
  return ws
}

export function updateWorkspace(id: string, patch: Partial<Workspace>): void {
  const ws = store.workspaces.find((w) => w.id === id)
  if (!ws) return
  Object.assign(ws, patch, { updatedAt: now() })
  persist()
}

export function deleteWorkspace(id: string): void {
  store.workspaces = store.workspaces.filter((w) => w.id !== id)
  store.terminals = store.terminals.filter((t) => t.workspaceId !== id)
  store.nodes = store.nodes.filter((n) => n.workspaceId !== id)
  store.snippets = store.snippets.filter((s) => s.workspaceId !== id)
  store.highlightRules = store.highlightRules.filter((r) => r.workspaceId !== id)
  store.sshProfiles = store.sshProfiles.filter((p) => p.workspaceId !== id)
  store.envVars = store.envVars.filter((e) => e.workspaceId !== id)
  delete store.viewports[id]
  persist()
}

// ---- Terminals ----

export function listTerminals(workspaceId: string): TerminalSession[] {
  return store.terminals
    .filter((t) => t.workspaceId === workspaceId)
    .map((t) => ({ ...t, status: 'stopped' as const }))
}

export function upsertTerminal(t: TerminalSession): void {
  const idx = store.terminals.findIndex((x) => x.id === t.id)
  const record = { ...t, updatedAt: now() }
  if (idx >= 0) store.terminals[idx] = record
  else store.terminals.push(record)
  persist()
}

export function deleteTerminal(id: string): void {
  store.terminals = store.terminals.filter((t) => t.id !== id)
  store.nodes = store.nodes.filter((n) => n.terminalId !== id && !paneHasTerminal(n.panes, id))
  persist()
}

// ---- Node migration: convert legacy single-terminal nodes to pane-tree ----
// Windows saved by pre-tmux builds still carry canvas geometry (position,
// size, zIndex, isMinimized/isMaximized, showInfo, isPinned, nodeType,
// agentRole). Strip them silently and backfill a single-leaf pane tree so old
// workspace files load without any data loss.
const LEGACY_NODE_FIELDS = [
  'position', 'size', 'zIndex', 'isMinimized', 'isMaximized',
  'showInfo', 'isPinned', 'nodeType', 'agentRole'
] as const

function migrateNode(node: WindowDef): WindowDef {
  const raw = { ...node } as unknown as Record<string, unknown>
  for (const key of LEGACY_NODE_FIELDS) delete raw[key]
  const win = raw as unknown as WindowDef
  if (!win.panes && win.terminalId) {
    return {
      ...win,
      panes: { type: 'leaf', terminalId: win.terminalId, title: win.title },
      activePaneId: win.terminalId
    }
  }
  return win
}

function paneHasTerminal(pane: PaneNode | undefined, terminalId: string): boolean {
  if (!pane) return false
  if (pane.type === 'leaf') return pane.terminalId === terminalId
  return paneHasTerminal(pane.a, terminalId) || paneHasTerminal(pane.b, terminalId)
}

export function remapPaneIds(
  pane: PaneNode | undefined,
  remap: (oldId: string) => string
): PaneNode | undefined {
  if (!pane) return undefined
  if (pane.type === 'leaf') return { ...pane, terminalId: remap(pane.terminalId) }
  return {
    ...pane,
    a: remapPaneIds(pane.a, remap)!,
    b: remapPaneIds(pane.b, remap)!
  }
}

// ---- Layout ----

export function getLayout(workspaceId: string): WorkspaceLayout {
  const nodes = store.nodes.filter((n) => n.workspaceId === workspaceId).map(migrateNode)
  const vp = store.viewports[workspaceId] ?? {}
  return {
    workspaceId,
    nodes,
    activeNodeId: vp.activeNodeId
  }
}

// ---- Snippets ----

export function listSnippets(workspaceId?: string): Snippet[] {
  return store.snippets.filter((s) => !workspaceId || s.workspaceId === workspaceId || s.scope === 'global')
}

export function createSnippet(input: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>): Snippet {
  const ts = now()
  const s: Snippet = { id: nanoid(), ...input, createdAt: ts, updatedAt: ts }
  store.snippets.push(s)
  persist()
  return s
}

export function updateSnippet(id: string, patch: Partial<Snippet>): void {
  const idx = store.snippets.findIndex((s) => s.id === id)
  if (idx < 0) return
  store.snippets[idx] = { ...store.snippets[idx], ...patch, updatedAt: now() }
  persist()
}

export function deleteSnippet(id: string): void {
  store.snippets = store.snippets.filter((s) => s.id !== id)
  persist()
}

// ---- Highlight Rules ----

export function listHighlightRules(workspaceId?: string): HighlightRule[] {
  return store.highlightRules.filter((r) => !workspaceId || !r.workspaceId || r.workspaceId === workspaceId)
}

export function createHighlightRule(input: Omit<HighlightRule, 'id'>): HighlightRule {
  const r: HighlightRule = { id: nanoid(), ...input }
  store.highlightRules.push(r)
  persist()
  return r
}

export function updateHighlightRule(id: string, patch: Partial<HighlightRule>): void {
  const idx = store.highlightRules.findIndex((r) => r.id === id)
  if (idx < 0) return
  store.highlightRules[idx] = { ...store.highlightRules[idx], ...patch }
  persist()
}

export function deleteHighlightRule(id: string): void {
  store.highlightRules = store.highlightRules.filter((r) => r.id !== id)
  persist()
}

// ---- SSH Profiles ----

export function listSshProfiles(workspaceId: string): SshProfile[] {
  return store.sshProfiles.filter((p) => p.workspaceId === workspaceId)
}

export function createSshProfile(input: Omit<SshProfile, 'id' | 'createdAt'>): SshProfile {
  const p: SshProfile = { id: nanoid(), ...input, createdAt: now() }
  store.sshProfiles.push(p)
  persist()
  return p
}

export function updateSshProfile(id: string, patch: Partial<SshProfile>): void {
  const idx = store.sshProfiles.findIndex((p) => p.id === id)
  if (idx < 0) return
  store.sshProfiles[idx] = { ...store.sshProfiles[idx], ...patch }
  persist()
}

export function deleteSshProfile(id: string): void {
  store.sshProfiles = store.sshProfiles.filter((p) => p.id !== id)
  persist()
}

// ---- Env Vars ----

export function listEnvVars(workspaceId: string): EnvEntry[] {
  return store.envVars.filter((e) => e.workspaceId === workspaceId)
}

export function getEnvVar(id: string): EnvEntry | undefined {
  return store.envVars.find((e) => e.id === id)
}

export function createEnvVar(input: Omit<EnvEntry, 'id'>): EnvEntry {
  const e: EnvEntry = { id: nanoid(), ...input }
  store.envVars.push(e)
  persist()
  return e
}

export function updateEnvVar(id: string, patch: Partial<EnvEntry>): void {
  const idx = store.envVars.findIndex((e) => e.id === id)
  if (idx < 0) return
  store.envVars[idx] = { ...store.envVars[idx], ...patch }
  persist()
}

export function deleteEnvVar(id: string): void {
  store.envVars = store.envVars.filter((e) => e.id !== id)
  persist()
}

// ---- Workspace Export/Import ----

export function exportWorkspaceData(workspaceId: string): {
  terminals: TerminalSession[]
  nodes: WindowDef[]
  snippets: Snippet[]
  highlightRules: HighlightRule[]
  sshProfiles: SshProfile[]
  envVars: EnvEntry[]
} {
  return {
    terminals: store.terminals.filter((t) => t.workspaceId === workspaceId),
    nodes: store.nodes.filter((n) => n.workspaceId === workspaceId).map(migrateNode),
    snippets: store.snippets.filter((s) => s.workspaceId === workspaceId),
    highlightRules: store.highlightRules.filter((r) => r.workspaceId === workspaceId),
    sshProfiles: store.sshProfiles.filter((p) => p.workspaceId === workspaceId),
    envVars: store.envVars.filter((e) => e.workspaceId === workspaceId)
  }
}

export function importWorkspaceData(
  workspaceId: string,
  terminals: TerminalSession[],
  nodes: WindowDef[],
  snippets: Snippet[],
  highlightRules: HighlightRule[],
  sshProfiles: SshProfile[],
  envVars: EnvEntry[]
): void {
  store.terminals = store.terminals.filter((t) => t.workspaceId !== workspaceId).concat(terminals)
  store.nodes = store.nodes.filter((n) => n.workspaceId !== workspaceId).concat(nodes.map(migrateNode))
  store.snippets = store.snippets.filter((s) => s.workspaceId !== workspaceId).concat(snippets)
  store.highlightRules = store.highlightRules.filter((r) => r.workspaceId !== workspaceId).concat(highlightRules)
  store.sshProfiles = store.sshProfiles.filter((p) => p.workspaceId !== workspaceId).concat(sshProfiles)
  store.envVars = store.envVars.filter((e) => e.workspaceId !== workspaceId).concat(envVars)
  store.viewports[workspaceId] = {}
  persist()
}

export function saveLayout(layout: WorkspaceLayout): void {
  store.nodes = store.nodes.filter((n) => n.workspaceId !== layout.workspaceId).concat(layout.nodes)
  store.viewports[layout.workspaceId] = { activeNodeId: layout.activeNodeId }
  persist()
}

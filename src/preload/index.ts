import { contextBridge, ipcRenderer, webUtils } from 'electron'
import {
  IPC,
  type CreateTerminalInput,
  type Workspace,
  type WorkspaceLayout,
  type TerminalSession,
  type RenderMode,
  type AppSettings,
  type ProcStats,
  type PtyBackendStatus,
  type Snippet,
  type HighlightRule,
  type SshProfile,
  type EnvEntry,
  type GitStatus,
  type WorkspaceHealthCheck,
  type TaskTrigger
  ,type WorkspaceFileEntry
  ,type GitWorkbenchState
  ,type CredentialMeta
  ,type TermFlowPluginManifest
  ,type PluginDiagnostic
  ,type PluginRegistryEntry
} from '../shared/types'

// Windows OS build number (e.g. 26200 for current Win11). xterm's windowsPty
// option keys its reflow behaviour on this; fall back to a modern build when
// the API is unavailable.
function osBuildNumber(): number {
  try {
    const v = process.getSystemVersion()
    const n = parseInt(v.split('.')[2] ?? '', 10)
    return Number.isFinite(n) && n > 0 ? n : 21376
  } catch {
    return 21376
  }
}

const api = {
  // ---- System ----
  system: {
    osBuildNumber: osBuildNumber(),
    getPathForFile: (file: File): string => webUtils.getPathForFile(file)
  },
  // ---- PTY ----
  pty: {
    create: (id: string, input: CreateTerminalInput): Promise<{ pid: number }> =>
      ipcRenderer.invoke(IPC.PTY_CREATE, id, input),
    write: (id: string, data: string): void => ipcRenderer.send(IPC.PTY_WRITE, id, data),
    resize: (id: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC.PTY_RESIZE, id, cols, rows),
    kill: (id: string): void => ipcRenderer.send(IPC.PTY_KILL, id),
    setMode: (id: string, mode: RenderMode): void => ipcRenderer.send(IPC.PTY_MODE, id, mode),
    restart: (id: string): Promise<{ pid: number } | null> => ipcRenderer.invoke(IPC.PTY_RESTART, id),
    buffer: (id: string): Promise<string> => ipcRenderer.invoke(IPC.PTY_BUFFER, id),
    bufferInfo: (id: string): Promise<{ data: string; total: number }> => ipcRenderer.invoke(IPC.PTY_BUFFER_INFO, id),
    onData: (cb: (id: string, data: string) => void): (() => void) => {
      const h = (_e: unknown, payload: { id: string; data: string }): void => cb(payload.id, payload.data)
      ipcRenderer.on(IPC.PTY_DATA, h)
      return () => ipcRenderer.removeListener(IPC.PTY_DATA, h)
    },
    onExit: (cb: (id: string, exitCode: number, durationMs: number) => void): (() => void) => {
      const h = (_e: unknown, payload: { id: string; exitCode: number; durationMs: number }): void =>
        cb(payload.id, payload.exitCode, payload.durationMs)
      ipcRenderer.on(IPC.PTY_EXIT, h)
      return () => ipcRenderer.removeListener(IPC.PTY_EXIT, h)
    },
    onActivity: (cb: (id: string, error: boolean) => void): (() => void) => {
      const h = (_e: unknown, payload: { id: string; error: boolean }): void => cb(payload.id, payload.error)
      ipcRenderer.on(IPC.PTY_ACTIVITY, h)
      return () => ipcRenderer.removeListener(IPC.PTY_ACTIVITY, h)
    },
    onAwaiting: (cb: (id: string) => void): (() => void) => {
      const h = (_e: unknown, payload: { id: string }): void => cb(payload.id)
      ipcRenderer.on(IPC.PTY_AWAITING, h)
      return () => ipcRenderer.removeListener(IPC.PTY_AWAITING, h)
    },
    onCwd: (cb: (id: string, cwd: string) => void): (() => void) => {
      const h = (_e: unknown, payload: { id: string; cwd: string }): void => cb(payload.id, payload.cwd)
      ipcRenderer.on(IPC.PTY_CWD, h)
      return () => ipcRenderer.removeListener(IPC.PTY_CWD, h)
    },
    // Persistent-session backend: 'daemon' means terminals survive app restarts,
    // 'in-process' means we fell back and they die with the app.
    backendStatus: (): Promise<PtyBackendStatus> => ipcRenderer.invoke(IPC.PTY_BACKEND_STATUS),
    shutdownDaemon: (): Promise<PtyBackendStatus> => ipcRenderer.invoke(IPC.PTY_DAEMON_SHUTDOWN),
    onBackendChanged: (cb: (status: PtyBackendStatus) => void): (() => void) => {
      const h = (_e: unknown, payload: PtyBackendStatus): void => cb(payload)
      ipcRenderer.on(IPC.PTY_BACKEND_CHANGED, h)
      return () => ipcRenderer.removeListener(IPC.PTY_BACKEND_CHANGED, h)
    }
  },
  proc: {
    stats: (): Promise<Record<string, ProcStats>> => ipcRenderer.invoke(IPC.PROC_STATS)
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_SET, patch)
  },
  window: {
    setOverlay: (color: string, symbolColor: string): void =>
      ipcRenderer.send(IPC.WINDOW_OVERLAY, color, symbolColor),
    focus: (): void => ipcRenderer.send(IPC.WINDOW_FOCUS)
  },
  shells: {
    discover: () => ipcRenderer.invoke(IPC.SHELLS_DISCOVER)
  },
  dialog: {
    openDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR),
    openFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.DIALOG_OPEN_FILES),
    checkFile: (path: string): Promise<boolean> => ipcRenderer.invoke(IPC.DIALOG_CHECK_FILE, path)
  },
  editor: {
    open: (path: string, line?: number, col?: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.EDITOR_OPEN, path, line, col)
  },
  files: {
    list: (workspaceId: string, path?: string): Promise<WorkspaceFileEntry[]> => ipcRenderer.invoke(IPC.FS_LIST, workspaceId, path),
    readText: (workspaceId: string, path: string): Promise<string> => ipcRenderer.invoke(IPC.FS_READ_TEXT, workspaceId, path)
  },
  vault: {
    list: (workspaceId?: string): Promise<CredentialMeta[]> => ipcRenderer.invoke(IPC.VAULT_LIST, workspaceId),
    save: (input: Omit<CredentialMeta, 'id' | 'updatedAt'> & { id?: string; value: string }): Promise<CredentialMeta> => ipcRenderer.invoke(IPC.VAULT_SAVE, input),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.VAULT_DELETE, id)
  },
  plugins: {
    list: (): Promise<TermFlowPluginManifest[]> => ipcRenderer.invoke(IPC.PLUGIN_LIST),
    install: (): Promise<TermFlowPluginManifest | null> => ipcRenderer.invoke(IPC.PLUGIN_INSTALL),
    save: (manifest: TermFlowPluginManifest): Promise<TermFlowPluginManifest> => ipcRenderer.invoke(IPC.PLUGIN_SAVE, manifest),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PLUGIN_DELETE, id),
    setEnabled: (id: string, enabled: boolean): Promise<void> => ipcRenderer.invoke(IPC.PLUGIN_SET_ENABLED, id, enabled),
    diagnostics: (): Promise<PluginDiagnostic[]> => ipcRenderer.invoke(IPC.PLUGIN_DIAGNOSTICS),
    reload: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PLUGIN_RELOAD, id),
    registry: (): Promise<PluginRegistryEntry[]> => ipcRenderer.invoke(IPC.PLUGIN_REGISTRY_LIST),
    installFromRegistry: (entry: PluginRegistryEntry): Promise<TermFlowPluginManifest> => ipcRenderer.invoke(IPC.PLUGIN_REGISTRY_INSTALL, entry)
  },
  recovery: {
    status: (): Promise<{ crashed: boolean }> => ipcRenderer.invoke(IPC.RECOVERY_STATUS),
    acknowledge: (): Promise<void> => ipcRenderer.invoke(IPC.RECOVERY_ACK)
  },
  updates: {
    check: (channel: 'stable' | 'beta'): Promise<{ status: string }> => ipcRenderer.invoke(IPC.UPDATE_CHECK, channel),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    onStatus: (cb: (value: { status: string; detail?: string }) => void): (() => void) => { const handler = (_event: unknown, value: { status: string; detail?: string }): void => cb(value); ipcRenderer.on(IPC.UPDATE_STATUS, handler); return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler) }
  },
  workspaces: {
    list: (): Promise<Workspace[]> => ipcRenderer.invoke(IPC.WS_LIST),
    create: (input: {
      name: string
      path: string
      description?: string
      icon?: string
    }): Promise<Workspace> => ipcRenderer.invoke(IPC.WS_CREATE, input),
    update: (id: string, patch: Partial<Workspace>): Promise<void> =>
      ipcRenderer.invoke(IPC.WS_UPDATE, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.WS_DELETE, id),
    export: (workspaceId: string): Promise<void> => ipcRenderer.invoke(IPC.WS_EXPORT, workspaceId),
    import: (): Promise<{ id?: string; error?: string } | null> => ipcRenderer.invoke(IPC.WS_IMPORT),
    clone: (workspaceId: string): Promise<{ id?: string; error?: string }> => ipcRenderer.invoke(IPC.WS_CLONE, workspaceId),
    checkManifest: (cwd: string): Promise<unknown> => ipcRenderer.invoke(IPC.WS_CHECK_MANIFEST, cwd),
    health: (workspaceId: string): Promise<WorkspaceHealthCheck[]> => ipcRenderer.invoke(IPC.WS_HEALTH, workspaceId)
  },
  // ---- package.json script runner ----
  pkg: {
    scripts: (cwd: string): Promise<{ scripts: Record<string, string>; packageManager: 'npm' | 'pnpm' | 'yarn' } | null> =>
      ipcRenderer.invoke(IPC.PKG_SCRIPTS, cwd)
  },
  // ---- Task Triggers (process_exit / timer) ----
  taskTriggers: {
    list: (workspaceId: string): Promise<TaskTrigger[]> => ipcRenderer.invoke(IPC.TASK_TRIGGER_LIST, workspaceId),
    save: (trigger: TaskTrigger): Promise<{ id?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.TASK_TRIGGER_SAVE, trigger),
    remove: (workspaceId: string, id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.TASK_TRIGGER_DELETE, workspaceId, id)
  },
  // ---- Workspace Templates ----
  templates: {
    save: (workspaceId: string, name: string): Promise<{ id?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.TEMPLATE_SAVE, workspaceId, name),
    list: (): Promise<{ id: string; name: string; savedAt: string }[]> => ipcRenderer.invoke(IPC.TEMPLATE_LIST),
    createWorkspace: (templateId: string, opts?: { name?: string; path?: string }): Promise<{ id?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.TEMPLATE_CREATE_WORKSPACE, templateId, opts),
    remove: (templateId: string): Promise<void> => ipcRenderer.invoke(IPC.TEMPLATE_DELETE, templateId)
  },
  terminals: {
    list: (workspaceId: string): Promise<TerminalSession[]> =>
      ipcRenderer.invoke(IPC.TERM_LIST, workspaceId),
    upsert: (t: TerminalSession): Promise<void> => ipcRenderer.invoke(IPC.TERM_UPSERT, t),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TERM_DELETE, id)
  },
  layout: {
    get: (workspaceId: string): Promise<WorkspaceLayout> => ipcRenderer.invoke(IPC.LAYOUT_GET, workspaceId),
    save: (layout: WorkspaceLayout): Promise<void> => ipcRenderer.invoke(IPC.LAYOUT_SAVE, layout)
  },
  // ---- Snippets ----
  snippets: {
    list: (workspaceId?: string): Promise<Snippet[]> => ipcRenderer.invoke(IPC.SNIPPET_LIST, workspaceId),
    create: (input: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>): Promise<Snippet> =>
      ipcRenderer.invoke(IPC.SNIPPET_CREATE, input),
    update: (id: string, patch: Partial<Snippet>): Promise<void> =>
      ipcRenderer.invoke(IPC.SNIPPET_UPDATE, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SNIPPET_DELETE, id)
  },
  // ---- Highlight Rules ----
  highlightRules: {
    list: (workspaceId?: string): Promise<HighlightRule[]> => ipcRenderer.invoke(IPC.HL_RULE_LIST, workspaceId),
    create: (input: Omit<HighlightRule, 'id'>): Promise<HighlightRule> => ipcRenderer.invoke(IPC.HL_RULE_CREATE, input),
    update: (id: string, patch: Partial<HighlightRule>): Promise<void> => ipcRenderer.invoke(IPC.HL_RULE_UPDATE, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.HL_RULE_DELETE, id)
  },
  // ---- SSH Profiles ----
  sshProfiles: {
    list: (workspaceId: string): Promise<SshProfile[]> => ipcRenderer.invoke(IPC.SSH_PROFILE_LIST, workspaceId),
    create: (input: Omit<SshProfile, 'id' | 'createdAt'>): Promise<SshProfile> =>
      ipcRenderer.invoke(IPC.SSH_PROFILE_CREATE, input),
    update: (id: string, patch: Partial<SshProfile>): Promise<void> =>
      ipcRenderer.invoke(IPC.SSH_PROFILE_UPDATE, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.SSH_PROFILE_DELETE, id)
  },
  // ---- Env Vars ----
  envVars: {
    list: (workspaceId: string): Promise<EnvEntry[]> => ipcRenderer.invoke(IPC.ENV_LIST, workspaceId),
    create: (input: { workspaceId: string; key: string; value: string; masked: boolean }): Promise<EnvEntry> =>
      ipcRenderer.invoke(IPC.ENV_CREATE, input),
    update: (id: string, patch: Partial<EnvEntry>): Promise<void> => ipcRenderer.invoke(IPC.ENV_UPDATE, id, patch),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ENV_DELETE, id)
  },
  // ---- Git ----
  git: {
    status: (cwd: string): Promise<GitStatus | null> => ipcRenderer.invoke(IPC.GIT_STATUS, cwd),
    fetch: (cwd: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.GIT_FETCH, cwd),
    workbench: (cwd: string): Promise<GitWorkbenchState> => ipcRenderer.invoke(IPC.GIT_WORKBENCH, cwd),
    stage: (cwd: string, paths: string[]): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.GIT_STAGE, cwd, paths),
    unstage: (cwd: string, paths: string[]): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.GIT_UNSTAGE, cwd, paths),
    commit: (cwd: string, message: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke(IPC.GIT_COMMIT, cwd, message)
  },
  // ---- Recording ----
  recording: {
    start: (id: string): void => ipcRenderer.send(IPC.REC_START, id),
    stop: (id: string): Promise<unknown[]> => ipcRenderer.invoke(IPC.REC_STOP, id),
    save: (id: string): Promise<void> => ipcRenderer.invoke(IPC.REC_SAVE, id),
    onLimit: (cb: (id: string, reason: 'duration' | 'size') => void): (() => void) => {
      const h = (_e: unknown, payload: { id: string; reason: 'duration' | 'size' }): void =>
        cb(payload.id, payload.reason)
      ipcRenderer.on(IPC.REC_LIMIT, h)
      return () => ipcRenderer.removeListener(IPC.REC_LIMIT, h)
    }
  },
  diagnostics: {
    export: (workspaceId: string): Promise<void> => ipcRenderer.invoke(IPC.DIAGNOSTICS_EXPORT, workspaceId)
  },
  // ---- Claude Code profil ayar dosyaları (settings.json / .claude.json) ----
  agentConfig: {
    read: (target: 'settings' | 'config'): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IPC.AGENT_CFG_READ, target),
    write: (target: 'settings' | 'config', patch: Record<string, unknown>): Promise<Record<string, unknown>> =>
      ipcRenderer.invoke(IPC.AGENT_CFG_WRITE, target, patch)
  }
}

contextBridge.exposeInMainWorld('termflow', api)

export type TermflowApi = typeof api

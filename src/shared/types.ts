// Shared data models between main and renderer (see PRD §14)

export type ShellKind =
  | 'powershell'
  | 'pwsh'
  | 'cmd'
  | 'wsl'
  | 'gitbash'
  | 'claude'
  | 'codex'
  | 'opencode'
  | 'ollama'
  | 'ssh'
  | 'custom'

/** `starting` is the transient optimistic state between the pane appearing on
 *  screen and the PTY spawn returning; it is never persisted as such. */
export type TerminalStatus = 'starting' | 'running' | 'stopped' | 'error' | 'exited'
export type NodeStatus = 'idle' | 'running' | 'waiting' | 'error' | 'completed' | 'stopped'

// ---- Pane Tree (Split-Pane feature) ----
export interface LeafPane {
  type: 'leaf'
  terminalId: string
  title: string
}

export interface SplitPane {
  type: 'split'
  dir: 'horizontal' | 'vertical'
  ratio: number // 0..1, proportion allocated to child 'a'
  a: PaneNode
  b: PaneNode
}

export type PaneNode = LeafPane | SplitPane

export interface TerminalProfile {
  id: string
  name: string
  kind: ShellKind
  shell: string
  args: string[]
  cwd?: string
  env?: Record<string, string>
  startupCommand?: string
  icon?: string
  /** Kullanıcı tanımlı profil kimliği (ör. 'claude', 'pwsh'). */
  agentType?: string
  color?: string
}

export interface Workspace {
  id: string
  name: string
  path: string
  description?: string
  icon?: string
  createdAt: string
  updatedAt: string
  lastOpenedAt?: string
}

export interface TerminalSession {
  id: string
  workspaceId: string
  name: string
  profileId?: string
  kind: ShellKind
  shell: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  /** Keep provider routing/model variables out of standalone AI-agent launches. */
  cleanProviderEnv?: boolean
  startupCommand?: string
  pid?: number
  status: TerminalStatus
  createdAt: string
  updatedAt: string
}

/**
 * A window = one tmux "window" (tab). It fills the whole work area when
 * selected; the pane tree inside it maps to tmux panes. Windows carry no
 * geometry of their own — the tab strip owns ordering, nothing else.
 */
export interface WindowDef {
  id: string
  workspaceId: string
  terminalId?: string // legacy single-terminal; use panes for multi-pane
  panes?: PaneNode // pane tree for split-pane / tabbed terminals
  activePaneId?: string // which leaf terminalId is focused within the window
  title: string
  status: NodeStatus
  /** Kullanıcı tanımlı profil kimliği (ör. 'claude', 'pwsh'). */
  agentType?: string
  /** Runtime-only: true when the window was spawned with the permission-bypass flag. Not persisted into startupCommand. */
  bypass?: boolean
}

export type RenderMode = 'active' | 'passive' | 'buffer'

// ---- Persistent PTY daemon (detach/attach) ----
export type PtyBackendKind = 'daemon' | 'in-process'

export interface PtyBackendStatus {
  /** 'daemon': terminals survive app restarts. 'in-process': they do not. */
  kind: PtyBackendKind
  /** Why the daemon is not in use (only set when kind === 'in-process'). */
  reason?: string
  /** PTY ids the daemon already had running when the app attached. */
  attached?: string[]
}

export interface ProcStats {
  cpu: number
  memory: number
}

export type ThemeMode = 'system' | 'vscode-dark' | 'vscode-light' | 'one-dark-pro' | 'tokyo-night'

// ---- Snippets (P0-2) ----
export interface Snippet {
  id: string
  workspaceId: string | null // null = global
  name: string
  command: string
  params: string[] // extracted {{param}} names
  targetKind?: ShellKind
  cwd?: string
  scope: 'workspace' | 'global'
  createdAt: string
  updatedAt: string
}

// ---- Highlight Rules (P1-8) ----
export interface HighlightRule {
  id: string
  workspaceId: string | null
  pattern: string
  flags: string
  color: string
  label?: string
  notifyOnMatch?: boolean
}

// ---- SSH Profiles (P1-7) ----
export interface SshProfile {
  id: string
  workspaceId: string
  name: string
  host: string
  port: number
  user: string
  authType: 'key' | 'agent' | 'password'
  keyPath?: string
  jumpHost?: string
  createdAt: string
}

// ---- Project Manifest (.termflow.json) ----
export interface TermflowManifestTask {
  name: string
  command: string
  cwd?: string
  shell?: ShellKind
}

export interface TermflowManifestAgent {
  name: string
  role?: string
  kind?: ShellKind
  command?: string
}

export interface TermflowManifestEnv {
  key: string
  value?: string
  masked?: boolean
}

export interface TermflowManifestSnippet {
  name: string
  command: string
  scope?: 'workspace' | 'global'
}

export interface TermflowManifest {
  name?: string
  tasks?: TermflowManifestTask[]
  agents?: TermflowManifestAgent[]
  env?: TermflowManifestEnv[]
  snippets?: TermflowManifestSnippet[]
}

// ---- Task Triggers (feature: expanded task triggers) ----
// Fire a shell command when a specific node's process exits (optionally
// filtered by exit code), or on a repeating timer. ("when command finishes,
// run X")
export type TaskTriggerKind = 'process_exit' | 'timer'
export type ExitCodeFilter = 'any' | 'zero' | 'nonzero'

export interface TaskTrigger {
  id: string
  workspaceId: string
  name: string
  kind: TaskTriggerKind
  enabled: boolean
  // process_exit
  sourceNodeId?: string
  exitCodeFilter?: ExitCodeFilter
  // timer
  intervalMs?: number
  // action
  command: string
  shell?: ShellKind
  cwd?: string
}

// ---- Env Vars (P2-11) ----
export interface EnvEntry {
  id: string
  workspaceId: string
  key: string
  value: string // encrypted via safeStorage
  masked: boolean
}

// ---- Git Status (P2-9, extended with ahead/behind for deep git) ----
export interface GitStatus {
  branch: string
  dirty: boolean
  ahead?: number
  behind?: number
}

export interface WorkspaceFileEntry { name: string; path: string; directory: boolean; size: number }
export interface GitWorkbenchState { branch: string; status: string; diff: string; isRepo: boolean }
export interface CredentialMeta { id: string; name: string; provider: string; envKey: string; workspaceId: string | null; updatedAt: string }
export type PluginPermission = 'terminal:execute' | 'workspace:read' | 'workspace:write' | 'network:access'
export interface TermFlowPluginCommand {
  id: string
  title: string
  command: string
  shell?: ShellKind
  cwd?: string
  description?: string
  category?: string
}
export interface TermFlowPluginManifest {
  schemaVersion: 1 | 2
  id: string
  name: string
  version: string
  description?: string
  publisher?: string
  engines?: { termflow: string }
  entry?: string
  activationEvents?: string[]
  permissions?: PluginPermission[]
  builtin?: boolean
  enabled?: boolean
  commands: TermFlowPluginCommand[]
}
export interface PluginDiagnostic { pluginId: string; level: 'info' | 'warning' | 'error'; message: string; timestamp: string }
export interface PluginRegistryEntry { id: string; name: string; version: string; description: string; publisher: string; packageUrl: string; sha256?: string }

export interface WorkspaceHealthCheck {
  id: string
  label: string
  status: 'ok' | 'warning' | 'error'
  detail: string
}

// ---- Workspace Export (P0-3) ----
export interface WorkspaceExport {
  schemaVersion: number
  exportedAt: string
  termflowVersion?: string
  workspace: {
    name: string
    path?: string
    description?: string
  }
  /** Windows (tmux windows). Named `nodes` for backwards compatibility with existing export files. */
  nodes: WindowDef[]
  terminals: TerminalSession[]
  profiles?: TerminalProfile[]
  snippets?: Snippet[]
  highlightRules?: HighlightRule[]
  sshProfiles?: SshProfile[]
  envVars?: EnvEntry[]
}

// ---- AppSettings extended (P2-12) ----
export interface AppSettings {
  theme: ThemeMode
  activeBorderColor: string
  scrollback: number
  passiveThrottleMs: number
  webgl: boolean
  agentAutoApprove: boolean
  // Theme & Font (P2-12)
  fontFamily: string
  fontSize: number
  lineHeight: number
  cursorStyle: 'block' | 'underline' | 'bar'
  cursorBlink: boolean
  terminalTheme: string
  startAtLogin: boolean
  minimizeToTray: boolean
  providerProfiles: AiProviderProfile[]
  customAgents: CustomAgentDef[]
  /** Built-in agent kinds hidden from the New Terminal menu (deleted without an override). */
  hiddenAgentKinds: ShellKind[]
  transparency: number
  // Desktop notifications (P2-13)
  notificationsEnabled: boolean
  notifyOnLongCommand: boolean
  notifyOnError: boolean
  notifyOnAgentWaiting: boolean
  longCommandThresholdMs: number
  autoUpdate: boolean
  updateChannel: 'stable' | 'beta'
  // Play a sound when a terminal rings the bell (\x07) — how claude/codex
  // signal "task finished" in a regular terminal.
  terminalBell: boolean
  // New windows open with the right-side info panel (process/context) visible
  infoPanelDefaultOpen: boolean
  /** tmux-style prefix key: press it, then a command key (Ctrl+A twice sends the key itself). */
  prefixKey: 'ctrl+a' | 'ctrl+b'
  /**
   * Where a new terminal goes: tiled as an extra pane of the active window
   * (tmux-style, default) or as its own window tab.
   */
  newTerminalTarget: 'pane' | 'window'
  /**
   * Opt-in shell integration (OSC 133 semantic prompts). When enabled TermFlow
   * injects a session-only startup script into the shells that support it, so
   * command boundaries, exit codes and durations become known. Default: false —
   * with it off the PTY spawn path is byte-for-byte the legacy one.
   */
  shellIntegration: boolean
  /**
   * Command used to open a file path clicked in terminal output. Supports the
   * `{path}`, `{line}` and `{col}` placeholders. Empty -> OS default handler.
   */
  editorCommand: string
}

export interface CustomAgentDef {
  id: string
  name: string
  command: string
  fullPermissionArgs?: string
  color: string
  /** Built-in shell kind when this entry overrides a bundled agent profile. */
  kind?: ShellKind
}

export interface AiProviderProfile {
  id: string
  name: string
  command: string
  model: string
  baseUrl: string
  apiKeyEnv: string
  modelEnv: string
  baseUrlEnv: string
  color: string
  fullPermissionArgs: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'vscode-dark',
  activeBorderColor: '#f5e642',
  scrollback: 10000,
  passiveThrottleMs: 250,
  webgl: false,
  agentAutoApprove: false,
  fontFamily: "'0xProto Nerd Font Mono', 'Cascadia Mono', Consolas, monospace",
  fontSize: 12,
  // 1.0: box-drawing glyphs (│─╭╮ in TUI borders) are designed to fill the
  // exact cell height; any value above 1 opens gaps between rows and makes
  // frames look dashed. Match Windows Terminal's tight cell height.
  lineHeight: 1.0,
  cursorStyle: 'block',
  cursorBlink: true,
  terminalTheme: 'VS Code Dark',
  startAtLogin: true,
  minimizeToTray: true,
  providerProfiles: [
    { id: 'deepseek', name: 'DeepSeek', command: 'claude', model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/anthropic', apiKeyEnv: 'ANTHROPIC_AUTH_TOKEN', modelEnv: 'ANTHROPIC_MODEL', baseUrlEnv: 'ANTHROPIC_BASE_URL', color: '#111827', fullPermissionArgs: '--dangerously-skip-permissions' },
    { id: 'openrouter', name: 'OpenRouter', command: 'claude', model: 'anthropic/claude-3.5-sonnet', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'ANTHROPIC_AUTH_TOKEN', modelEnv: 'ANTHROPIC_MODEL', baseUrlEnv: 'ANTHROPIC_BASE_URL', color: '#6467f2', fullPermissionArgs: '--dangerously-skip-permissions' },
    { id: 'ollama', name: 'Ollama Local', command: 'ollama run llama3.2', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434', apiKeyEnv: '', modelEnv: 'OLLAMA_MODEL', baseUrlEnv: 'OLLAMA_HOST', color: '#b48ead', fullPermissionArgs: '' }
  ],
  customAgents: [],
  hiddenAgentKinds: [],
  transparency: 100,
  // Desktop notifications are reserved for app-update events (new version
  // available / update ready); terminal-event notifications default OFF and
  // stay opt-in via Settings. (user request)
  notificationsEnabled: true,
  notifyOnLongCommand: false,
  notifyOnError: false,
  notifyOnAgentWaiting: false,
  longCommandThresholdMs: 30000,
  autoUpdate: true,
  updateChannel: 'stable',
  terminalBell: true,
  infoPanelDefaultOpen: false,
  prefixKey: 'ctrl+a',
  newTerminalTarget: 'pane',
  shellIntegration: false,
  editorCommand: 'code -g "{path}:{line}:{col}"'
}

export interface WorkspaceLayout {
  workspaceId: string
  /** Ordered window list (tab strip order). */
  nodes: WindowDef[]
  /** Currently selected window id. */
  activeNodeId?: string
}

export interface CreateTerminalInput {
  workspaceId: string
  name: string
  kind: ShellKind
  shell?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  cleanProviderEnv?: boolean
  startupCommand?: string
  cols?: number
  rows?: number
  /** Inject the session-only OSC 133 shell-integration script (opt-in). */
  shellIntegration?: boolean
}

// IPC channel names
export const IPC = {
  // pty
  PTY_CREATE: 'pty:create',
  PTY_WRITE: 'pty:write',
  PTY_RESIZE: 'pty:resize',
  PTY_KILL: 'pty:kill',
  PTY_RESTART: 'pty:restart',
  PTY_DATA: 'pty:data', // main -> renderer (batched)
  PTY_EXIT: 'pty:exit',
  PTY_BUFFER: 'pty:buffer', // request full buffer on attach
  PTY_BUFFER_INFO: 'pty:bufferInfo',
  PTY_MODE: 'pty:mode', // renderer -> main: set render mode (active/passive/buffer)
  PTY_ACTIVITY: 'pty:activity', // main -> renderer: error/activity signal
  PTY_AWAITING: 'pty:awaiting', // main -> renderer: process output looks like it's waiting on a y/n confirmation
  PTY_CWD: 'pty:cwd', // main -> renderer: OSC 7 cwd change detected in a terminal's output
  PTY_BACKEND_STATUS: 'pty:backendStatus', // renderer -> main: is the persistent daemon in use?
  PTY_BACKEND_CHANGED: 'pty:backendChanged', // main -> renderer: backend switched (e.g. fell back in-process)
  PTY_DAEMON_SHUTDOWN: 'pty:daemonShutdown', // renderer -> main: kill the daemon and every detached session
  PROC_STATS: 'proc:stats', // renderer -> main: get cpu/mem for pids
  GIT_FETCH: 'git:fetch', // renderer -> main: run `git fetch` for a cwd
  GIT_WORKBENCH: 'git:workbench',
  GIT_STAGE: 'git:stage',
  GIT_UNSTAGE: 'git:unstage',
  GIT_COMMIT: 'git:commit',
  FS_LIST: 'fs:list',
  FS_READ_TEXT: 'fs:readText',
  VAULT_LIST: 'vault:list',
  VAULT_SAVE: 'vault:save',
  VAULT_DELETE: 'vault:delete',
  PLUGIN_LIST: 'plugin:list',
  PLUGIN_INSTALL: 'plugin:install',
  PLUGIN_SAVE: 'plugin:save',
  PLUGIN_DELETE: 'plugin:delete',
  PLUGIN_SET_ENABLED: 'plugin:setEnabled',
  PLUGIN_DIAGNOSTICS: 'plugin:diagnostics',
  PLUGIN_RELOAD: 'plugin:reload',
  PLUGIN_REGISTRY_LIST: 'plugin:registryList',
  PLUGIN_REGISTRY_INSTALL: 'plugin:registryInstall',
  RECOVERY_STATUS: 'recovery:status',
  RECOVERY_ACK: 'recovery:ack',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',
  UPDATE_STATUS: 'update:status',
  // shells
  SHELLS_DISCOVER: 'shells:discover',
  // settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  // window
  WINDOW_OVERLAY: 'window:overlay', // renderer -> main: set titlebar overlay colors
  WINDOW_FOCUS: 'window:focus', // renderer -> main: restore/focus the main window (notification click)
  // dialog
  DIALOG_OPEN_DIR: 'dialog:openDir',
  DIALOG_OPEN_FILES: 'dialog:openFiles',
  DIALOG_CHECK_FILE: 'dialog:checkFile',
  // editor
  EDITOR_OPEN: 'editor:open', // renderer -> main: open a file (optionally at line/col) in the configured editor
  // workspaces
  WS_LIST: 'ws:list',
  WS_CREATE: 'ws:create',
  WS_UPDATE: 'ws:update',
  WS_DELETE: 'ws:delete',
  WS_EXPORT: 'ws:export',
  WS_IMPORT: 'ws:import',
  WS_CLONE: 'ws:clone',
  WS_CHECK_MANIFEST: 'ws:checkManifest',
  WS_HEALTH: 'ws:health',
  // workspace templates
  TEMPLATE_SAVE: 'template:save',
  TEMPLATE_LIST: 'template:list',
  TEMPLATE_CREATE_WORKSPACE: 'template:createWorkspace',
  TEMPLATE_DELETE: 'template:delete',
  DIAGNOSTICS_EXPORT: 'diagnostics:export',
  // layout
  LAYOUT_GET: 'layout:get',
  LAYOUT_SAVE: 'layout:save',
  // terminals persistence
  TERM_LIST: 'term:list',
  TERM_UPSERT: 'term:upsert',
  TERM_DELETE: 'term:delete',
  // snippets
  SNIPPET_LIST: 'snippet:list',
  SNIPPET_CREATE: 'snippet:create',
  SNIPPET_UPDATE: 'snippet:update',
  SNIPPET_DELETE: 'snippet:delete',
  // highlight rules
  HL_RULE_LIST: 'hl:list',
  HL_RULE_CREATE: 'hl:create',
  HL_RULE_UPDATE: 'hl:update',
  HL_RULE_DELETE: 'hl:delete',
  // SSH profiles
  SSH_PROFILE_LIST: 'ssh:list',
  SSH_PROFILE_CREATE: 'ssh:create',
  SSH_PROFILE_UPDATE: 'ssh:update',
  SSH_PROFILE_DELETE: 'ssh:delete',
  // git
  GIT_STATUS: 'git:status',
  // package.json script runner
  PKG_SCRIPTS: 'pkg:scripts',
  // task triggers
  TASK_TRIGGER_LIST: 'taskTrigger:list',
  TASK_TRIGGER_SAVE: 'taskTrigger:save',
  TASK_TRIGGER_DELETE: 'taskTrigger:delete',
  // env vars
  ENV_LIST: 'env:list',
  ENV_CREATE: 'env:create',
  ENV_UPDATE: 'env:update',
  ENV_DELETE: 'env:delete',
  // recording
  REC_START: 'rec:start',
  REC_STOP: 'rec:stop',
  REC_SAVE: 'rec:save',
  REC_LIMIT: 'rec:limit', // main -> renderer: recording auto-stopped (duration/size limit reached)
  // Claude Code profil ayar dosyaları (settings.json / .claude.json)
  AGENT_CFG_READ: 'agentCfg:read',
  AGENT_CFG_WRITE: 'agentCfg:write'
} as const

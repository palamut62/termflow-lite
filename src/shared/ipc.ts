// IPC channel names + payload types (TermFlow Lite)

import type { AgentEvent, AgentSession, AgentSessionRef, AppSettings, RenderMode, ShellInfo, UpdateStatus } from './types'

export const IPC = {
  PTY_CREATE: 'pty:create', // (tabId, profileId, cols, rows, cwd?) -> { pid }
  PTY_WRITE: 'pty:write', // (tabId, data)
  PTY_RESIZE: 'pty:resize', // (tabId, cols, rows)
  PTY_KILL: 'pty:kill', // (tabId)
  PTY_MODE: 'pty:mode', // (tabId, mode)
  PTY_RESTART: 'pty:restart', // (tabId) -> { pid } | null
  PTY_RESTART_AT: 'pty:restart-at', // (tabId, cwd) -> { pid } | null
  PTY_BUFFER: 'pty:buffer', // (tabId) -> string
  PTY_DATA: 'pty:data', // main -> renderer { ptyId, data }
  PTY_EXIT: 'pty:exit', // main -> renderer { ptyId, exitCode, durationMs }
  PTY_CWD: 'pty:cwd', // main -> renderer { ptyId, cwd }
  SHELLS_DISCOVER: 'shells:discover', // -> ShellInfo[]
  SETTINGS_GET: 'settings:get', // -> AppSettings
  SETTINGS_SET: 'settings:set', // (patch) -> AppSettings
  PROVIDER_SECRET_STATUS: 'provider-secret:status', // (providerId) -> boolean
  PROVIDER_SECRET_HEALTH: 'provider-secret:health',
  PROFILE_HEALTH: 'profile:health',
  PROVIDER_SECRET_SET: 'provider-secret:set', // (providerId, secret) -> boolean
  PROVIDER_SECRET_DELETE: 'provider-secret:delete', // (providerId) -> void
  SESSION_GET: 'session:get', // -> PersistedSession | null
  SESSION_SAVE: 'session:save', // (PersistedSession) — fire-and-forget, main debounces
  SESSION_CLEAR: 'session:clear', // ()
  CLIPBOARD_READ: 'clipboard:read', // -> string (sandboxed renderer paste fallback)
  CLIPBOARD_READ_PASTE: 'clipboard:read-paste', // -> copied file path or text
  CLIPBOARD_WRITE: 'clipboard:write', // (text) -> boolean; navigator.clipboard.writeText odak/permission'a duyarlı
  WINDOW_TITLEBAR_OVERLAY: 'window:titlebar-overlay', // (TitleBarOverlayPayload) — Windows only
  DIALOG_OPEN_DIR: 'dialog:open-dir',
  DIALOG_OPEN_FILE: 'dialog:open-file', // -> seçilen dosya yolu | null
  UPDATE_CHECK: 'update:check', // -> UpdateStatus
  UPDATE_DOWNLOAD: 'update:download', // () — ilerleme UPDATE_STATUS ile akar
  UPDATE_INSTALL: 'update:install', // () — uygulamayı kapatıp kurar
  UPDATE_STATUS: 'update:status', // main -> renderer UpdateStatus
  GIT_STATUS: 'git:status',
  WORKTREE_REPO_INFO: 'worktree:repo-info', // (cwd) -> GitRepoInfo | null
  WORKTREE_LIST: 'worktree:list', // (repoRoot) -> WorktreeEntry[]
  WORKTREE_CREATE: 'worktree:create', // (WorktreeCreateRequest) -> WorktreeOutcome
  WORKTREE_REMOVE: 'worktree:remove', // (WorktreeRemoveRequest) -> { ok } | { ok: false, error }
  GITHUB_STATUS: 'github:status', // () -> GitHubStatus
  GITHUB_REPOS: 'github:repos', // (limit) -> GitHubRepo[]
  GITHUB_CURRENT_REPO: 'github:current-repo', // (cwd) -> 'owner/name' | ''
  GITHUB_PULL_REQUESTS: 'github:pull-requests', // (repo, cwd?) -> GitHubPullRequest[]
  GITHUB_PR_CHECKOUT: 'github:pr-checkout', // (worktreePath, number, repo?) -> GhOutcome
  GITHUB_CLONE: 'github:clone', // (nameWithOwner, targetPath) -> GhOutcome
  TASKS_DISCOVER: 'tasks:discover',
  PROJECT_DETECT: 'project:detect',
  AGENT_SESSIONS_LIST: 'agent-sessions:list',
  AGENT_SESSION_WARNINGS: 'agent-sessions:warnings',
  AGENT_SESSION_HANDOVER: 'agent-sessions:handover',
  AGENT_EVENTS_LIST: 'agent-events:list',
  AGENT_EVENTS_APPEND: 'agent-events:append',
  AGENT_EVENTS_CLEAR: 'agent-events:clear',
  APP_LAUNCH_CWD: 'app:launch-cwd',
  APP_LAUNCH_READY: 'app:launch-ready',
  APP_OPEN_PATH: 'app:open-path',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external',
  // Terminaldeki tıklanabilir dosya/klasör yolları (PRD ek).
  SYSTEM_RESOLVE_PATH: 'system:resolve-path', // (candidate, cwd) -> ResolvedPath | null
  SYSTEM_OPEN_PATH: 'system:open-path', // (path) -> boolean — varsayılan uygulamayla aç
  SYSTEM_REVEAL_IN_FOLDER: 'system:reveal-in-folder' // (path) -> boolean — Explorer'da konum
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface AppLaunchRequest {
  cwd: string
  profileId?: string
}

/** cwd'ye göre çözülmüş ve diskte var olduğu doğrulanmış yol (pathLinks). */
export interface ResolvedPath {
  path: string
  isDirectory: boolean
  /** False for executable/script/shortcut types; clicks reveal them instead of running them. */
  canOpen: boolean
}

// ---- Payload types ----
export interface PtyCreatePayload {
  tabId: string
  profileId: string
  cols: number
  rows: number
}

export interface AgentSessionsQuery {
  agents?: AgentSessionRef['agent'][]
  limit?: number
}

export type { AgentSession }
export type { AgentEvent }

export interface PtyWritePayload {
  tabId: string
  data: string
}

export interface PtyResizePayload {
  tabId: string
  cols: number
  rows: number
}

export interface PtyModePayload {
  tabId: string
  mode: RenderMode
}

export interface PtyDataEvent {
  ptyId: string
  data: string
}

export interface PtyExitEvent {
  ptyId: string
  exitCode: number
  durationMs: number
}

export interface PtyCwdEvent {
  ptyId: string
  cwd: string
}

export interface SettingsPatch extends Partial<AppSettings> {}

export interface GitStatus {
  branch: string
  changedFiles: number
}

/** Repository root plus the branch currently checked out there. */
export interface GitRepoInfo {
  root: string
  branch: string
}

/** One entry of `git worktree list --porcelain`. */
export interface WorktreeEntry {
  path: string
  head: string
  /** null while the worktree is on a detached HEAD. */
  branch: string | null
  detached: boolean
  bare: boolean
  locked: boolean
}

export interface WorktreeCreateRequest {
  repoRoot: string
  branch: string
  baseRef?: string
  path?: string
  /** Check out detached, leaving the branch choice to a later step. */
  detach?: boolean
}

export interface WorktreeRemoveRequest {
  repoRoot: string
  path: string
  force?: boolean
  deleteBranch?: boolean
  branch?: string
}

export type WorktreeOutcome = { ok: true; worktree: WorktreeEntry } | { ok: false; error: string }
export type WorktreeRemoveOutcome = { ok: true } | { ok: false; error: string }

/**
 * Availability of the user's GitHub CLI. TermFlow stores no token of its own:
 * `gh` owns the credentials, exactly as OpenSSH owns SSH keys.
 */
export interface GitHubStatus {
  installed: boolean
  authenticated: boolean
  /** Logged-in account login, when `gh auth status` reported one. */
  account: string
  /** Human-readable reason the integration is unavailable, else ''. */
  error: string
}

export interface GitHubRepo {
  nameWithOwner: string
  name: string
  description: string
  isPrivate: boolean
  updatedAt: string
}

export interface GitHubPullRequest {
  number: number
  title: string
  author: string
  headRefName: string
  isDraft: boolean
  updatedAt: string
}

export type GhOutcome = { ok: true } | { ok: false; error: string }

export interface ProjectTask {
  id: string
  label: string
  command: string
  source: 'package.json' | 'python' | 'cargo' | 'go' | 'docker' | 'git'
}

export interface ProjectInfo {
  root: string
  technologies: string[]
  tasks: ProjectTask[]
}

/** Windows Controls Overlay renkleri/yüksekliği (#rrggbb — PRD §68). */
export interface TitleBarOverlayPayload {
  color: string
  symbolColor: string
  height?: number
}

export type { ShellInfo, UpdateStatus }

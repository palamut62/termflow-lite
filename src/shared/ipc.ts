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
  PROVIDER_SECRET_SET: 'provider-secret:set', // (providerId, secret) -> boolean
  PROVIDER_SECRET_DELETE: 'provider-secret:delete', // (providerId) -> void
  SESSION_GET: 'session:get', // -> PersistedSession | null
  SESSION_SAVE: 'session:save', // (PersistedSession) — fire-and-forget, main debounces
  SESSION_CLEAR: 'session:clear', // ()
  CLIPBOARD_READ: 'clipboard:read', // -> string (sandboxed renderer paste fallback)
  CLIPBOARD_READ_PASTE: 'clipboard:read-paste', // -> copied file path or text
  WINDOW_TITLEBAR_OVERLAY: 'window:titlebar-overlay', // (TitleBarOverlayPayload) — Windows only
  DIALOG_OPEN_DIR: 'dialog:open-dir',
  DIALOG_OPEN_FILE: 'dialog:open-file', // -> seçilen dosya yolu | null
  UPDATE_CHECK: 'update:check', // -> UpdateStatus
  UPDATE_DOWNLOAD: 'update:download', // () — ilerleme UPDATE_STATUS ile akar
  UPDATE_INSTALL: 'update:install', // () — uygulamayı kapatıp kurar
  UPDATE_STATUS: 'update:status', // main -> renderer UpdateStatus
  GIT_STATUS: 'git:status',
  TASKS_DISCOVER: 'tasks:discover',
  PROJECT_DETECT: 'project:detect',
  AGENT_SESSIONS_LIST: 'agent-sessions:list',
  AGENT_EVENTS_LIST: 'agent-events:list',
  AGENT_EVENTS_APPEND: 'agent-events:append',
  AGENT_EVENTS_CLEAR: 'agent-events:clear',
  APP_LAUNCH_CWD: 'app:launch-cwd',
  APP_LAUNCH_READY: 'app:launch-ready',
  APP_OPEN_PATH: 'app:open-path',
  SYSTEM_OPEN_EXTERNAL: 'system:open-external'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

export interface AppLaunchRequest {
  cwd: string
  profileId?: string
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

// IPC channel names + payload types (TermFlow Lite)

import type { AppSettings, RenderMode, ShellInfo } from './types'

export const IPC = {
  PTY_CREATE: 'pty:create', // (tabId, profileId, cols, rows, cwd?) -> { pid }
  PTY_WRITE: 'pty:write', // (tabId, data)
  PTY_RESIZE: 'pty:resize', // (tabId, cols, rows)
  PTY_KILL: 'pty:kill', // (tabId)
  PTY_MODE: 'pty:mode', // (tabId, mode)
  PTY_RESTART: 'pty:restart', // (tabId) -> { pid } | null
  PTY_BUFFER: 'pty:buffer', // (tabId) -> string
  PTY_DATA: 'pty:data', // main -> renderer { ptyId, data }
  PTY_EXIT: 'pty:exit', // main -> renderer { ptyId, exitCode, durationMs }
  PTY_CWD: 'pty:cwd', // main -> renderer { ptyId, cwd }
  SHELLS_DISCOVER: 'shells:discover', // -> ShellInfo[]
  SETTINGS_GET: 'settings:get', // -> AppSettings
  SETTINGS_SET: 'settings:set', // (patch) -> AppSettings
  CLIPBOARD_READ: 'clipboard:read', // -> string (sandboxed renderer paste fallback)
  WINDOW_TITLEBAR_OVERLAY: 'window:titlebar-overlay', // (TitleBarOverlayPayload) — Windows only
  DIALOG_OPEN_DIR: 'dialog:open-dir',
  GIT_STATUS: 'git:status',
  TASKS_DISCOVER: 'tasks:discover'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

// ---- Payload types ----
export interface PtyCreatePayload {
  tabId: string
  profileId: string
  cols: number
  rows: number
}

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
  source: 'package.json'
}

/** Windows Controls Overlay renkleri/yüksekliği (#rrggbb — PRD §68). */
export interface TitleBarOverlayPayload {
  color: string
  symbolColor: string
  height?: number
}

export type { ShellInfo }

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type GitStatus, type TitleBarOverlayPayload } from '../shared/ipc'
import type { AppSettings, RenderMode, ShellInfo } from '../shared/types'

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
    // Blur (acrylic) yalnızca Windows'ta desteklenir — UI buna göre uyarlanır.
    platform: process.platform as NodeJS.Platform,
    /**
     * Sürükle-bırak edilen bir File'ın gerçek disk yolu. Renderer'da `file.path`
     * artık yok; tek yol webUtils. API kullanılamazsa boş string döner ve çağıran
     * o dosyayı sessizce atlar (yol asla loglanmaz — PRD §72).
     */
    getPathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    }
  },
  // ---- PTY ----
  pty: {
    create: (tabId: string, profileId: string, cols: number, rows: number, cwd?: string): Promise<{ pid: number }> =>
      ipcRenderer.invoke(IPC.PTY_CREATE, tabId, profileId, cols, rows, cwd),
    write: (tabId: string, data: string): void => ipcRenderer.send(IPC.PTY_WRITE, tabId, data),
    resize: (tabId: string, cols: number, rows: number): void =>
      ipcRenderer.send(IPC.PTY_RESIZE, tabId, cols, rows),
    kill: (tabId: string): void => ipcRenderer.send(IPC.PTY_KILL, tabId),
    setMode: (tabId: string, mode: RenderMode): void => ipcRenderer.send(IPC.PTY_MODE, tabId, mode),
    restart: (tabId: string): Promise<{ pid: number } | null> => ipcRenderer.invoke(IPC.PTY_RESTART, tabId),
    buffer: (tabId: string): Promise<string> => ipcRenderer.invoke(IPC.PTY_BUFFER, tabId),
    onData: (cb: (payload: { ptyId: string; data: string }) => void): (() => void) => {
      const h = (_e: unknown, payload: { ptyId: string; data: string }): void => cb(payload)
      ipcRenderer.on(IPC.PTY_DATA, h)
      return () => ipcRenderer.removeListener(IPC.PTY_DATA, h)
    },
    onExit: (cb: (payload: { ptyId: string; exitCode: number; durationMs: number }) => void): (() => void) => {
      const h = (_e: unknown, payload: { ptyId: string; exitCode: number; durationMs: number }): void =>
        cb(payload)
      ipcRenderer.on(IPC.PTY_EXIT, h)
      return () => ipcRenderer.removeListener(IPC.PTY_EXIT, h)
    },
    onCwd: (cb: (payload: { ptyId: string; cwd: string }) => void): (() => void) => {
      const h = (_e: unknown, payload: { ptyId: string; cwd: string }): void => cb(payload)
      ipcRenderer.on(IPC.PTY_CWD, h)
      return () => ipcRenderer.removeListener(IPC.PTY_CWD, h)
    }
  },
  // ---- Shells ----
  shells: {
    discover: (): Promise<ShellInfo[]> => ipcRenderer.invoke(IPC.SHELLS_DISCOVER)
  },
  // ---- Settings ----
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke(IPC.SETTINGS_SET, patch)
  },
  dialog: {
    openDir: (): Promise<string | null> => ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR)
  },
  git: {
    status: (cwd: string): Promise<GitStatus | null> => ipcRenderer.invoke(IPC.GIT_STATUS, cwd)
  },
  // ---- Window ----
  window: {
    /** Tema değişince Windows Controls Overlay renklerini bildir (PRD §68). */
    setTitleBarOverlay: (overlay: TitleBarOverlayPayload): void =>
      ipcRenderer.send(IPC.WINDOW_TITLEBAR_OVERLAY, overlay)
  },
  // ---- Clipboard ----
  clipboard: {
    readText: (): Promise<string> => ipcRenderer.invoke(IPC.CLIPBOARD_READ)
  }
}

contextBridge.exposeInMainWorld('termflow', api)

export type TermflowApi = typeof api

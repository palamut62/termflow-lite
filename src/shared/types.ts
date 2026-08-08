// Shared data models between main and renderer (TermFlow Lite, PRD §14)

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'wsl' | 'gitbash' | 'custom'

export interface TerminalTab {
  id: string
  title: string
  profileId: string
  cwd?: string
}

export interface TerminalProfile {
  id: string
  name: string
  command: string
  args?: string[]
  cwd?: string
  icon?: string
  env?: Record<string, string>
}

export interface CreateTerminalInput {
  kind: ShellKind
  shell?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface ShellInfo {
  /** 'powershell' | 'pwsh' | 'cmd' | 'wsl' | 'gitbash' | 'bash' | 'sh' */
  id: string
  /** Görünen ad: 'PowerShell', 'PowerShell Core', 'Command Prompt', 'WSL', 'Git Bash', 'Bash', 'Shell' */
  name: string
  kind: ShellKind
  /** executable path */
  command: string
  args: string[]
  icon?: string
}

export type RenderMode = 'active' | 'passive' | 'buffer'

export type PtyEvent =
  | { kind: 'data'; ptyId: string; data: string }
  | { kind: 'exit'; ptyId: string; exitCode: number; durationMs: number }
  | { kind: 'cwd'; ptyId: string; cwd: string }

export interface AppSettings {
  themeId: string
  fontFamily: string
  fontSize: number
  fontLigatures: boolean
  lineHeight: number
  letterSpacing: number
  cursorStyle: 'block' | 'bar' | 'underline'
  cursorBlink: boolean
  scrollback: number
  terminalPadding: number
  /** 0-100, 100 = opak */
  opacity: number
  blur: boolean
  tabHeight: number
  copyOnSelect: boolean
  rightClickBehavior: 'context-menu' | 'paste'
  confirmBeforeClose: boolean
  bell: boolean
  defaultProfileId: string
  startupDirectory: 'home' | 'last'
  customStartupDirectory: string
  shortcuts: Record<string, string>
  profiles: TerminalProfile[]
  lastActiveProfileId?: string
  windowWidth: number
  windowHeight: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'dark',
  fontFamily: "'Cascadia Mono', Consolas, 'Courier New', monospace",
  fontSize: 13,
  fontLigatures: false,
  lineHeight: 1.0,
  letterSpacing: 0,
  cursorStyle: 'block',
  cursorBlink: true,
  scrollback: 10000,
  terminalPadding: 8,
  opacity: 100,
  blur: false,
  tabHeight: 36,
  copyOnSelect: false,
  rightClickBehavior: 'context-menu',
  confirmBeforeClose: true,
  bell: true,
  defaultProfileId: 'powershell',
  startupDirectory: 'home',
  customStartupDirectory: '',
  shortcuts: {
    'ctrl+shift+t': 'new-tab',
    'ctrl+shift+w': 'close-tab',
    'ctrl+tab': 'next-tab',
    'ctrl+shift+tab': 'prev-tab',
    'ctrl+shift+f': 'search',
    'ctrl+,': 'settings',
    'ctrl+=': 'font-increase',
    'ctrl+-': 'font-decrease',
    'ctrl+0': 'font-reset'
  },
  profiles: [],
  windowWidth: 1100,
  windowHeight: 700
}

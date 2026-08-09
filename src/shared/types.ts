// Shared data models between main and renderer (TermFlow Lite, PRD §14)

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'wsl' | 'gitbash' | 'custom'

export interface TerminalTab {
  id: string
  title: string
  profileId: string
  /** True while the tab's PTY process is alive. */
  running: boolean
  cwd?: string
  /** Immutable working directory override used only for the initial spawn. */
  launchCwd?: string
}

export interface TerminalProfile {
  id: string
  name: string
  /** Boş bırakılırsa profil, platformun varsayılan kabuğunda açılır. */
  command: string
  args?: string[]
  cwd?: string
  icon?: string
  env?: Record<string, string>
  /** Kabuk hazır olunca terminale yazılacak komut (CLI ajan profilleri). */
  startupCommand?: string
  /** Sekme/menü rengi (#rrggbb). */
  color?: string
  /** Undefined is treated as enabled for command profiles. */
  fullPermissions?: boolean
  /** CLI-specific arguments appended when fullPermissions is enabled. */
  fullPermissionArgs?: string
}

export interface ProviderProfile {
  id: string
  name: string
  /** CLI command started inside the platform default shell. */
  command: string
  model?: string
  /** Selectable model ids shown in Settings; model is the active one. */
  models?: string[]
  baseUrl?: string
  /** Existing OS environment variable that contains the provider secret. */
  apiKeyEnv?: string
  modelEnv?: string
  baseUrlEnv?: string
  color?: string
  fullPermissions?: boolean
  fullPermissionArgs?: string
}

export interface CreateTerminalInput {
  kind: ShellKind
  shell?: string
  args?: string[]
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
  /** PTY spawn edildikten kısa süre sonra kabuğa yazılacak komut. */
  startupCommand?: string
}

/**
 * Full 20-color terminal palette (PRD §27). Shared with the renderer theme
 * system so `settings.customTheme` can live in the persisted AppSettings.
 */
export interface ThemeColors {
  background: string
  foreground: string
  cursor: string
  selection: string
  black: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  white: string
  brightBlack: string
  brightRed: string
  brightGreen: string
  brightYellow: string
  brightBlue: string
  brightMagenta: string
  brightCyan: string
  brightWhite: string
}

/**
 * Uygulama kabuğunun (title bar, sekmeler, paneller, menüler, butonlar,
 * inputlar) VS Code workbench renkleri. Temalar bunu isteğe bağlı verir;
 * vermeyenler için terminal paletinden tek bir yerde türetilir
 * (themes.ts → deriveUiColors).
 */
export interface ThemeUiColors {
  titleBarBackground: string
  titleBarForeground: string
  tabActiveBackground: string
  tabInactiveBackground: string
  tabActiveForeground: string
  tabInactiveForeground: string
  tabBorder: string
  /** VS Code'un aktif sekme üst vurgu çizgisi. */
  activeTabTopBorder: string
  panelBackground: string
  sideBarBackground: string
  inputBackground: string
  inputForeground: string
  inputBorder: string
  buttonBackground: string
  buttonForeground: string
  buttonHoverBackground: string
  focusBorder: string
  menuBackground: string
  menuForeground: string
  menuSelectionBackground: string
  statusBarBackground: string
  statusBarForeground: string
  widgetBorder: string
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
  /** Custom 20-color palette; null = use the 'dark-plus' fallback (PRD §27). */
  customTheme: ThemeColors | null
  /** Cursor color override; '' = theme default (PRD §32). */
  cursorColor: string
  cursorWidth: number
  fontWeight: string
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
  /** Pencere içeriğine 1px kenarlık çizer (PRD §30). */
  windowBorder: boolean
  /** İç yüzey köşe yuvarlaklığı, 0-20 px (PRD §30). */
  cornerRadius: number
  tabHeight: number
  copyOnSelect: boolean
  rightClickBehavior: 'context-menu' | 'paste'
  confirmBeforeClose: boolean
  bell: boolean
  defaultProfileId: string
  startupDirectory: 'home' | 'last' | 'custom'
  customStartupDirectory: string
  shortcuts: Record<string, string>
  profiles: TerminalProfile[]
  providerProfiles: ProviderProfile[]
  lastActiveProfileId?: string
  /** Son kullanılan çalışma dizini (PRD §38: startupDirectory 'last'). */
  lastCwd?: string
  windowWidth: number
  windowHeight: number
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeId: 'dark-plus',
  customTheme: null,
  cursorColor: '',
  cursorWidth: 2,
  fontWeight: 'normal',
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
  windowBorder: false,
  cornerRadius: 0,
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
  providerProfiles: [
    {
      id: 'deepseek',
      name: 'DeepSeek',
      command: 'claude',
      model: 'deepseek-v4-pro',
      models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
      baseUrl: 'https://api.deepseek.com/anthropic',
      apiKeyEnv: 'ANTHROPIC_AUTH_TOKEN',
      modelEnv: 'ANTHROPIC_MODEL',
      baseUrlEnv: 'ANTHROPIC_BASE_URL',
      color: '#111827',
      fullPermissions: true,
      fullPermissionArgs: '--dangerously-skip-permissions'
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      command: 'claude',
      model: 'openrouter/auto',
      models: ['openrouter/auto', '~openai/gpt-latest', 'anthropic/claude-opus-4.5'],
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKeyEnv: 'ANTHROPIC_AUTH_TOKEN',
      modelEnv: 'ANTHROPIC_MODEL',
      baseUrlEnv: 'ANTHROPIC_BASE_URL',
      color: '#6467f2',
      fullPermissions: true,
      fullPermissionArgs: '--dangerously-skip-permissions'
    },
    {
      id: 'ollama-local',
      name: 'Ollama Local',
      command: 'ollama run gemma3',
      model: 'gemma3',
      models: ['gemma3', 'deepseek-r1', 'qwen2.5-coder'],
      baseUrl: 'http://127.0.0.1:11434',
      modelEnv: 'OLLAMA_MODEL',
      baseUrlEnv: 'OLLAMA_HOST',
      color: '#b48ead',
      fullPermissions: true,
      fullPermissionArgs: ''
    }
  ],
  windowWidth: 1100,
  windowHeight: 700
}

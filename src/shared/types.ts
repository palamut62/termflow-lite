// Shared data models between main and renderer (TermFlow Lite, PRD §14)

export type ShellKind = 'powershell' | 'pwsh' | 'cmd' | 'wsl' | 'gitbash' | 'custom'
export type TabActivity = 'running' | 'waiting' | 'unread' | 'completed' | 'error'
export type AgentKind = 'claude' | 'codex' | 'opencode'

export interface AgentSessionRef {
  agent: AgentKind
  id: string
}

export interface AgentSession extends AgentSessionRef {
  title: string
  cwd?: string
  updatedAt: number
}

export interface TerminalTab {
  id: string
  title: string
  profileId: string
  /** True while the tab's PTY process is alive. */
  running: boolean
  activity: TabActivity
  startedAt: number
  cwd?: string
  /** Immutable working directory override used only for the initial spawn. */
  launchCwd?: string
  /** Existing CLI conversation to resume when this tab's PTY starts. */
  resumeSession?: AgentSessionRef
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
  /** CLI model passed with --model; empty lets the CLI choose its own default. */
  model?: string
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

/**
 * Kayıtlı SSH bağlantısı. Kendi SSH istemcimiz YOK: sistemdeki OpenSSH `ssh`
 * binary'si PTY içinde spawn edilir (known_hosts, ~/.ssh/config, host key
 * doğrulaması OpenSSH'ta kalır). PAROLA ASLA SAKLANMAZ — kimlik doğrulama
 * anahtar / ssh-agent / ~/.ssh/config üzerinden yapılır.
 */
export interface SshConnection {
  id: string
  name: string
  host: string
  user?: string
  port?: number          // boş = 22
  /** Özel anahtar dosyası yolu (-i). Boş = ssh-agent / ~/.ssh/config. */
  identityFile?: string
  /** ProxyJump (-J) hedefi, ör. 'user@bastion'. */
  jumpHost?: string
  /** Bağlanır bağlanmaz uzak kabukta çalıştırılacak komut. */
  remoteCommand?: string
  /** Bağlantı sonrası cd edilecek uzak dizin. */
  remoteCwd?: string
  /** -A: agent forwarding. Varsayılan kapalı (güvenlik). */
  forwardAgent?: boolean
  /** Ek ham ssh argümanları (boşlukla ayrılmış). */
  extraArgs?: string
  color?: string
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
  /** WebGL renderer: 'auto'/'on' dener, 'off' DOM renderer'da kalır. */
  gpuAcceleration: 'auto' | 'on' | 'off'
  /** Sixel + iTerm2 satır içi görsel protokolü. */
  imageSupport: boolean
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
  /** Kayıtlı SSH bağlantıları (parola içermez). */
  sshConnections: SshConnection[]
  lastActiveProfileId?: string
  /** Son kullanılan çalışma dizini (PRD §38: startupDirectory 'last'). */
  lastCwd?: string
  windowWidth: number
  windowHeight: number
  /** Açık sekmeler + split düzeni yeniden açılışta geri yüklenir (userData/session.json). */
  restoreSession: boolean
  /** Quake (açılır) mod: global kısayolla ekranın üstünden inen pencere. */
  quakeMode: boolean
  /** Electron accelerator formatında global kısayol (ör. 'F12'). */
  quakeHotkey: string
  /** Odak kaybında pencereyi gizle. */
  quakeHideOnBlur: boolean
  /** Quake penceresinin çalışma alanına oranı (%). */
  quakeHeightPercent: number
  /** Açılışta sessizce güncelleme kontrolü yap (yalnızca kurulu sürümde). */
  autoCheckUpdates: boolean
}

/**
 * Otomatik güncelleme durumu (electron-updater). Main tarafından üretilir,
 * IPC.UPDATE_STATUS ile renderer'a push edilir.
 */
export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  releaseNotes?: string
  percent?: number
  error?: string
}

/**
 * Oturum geri yükleme için ayarlardan AYRI tutulan kalıcı durum
 * (userData/session.json). Yalnızca serileştirilebilir alanlar; ajan
 * konuşma referansı (resumeSession) bilinçli olarak yazılmaz.
 */
export interface PersistedSession {
  version: 1
  tabs: { id: string; title: string; profileId: string; cwd?: string }[]
  activeTabId: string | null
  paneTree: unknown | null
  splitDirection: 'vertical' | 'horizontal' | null
  splitRatio: number
  workspaceCwd?: string
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
  gpuAcceleration: 'auto',
  imageSupport: true,
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
    'ctrl+0': 'font-reset',
    'ctrl+alt+b': 'toggle-broadcast'
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
  sshConnections: [],
  windowWidth: 1100,
  windowHeight: 700,
  restoreSession: true,
  quakeMode: false,
  quakeHotkey: 'F12',
  quakeHideOnBlur: true,
  quakeHeightPercent: 50,
  autoCheckUpdates: true
}

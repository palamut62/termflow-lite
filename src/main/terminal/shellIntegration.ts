import { existsSync } from 'fs'
import { basename, join } from 'path'
import type { CreateTerminalInput } from '../../shared/types'

/**
 * OSC 133 shell integration (komut blokları, exit code, süre). Kabuk kendi
 * başlangıç dosyalarını yükledikten SONRA TermFlow'un script'i çalışır;
 * kullanıcının dotfile'larına ve $PROFILE'ına hiçbir şey yazılmaz.
 *
 *  - PowerShell / pwsh: -NoExit -Command ile script, dosya olarak değil script
 *    block olarak yüklenir; böylece execution policy ne engel olur ne de
 *    oturum için gevşetilir.
 *  - bash (Git Bash, Linux): --rcfile; login kabuk --rcfile'ı yok saydığı için
 *    login dosyaları script içinde kaynaklanır (TERMFLOW_BASH_LOGIN=1).
 *  - zsh: ZDOTDIR shim'i.
 *  - cmd, WSL ve diğerleri: desteklenmez, spawn yolu aynen kalır.
 */

export interface SpawnSpec {
  shell: string
  args: string[]
  env: Record<string, string>
}

let scriptDir: string | null = null

/** Uygulama hazır olunca script klasörü verilir (paketli: resources/shell-integration). */
export function configureShellIntegration(dir: string | null): void {
  scriptDir = dir && existsSync(dir) ? dir : null
}

type ShellFamily = 'powershell' | 'bash' | 'zsh' | null

export function shellFamily(shell: string): ShellFamily {
  const name = basename(shell.replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '')
  if (name === 'powershell' || name === 'pwsh') return 'powershell'
  if (name === 'bash') return 'bash'
  if (name === 'zsh') return 'zsh'
  return null
}

/** Kullanıcı kabuğa zaten bir komut/script verdiyse dokunulmaz. */
function hasExplicitCommand(family: ShellFamily, args: string[]): boolean {
  const lower = args.map((a) => a.toLowerCase())
  if (family === 'powershell') {
    return lower.some((a) => /^-(c|command|f|file|e|ec|encodedcommand|noexit)$/.test(a))
  }
  return lower.some((a) => a === '-c' || a === '--rcfile' || a === '--init-file' || (!a.startsWith('-') && a !== ''))
}

/**
 * Verilen spawn tanımına shell integration ekler. Desteklenmeyen kabuk, kapalı
 * ayar, ajan başlangıç komutu ya da açık bir komut varsa tanım aynen döner.
 */
export function applyShellIntegration(spec: SpawnSpec, input: CreateTerminalInput, dir = scriptDir): SpawnSpec {
  if (!input.shellIntegration || !dir || input.startupCommand || input.launchCommand) return spec
  const family = shellFamily(spec.shell)
  if (!family || hasExplicitCommand(family, spec.args)) return spec

  if (family === 'powershell') {
    const script = join(dir, 'powershell.ps1').replace(/'/g, "''")
    const load = `try { . ([scriptblock]::Create([IO.File]::ReadAllText('${script}'))) } catch {}`
    return { ...spec, args: [...spec.args, '-NoExit', '-Command', load] }
  }

  if (family === 'bash') {
    const login = spec.args.some((a) => a === '--login' || a === '-l' || a === '-il' || a === '-li')
    const rest = spec.args.filter((a) => !['--login', '-l', '-il', '-li', '-i'].includes(a))
    // Git Bash Windows yollarını ileri eğik çizgiyle sorunsuz okur.
    const rcfile = join(dir, 'bash.sh').replace(/\\/g, '/')
    return {
      ...spec,
      args: [...rest, '--rcfile', rcfile, '-i'],
      env: { ...spec.env, ...(login ? { TERMFLOW_BASH_LOGIN: '1' } : {}) }
    }
  }

  const userZdotdir = spec.env.ZDOTDIR || spec.env.HOME || ''
  return {
    ...spec,
    env: { ...spec.env, ZDOTDIR: join(dir, 'zsh'), TERMFLOW_USER_ZDOTDIR: userZdotdir }
  }
}

import type { SshConnection } from './types'

/**
 * OpenSSH argüman üretimi. Kendi SSH istemcimiz yok: bu saf fonksiyon yalnızca
 * sistemdeki `ssh` binary'sine geçilecek ARGÜMAN DİZİSİNİ üretir — kabuk
 * yorumu yoktur (spawn argv). Yine de host/user/dosya yolu gibi alanlar uzak
 * komut string'ine ya da ssh option'larına sızabildiği için kabuk
 * metakarakterleri baştan reddedilir (validateSshConnection).
 *
 * PAROLA HİÇBİR YERDE SAKLANMAZ/GEÇİLMEZ: kimlik doğrulama anahtar, ssh-agent
 * veya ~/.ssh/config üzerinden yapılır; parola isteyen sunucularda OpenSSH
 * kendi prompt'unu terminalde gösterir.
 */

/** Kabuk metakarakteri veya boşluk içeren host/user reddedilir. */
const UNSAFE_STRICT = /[\s;&|$`'"<>\\]/
/** Yol/komut alanları: boşluk serbest, kabuk metakarakterleri değil. */
const UNSAFE_LOOSE = /[;&|$`'"<>\n\r]/
/**
 * remoteCwd tek tırnak içine alınıp POSIX kaçışıyla üretildiği için (bkz.
 * singleQuote) tek tırnak serbesttir; diğer kabuk metakarakterleri yine yasak.
 */
const UNSAFE_REMOTE_CWD = /[;&|$`"<>\n\r]/

/** Hata mesajı döner, geçerliyse null. */
export function validateSshConnection(conn: SshConnection): string | null {
  const host = conn.host?.trim() ?? ''
  if (!host) return 'Host is required.'
  if (UNSAFE_STRICT.test(host)) return 'Host contains invalid characters.'

  const user = conn.user?.trim() ?? ''
  if (user && UNSAFE_STRICT.test(user)) return 'User contains invalid characters.'

  if (conn.port !== undefined && conn.port !== null) {
    if (!Number.isInteger(conn.port) || conn.port < 1 || conn.port > 65535) return 'Port must be between 1 and 65535.'
  }

  const identityFile = conn.identityFile?.trim() ?? ''
  if (identityFile && UNSAFE_LOOSE.test(identityFile)) return 'Identity file contains invalid characters.'

  const jumpHost = conn.jumpHost?.trim() ?? ''
  if (jumpHost && UNSAFE_STRICT.test(jumpHost)) return 'Jump host contains invalid characters.'

  const remoteCwd = conn.remoteCwd?.trim() ?? ''
  if (remoteCwd && UNSAFE_REMOTE_CWD.test(remoteCwd)) return 'Remote directory contains invalid characters.'

  const sessionName = conn.sessionName?.trim() ?? ''
  // tmux treats '.' and ':' as target separators, so the allowed set is kept
  // narrow rather than merely shell-safe.
  if (sessionName && !/^[A-Za-z0-9_-]+$/.test(sessionName)) {
    return 'Session name may only contain letters, digits, dashes and underscores.'
  }

  return null
}

export const DEFAULT_REMOTE_SESSION_NAME = 'termflow'

/** Multiplexer session name for a connection, sanitized to a safe default. */
export function remoteSessionName(conn: SshConnection): string {
  const name = conn.sessionName?.trim() ?? ''
  return /^[A-Za-z0-9_-]+$/.test(name) ? name : DEFAULT_REMOTE_SESSION_NAME
}

/**
 * Wrap a remote payload in a multiplexer attach so the work survives a dropped
 * connection or a closed window.
 *
 * tmux: `new-session -A` attaches to `name` if it exists and creates it
 * otherwise, which is exactly the reconnect semantics we want.
 * screen: `-D -R` detaches an existing session elsewhere and reattaches here.
 */
function multiplexerCommand(conn: SshConnection, cwd: string, command: string): string {
  const name = remoteSessionName(conn)
  if ((conn.multiplexer ?? 'tmux') === 'screen') {
    // screen has no working-directory flag, so the cd happens around it.
    const screen = command ? `screen -D -R ${name} ${command}` : `screen -D -R ${name}`
    return cwd ? `cd ${singleQuote(cwd)} && ${screen}` : screen
  }
  const parts = ['tmux', 'new-session', '-A', '-s', name]
  if (cwd) parts.push('-c', singleQuote(cwd))
  if (command) parts.push(command)
  return parts.join(' ')
}

/**
 * POSIX tek tırnak alıntılama: içerik olduğu gibi kabuğa geçer, içindeki tek
 * tırnaklar `'\''` kalıbıyla kaçırılır. Boşluklu uzak dizinler böyle çalışır.
 */
function singleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/** `cd <dir> && exec $SHELL -l` / kullanıcı komutu — tek uzak komut argümanı. */
function remoteCommandArg(conn: SshConnection): string | undefined {
  const cwd = conn.remoteCwd?.trim() ?? ''
  const command = conn.remoteCommand?.trim() ?? ''
  if (conn.persistentSession) return multiplexerCommand(conn, cwd, command)
  if (!cwd && !command) return undefined
  if (cwd && command) return `cd ${singleQuote(cwd)} && ${command}`
  if (cwd) return `cd ${singleQuote(cwd)} && exec $SHELL -l`
  return command
}

/**
 * SSH argümanları. Sıra: -p, -i, -J, -A, extraArgs, [user@]host, uzak komut.
 * Geçersiz bağlantıda throw eder (çağıran anlamlı hata gösterir).
 */
export function buildSshArgs(conn: SshConnection): string[] {
  const error = validateSshConnection(conn)
  if (error) throw new Error(error)

  const args: string[] = []
  if (conn.port && conn.port !== 22) args.push('-p', String(conn.port))

  const identityFile = conn.identityFile?.trim()
  if (identityFile) args.push('-i', identityFile)

  const jumpHost = conn.jumpHost?.trim()
  if (jumpHost) args.push('-J', jumpHost)

  if (conn.forwardAgent) args.push('-A')

  const extra = conn.extraArgs?.trim()
  if (extra) args.push(...extra.split(/\s+/).filter(Boolean))

  const remote = remoteCommandArg(conn)
  // `ssh host <command>` allocates no remote TTY, which leaves an interactive
  // shell without a prompt and stops tmux/screen from starting at all. -t must
  // therefore precede the destination whenever a remote command is sent.
  if (remote) args.push('-t')

  const host = conn.host.trim()
  const user = conn.user?.trim()
  args.push(user ? `${user}@${host}` : host)

  if (remote) args.push(remote)

  return args
}

/** Status bar / sekme etiketleri için 'user@host' (user yoksa 'host'). */
export function sshTarget(conn: SshConnection): string {
  const host = conn.host?.trim() ?? ''
  const user = conn.user?.trim()
  return user ? `${user}@${host}` : host
}

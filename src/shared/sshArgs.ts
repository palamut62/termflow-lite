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

  return null
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
  const cwd = conn.remoteCwd?.trim()
  const command = conn.remoteCommand?.trim()
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

  const host = conn.host.trim()
  const user = conn.user?.trim()
  args.push(user ? `${user}@${host}` : host)

  const remote = remoteCommandArg(conn)
  if (remote) args.push(remote)

  return args
}

/** Status bar / sekme etiketleri için 'user@host' (user yoksa 'host'). */
export function sshTarget(conn: SshConnection): string {
  const host = conn.host?.trim() ?? ''
  const user = conn.user?.trim()
  return user ? `${user}@${host}` : host
}

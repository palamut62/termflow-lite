import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { extname, isAbsolute, join, normalize } from 'path'
import type { ResolvedPath } from '../shared/ipc'

const MAX_LENGTH = 8192
const URL_PROTOCOL = /:\/\//
const PROTOCOL_LIKE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/
const NETWORK_PATH = /^[\\/]{2}/
const EXECUTABLE_EXTENSIONS = new Set([
  '.appref-ms', '.bat', '.cmd', '.com', '.cpl', '.exe', '.hta', '.jar', '.js', '.jse',
  '.lnk', '.msc', '.msi', '.msp', '.ps1', '.psm1', '.reg', '.scr', '.url', '.vbe', '.vbs',
  '.wsf', '.wsh'
])

export function isSafePathToOpen(path: string, isDirectory: boolean): boolean {
  return isDirectory || !EXECUTABLE_EXTENSIONS.has(extname(path).toLowerCase())
}

/**
 * Terminal çıktısından gelen bir yol adayını tab'ın cwd'sine göre çözümler ve
 * diskinizde gerçekten var olduğunu doğrular. Var olmayan, URL veya protokol
 * benzeri değerler null döner — tıklanabilir link yalnızca gerçek yollar olur.
 *
 * Sandbox'lı renderer'da fs yok; bu çözümleme main process'te tek yerde
 * (IPC.SYSTEM_RESOLVE_PATH) yapılır.
 */
export function resolvePathCandidate(candidate: string, cwd: string): ResolvedPath | null {
  if (typeof candidate !== 'string' || typeof cwd !== 'string') return null
  const value = candidate.trim()
  if (!value || value.length > MAX_LENGTH) return null
  // Hover ile tetiklenen senkron fs kontrolü ağ yolunda ana process'i saniyelerce
  // kilitleyebilir. Tıklanabilir yollar yerel disklerle sınırlıdır.
  if (NETWORK_PATH.test(value)) return null
  // URL'ler WebLinksAddon'ın işi; '://' içeren adayları asla yol gibi açma.
  if (URL_PROTOCOL.test(value)) return null
  // 'http:', 'mailto:' vb. protokol benzeri değerler yol değildir; ancak
  // Windows sürücü yolları ('C:\...' / 'C:/...') bu teste takılmamalı.
  if (PROTOCOL_LIKE.test(value) && !WINDOWS_DRIVE.test(value)) return null

  // '~' (home) genişletmesi — Git Bash/Unix alışkanlığı.
  let target: string
  if (value === '~') target = homedir()
  else if (value.startsWith('~/') || value.startsWith('~\\')) target = join(homedir(), value.slice(2))
  else target = value

  try {
    const full = normalize(isAbsolute(target) ? target : join(cwd, target))
    if (!existsSync(full)) return null
    const st = statSync(full)
    // Dönen yol, kök sürücü ('C:\') dışında sondaki ayraçsız olur ki menüde
    // kopyalanan/karşılaştırılan yol temiz görünsün.
    const cleaned = full.length > 3 && /[\\/]$/.test(full) ? full.slice(0, -1) : full
    const isDirectory = st.isDirectory()
    return { path: cleaned, isDirectory, canOpen: isSafePathToOpen(cleaned, isDirectory) }
  } catch {
    return null
  }
}

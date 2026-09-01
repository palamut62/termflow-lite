import type { IDisposable, ILink, Terminal } from '@xterm/xterm'
import type { ResolvedPath } from '../../../shared/ipc'

/**
 * Terminal çıktısındaki dosya/klasör yollarını tıklanabilir link yapar.
 *
 * - `registerPathLinkProvider` xterm'in custom link provider'ı olarak buffer
 *   satırlarını tarar; adayları tab'ın güncel cwd'sine göre main process'te
 *   çözdürür (IPC.SYSTEM_RESOLVE_PATH) ve YALNIZCA diskte gerçekten var olan
 *   yolları link olarak verir. Sol tık → varsayılan uygulamayla aç.
 * - `getPathAtMouse` sağ tıkta imleç altındaki yolu bulur (Open / Open File
 *   Location / Copy Path menüsü için).
 *
 * Sandbox nedeniyle renderer'da fs yok: tüm çözümleme main'de. Sonuçlar LRU
 * önbellekte tutulur ki aynı satır tekrar görüntülenince IPC tekrar gitmesin.
 */

export interface PathCandidate {
  /** Çözülecek yol adayı (etrafındaki ayraçlar temizlenmiş). */
  value: string
  /** 1-based başlangıç sütunu (xterm ILink.range ile uyumlu). */
  start: number
  /** 1-based bitiş sütunu (kapsayıcı). */
  end: number
}

export interface PathMenuInfo {
  path: string
  isDirectory: boolean
  canOpen: boolean
  label: string
}

/** Boşluk + Windows geçersiz + tırnak + metin ayraçları dışındaki her karakter. */
const SPAN_RE = /[^\s<>"|?*]+/g
const QUOTED_PATH_RE = /(["'])([^"'<>|?*\r\n]+)\1/g
const WINDOWS_PATH_RE = /[A-Za-z]:[\\/][^<>"|?*\r\n]+/g
const LEADING_DELIM = /^[([{]+/
/** Kapanış/metin ayraçları (nokta hariç — nokta ayrıca ele alınır). */
const TRAILING_DELIM = /[)\]}>;:!?,]+$/
/** Cümle sonu noktası: yalnızca öncesi alfanümerikse ('..' / './' bozulmaz). */
const SENTENCE_DOT = /([A-Za-z0-9])\.+$/
const SEPARATOR = /[\\/]/
const EXTENSION = /\.[A-Za-z0-9]{1,10}$/
const BAD_PREFIX = /^[-#=+]/

function isPathLike(value: string): boolean {
  if (!value) return false
  if (value.includes('://') || value.includes('@')) return false
  if (BAD_PREFIX.test(value)) return false
  return SEPARATOR.test(value) || EXTENSION.test(value) || value.startsWith('.') || value.startsWith('~')
}

/** Span'dan baştaki/sondaki metin ayraçlarını temizler; hücre sütunu düzeltme sayıları. */
function stripEdges(raw: string): { value: string; lead: number; trail: number } {
  let value = raw
  let lead = 0
  let trail = 0
  const leadMatch = value.match(LEADING_DELIM)
  if (leadMatch) {
    lead = leadMatch[0].length
    value = value.slice(lead)
  }
  let changed = true
  while (changed && value) {
    changed = false
    const nonDot = value.match(TRAILING_DELIM)
    if (nonDot) {
      trail += nonDot[0].length
      value = value.slice(0, -nonDot[0].length)
      changed = true
      continue
    }
    const dot = value.match(SENTENCE_DOT)
    if (dot) {
      const before = value.length
      value = value.replace(SENTENCE_DOT, '$1')
      trail += before - value.length
      changed = true
    }
  }
  return { value, lead, trail }
}

/** Bir buffer satırındaki yol adaylarını sütun aralıklarıyla çıkarır. */
export function extractPathCandidates(text: string): PathCandidate[] {
  const results: PathCandidate[] = []
  const seen = new Set<string>()
  const quotedRanges: Array<{ start: number; end: number }> = []
  const addCandidate = (raw: string, index: number): void => {
    const { value, lead, trail } = stripEdges(raw.trimEnd())
    if (!value || !isPathLike(value)) return
    const start0 = index + lead
    const end0 = index + raw.trimEnd().length - trail - 1
    const key = `${start0}:${end0}:${value}`
    if (seen.has(key)) return
    seen.add(key)
    results.push({ value, start: start0 + 1, end: end0 + 1 })
  }

  QUOTED_PATH_RE.lastIndex = 0
  let quoted: RegExpExecArray | null
  while ((quoted = QUOTED_PATH_RE.exec(text)) !== null) {
    quotedRanges.push({ start: quoted.index, end: quoted.index + quoted[0].length - 1 })
    addCandidate(quoted[2], quoted.index + 1)
  }

  // Windows mutlak yolları boşluk içerebilir. Tam satır kuyruğunu ve en fazla
  // sekiz boşluk sınırındaki kısaltılmış biçimi üretiriz; main process yalnızca
  // diskte gerçekten var olan en uzun adayı kabul eder.
  WINDOWS_PATH_RE.lastIndex = 0
  let windowsPath: RegExpExecArray | null
  while ((windowsPath = WINDOWS_PATH_RE.exec(text)) !== null) {
    let raw = windowsPath[0].trimEnd()
    for (let attempt = 0; attempt < 8 && raw.length > 2; attempt += 1) {
      addCandidate(raw, windowsPath.index)
      const cut = Math.max(raw.lastIndexOf(' '), raw.lastIndexOf('\t'))
      if (cut <= 2) break
      raw = raw.slice(0, cut).trimEnd()
    }
  }

  SPAN_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SPAN_RE.exec(text)) !== null) {
    const matchIndex = match.index
    const matchEnd = matchIndex + match[0].length - 1
    if (quotedRanges.some((range) => matchIndex >= range.start && matchEnd <= range.end)) continue
    addCandidate(match[0], matchIndex)
  }
  return results.sort((left, right) => (right.end - right.start) - (left.end - left.start) || left.start - right.start)
}

// cwd|aday -> ResolvedPath | null. 'null' da önbelleklenir ki yok olan bir yol
// için IPC tekrar edilmesin.
const resolveCache = new Map<string, ResolvedPath | null>()
const CACHE_LIMIT = 512

function resolvePathCached(candidate: string, cwd: string): Promise<ResolvedPath | null> {
  // Uzunluk önekli anahtar: cwd/aday ayracından bağımsız, çarpışmasız.
  const key = `${cwd.length}|${cwd}|${candidate}`
  const cached = resolveCache.get(key)
  if (cached !== undefined) return Promise.resolve(cached)
  return window.termflow.system
    .resolvePath(candidate, cwd)
    .catch(() => null)
    .then((resolved) => {
      resolveCache.set(key, resolved)
      if (resolveCache.size > CACHE_LIMIT) {
        const oldest = resolveCache.keys().next().value
        if (oldest !== undefined) resolveCache.delete(oldest)
      }
      return resolved
    })
}

/**
 * xterm link provider'ı. `isEnabled` canlı okunur (ayar değişince terminal
 * yeniden kurulmadan kapanır/açılır); kapalıyken hiçbir satırda link üretilmez.
 */
export function registerPathLinkProvider(
  term: Terminal,
  getCwd: () => string,
  isEnabled: () => boolean
): IDisposable {
  return term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      if (!isEnabled()) {
        callback(undefined)
        return
      }
      const line = term.buffer.active.getLine(bufferLineNumber - 1)
      if (!line) {
        callback(undefined)
        return
      }
      const text = line.translateToString(false)
      const candidates = extractPathCandidates(text)
      if (candidates.length === 0) {
        callback(undefined)
        return
      }
      const cwd = getCwd()
      const links: ILink[] = []
      let pending = candidates.length
      let settled = false
      const settle = (): void => {
        if (settled) return
        settled = true
        const selected: ILink[] = []
        for (const link of links.sort((left, right) =>
          (right.range.end.x - right.range.start.x) - (left.range.end.x - left.range.start.x)
        )) {
          const overlaps = selected.some((item) =>
            link.range.start.x <= item.range.end.x && link.range.end.x >= item.range.start.x
          )
          if (!overlaps) selected.push(link)
        }
        selected.sort((left, right) => left.range.start.x - right.range.start.x)
        callback(selected.length > 0 ? selected : undefined)
      }
      for (const cand of candidates) {
        void resolvePathCached(cand.value, cwd).then((resolved) => {
          if (resolved) {
            links.push({
              range: {
                start: { x: cand.start, y: bufferLineNumber },
                end: { x: cand.end, y: bufferLineNumber }
              },
              text: cand.value,
              activate: (event) => {
                event.preventDefault()
                if (!isEnabled()) return
                // xterm 6 linkifier'ı sağ tıkta (button 2) da activate tetikler
                // (mousedown/mouseup dinleyicilerinde buton filtresi yok). Sağ
                // tık yol menüsünü açmalı, dosyayı AÇMAMALI.
                if (event && 'button' in event && (event as MouseEvent).button === 2) return
                if (resolved.canOpen) void window.termflow.system.openPath(resolved.path)
                else void window.termflow.system.revealInFolder(resolved.path)
              }
            })
          }
          pending -= 1
          if (pending === 0) settle()
        })
      }
    }
  })
}

/** Sağ tık konumundaki imlecin altındaki yolu (varsa) çözüp döndürür. */
export async function getPathAtMouse(term: Terminal, e: MouseEvent, cwd: string): Promise<PathMenuInfo | null> {
  const cell = cellFromMouseEvent(term, e)
  if (!cell) return null
  const buffer = term.buffer.active
  const line = buffer.getLine(buffer.viewportY + cell.row)
  if (!line) return null
  const col = cell.col + 1 // 0-based -> 1-based
  for (const cand of extractPathCandidates(line.translateToString(false))) {
    if (col >= cand.start && col <= cand.end) {
      const resolved = await resolvePathCached(cand.value, cwd)
      if (resolved) return { path: resolved.path, isDirectory: resolved.isDirectory, canOpen: resolved.canOpen, label: cand.value }
    }
  }
  return null
}

/** Fare olayını xterm hücresine çevirir (FitAddon hücreyi container'a oturtur). */
function cellFromMouseEvent(term: Terminal, e: MouseEvent): { col: number; row: number } | null {
  const host = term.element
  if (!host) return null
  const rect = host.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const cellWidth = rect.width / term.cols
  const cellHeight = rect.height / term.rows
  const col = Math.floor((e.clientX - rect.left) / cellWidth)
  const row = Math.floor((e.clientY - rect.top) / cellHeight)
  if (col < 0 || row < 0 || col >= term.cols || row >= term.rows) return null
  return { col, row }
}

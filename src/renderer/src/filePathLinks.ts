// Detect file paths in terminal output so they can be turned into clickable
// links. Pure string work: no Node APIs here (renderer is sandboxed).

export interface PathMatch {
  start: number
  end: number
  text: string
  path: string
  line?: number
  col?: number
}

/** Trailing punctuation that belongs to the sentence, never to the path. */
const TRAILING = '.,;:)"\'’]}>!?'

// Path body: drive-absolute, posix-absolute, ./ ../ relative or bare
// segment/segment. A bare word without a separator is deliberately excluded —
// otherwise every English word would light up as a link.
const SEG = String.raw`[\w.\-@+$~%#]`
const PATH_BODY = String.raw`(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\\/]|(?=${SEG}+[\\/]))${SEG}*(?:[\\/]${SEG}+)*`

// Suffixes: `:42`, `:42:7`, `(42,7)`, `(42)`
const SUFFIX = String.raw`(?::(\d+)(?::(\d+))?|\((\d+)(?:[,:](\d+))?\))?`

const PATH_RE = new RegExp(PATH_BODY + SUFFIX, 'g')

// `File "src/a.py", line 42` — python tracebacks quote the path, so the generic
// scanner would stop at the quote and lose the line number.
const PY_RE = /File ("|')(.+?)\1, line (\d+)/g

const URL_RE = /https?:\/\/\S+/g

function trimTrailing(raw: string): string {
  let out = raw
  while (out.length > 0 && TRAILING.includes(out[out.length - 1])) out = out.slice(0, -1)
  return out
}

/** A path needs a separator, and at least one non-separator character. */
function looksLikePath(p: string): boolean {
  if (!/[\\/]/.test(p)) return false
  if (/^[\\/]+$/.test(p)) return false
  // Reject pure numeric / time-like things ("12/34", "1:2") and ratios.
  if (/^[\d\\/.:]+$/.test(p)) return false
  return true
}

export function findPathMatches(text: string): PathMatch[] {
  if (!text || !text.trim()) return []

  const blocked: Array<[number, number]> = []
  URL_RE.lastIndex = 0
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) blocked.push([m.index, m.index + m[0].length])
  const isBlocked = (s: number, e: number): boolean => blocked.some(([bs, be]) => s < be && e > bs)

  const out: PathMatch[] = []
  const taken: Array<[number, number]> = []
  const overlaps = (s: number, e: number): boolean => taken.some(([ts, te]) => s < te && e > ts)
  const push = (m: PathMatch): void => {
    if (isBlocked(m.start, m.end) || overlaps(m.start, m.end)) return
    out.push(m)
    taken.push([m.start, m.end])
  }

  PY_RE.lastIndex = 0
  for (let m = PY_RE.exec(text); m; m = PY_RE.exec(text)) {
    const p = m[2]
    if (!looksLikePath(p)) continue
    push({ start: m.index, end: m.index + m[0].length, text: m[0], path: p, line: Number(m[3]) })
  }

  PATH_RE.lastIndex = 0
  for (let m = PATH_RE.exec(text); m; m = PATH_RE.exec(text)) {
    if (!m[0]) continue
    // The `(42,7)` form legitimately ends in ')' — don't let the punctuation
    // trimmer eat it and with it the line/col info.
    const raw = m[3] === undefined ? trimTrailing(m[0]) : m[0]
    if (!raw) continue
    const start = m.index
    const end = start + raw.length
    // Suffix survived the trim? Then keep the parsed line/col.
    const kept = raw.length === m[0].length
    const lineStr = kept ? (m[1] ?? m[3]) : undefined
    const colStr = kept ? (m[2] ?? m[4]) : undefined
    let path = raw
    if (lineStr !== undefined) {
      const cut = raw.search(/(?::\d+(?::\d+)?|\(\d+(?:[,:]\d+)?\))$/)
      if (cut > 0) path = raw.slice(0, cut)
    }
    path = trimTrailing(path.trim())
    if (!looksLikePath(path)) continue
    push({
      start,
      end,
      text: raw,
      path,
      line: lineStr === undefined ? undefined : Number(lineStr),
      col: colStr === undefined ? undefined : Number(colStr)
    })
  }

  return out.sort((a, b) => a.start - b.start)
}

function isAbsolute(p: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p) || /^~[\\/]?/.test(p)
}

/**
 * Join a terminal cwd with a relative path. Keeps the cwd's separator style so
 * the result is something the OS on the other side of the IPC can stat.
 */
export function resolvePath(cwd: string, path: string): string {
  if (isAbsolute(path) || !cwd) return path
  const sep = cwd.includes('\\') && !/^[\\/]/.test(cwd) ? '\\' : cwd.includes('\\') ? '\\' : '/'
  const base = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  const rest = path.split(/[\\/]/)
  for (const seg of rest) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (base.length > 1) base.pop()
      continue
    }
    base.push(seg)
  }
  return base.join(sep)
}

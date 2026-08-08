/**
 * tmux copy-mode-vi: pure motion/keymap layer.
 *
 * Everything here is xterm-free on purpose — the terminal buffer is reached
 * through the small `CopyBuffer` view so the motions stay unit testable.
 * TerminalView owns the xterm side (selection painting, scrolling, clipboard).
 */

/** Absolute cursor position: `row` is a buffer row, not a viewport row. */
export interface CopyPos {
  row: number
  col: number
}

/** Minimal read-only view of a terminal buffer. */
export interface CopyBuffer {
  /** Total number of buffer rows (scrollback + viewport). */
  lineCount: number
  /** Row text with trailing padding already trimmed. */
  lineText: (row: number) => string
}

export type CopyMotion =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'wordForward'
  | 'wordBack'
  | 'lineStart'
  | 'lineEnd'
  | 'bufferStart'
  | 'bufferEnd'

export type CopyScroll = 'halfUp' | 'halfDown' | 'pageUp' | 'pageDown'

export type CopyCommand =
  | { type: 'move'; motion: CopyMotion }
  | { type: 'scroll'; amount: CopyScroll }
  | { type: 'beginSelection' }
  | { type: 'copySelection' }
  | { type: 'cancel' }
  | { type: 'exit' }
  | { type: 'search'; direction: 'forward' | 'backward' }
  | { type: 'findNext' }
  | { type: 'findPrevious' }

type CharClass = 'word' | 'punct' | 'space'

function classify(ch: string): CharClass {
  if (ch === '' || /\s/.test(ch)) return 'space'
  return /[A-Za-z0-9_]/.test(ch) ? 'word' : 'punct'
}

function lineLength(buf: CopyBuffer, row: number): number {
  if (row < 0 || row >= buf.lineCount) return 0
  return buf.lineText(row).length
}

/** Char at a position; the virtual slot past a line's end reads as a space. */
function charAt(buf: CopyBuffer, pos: CopyPos): string {
  const text = buf.lineText(pos.row) ?? ''
  return pos.col < text.length ? text[pos.col] : ' '
}

/** Clamp a position onto a real cell (`col` may sit past the last char at most by 0). */
export function clampPos(buf: CopyBuffer, pos: CopyPos): CopyPos {
  const lastRow = Math.max(0, buf.lineCount - 1)
  const row = Math.max(0, Math.min(pos.row, lastRow))
  const maxCol = Math.max(0, lineLength(buf, row) - 1)
  return { row, col: Math.max(0, Math.min(pos.col, maxCol)) }
}

/** One cell forward, wrapping to the next row. Null at the very end. */
function nextPos(buf: CopyBuffer, pos: CopyPos): CopyPos | null {
  // The slot at index `len` is the virtual line break, so it is walkable.
  if (pos.col < lineLength(buf, pos.row)) return { row: pos.row, col: pos.col + 1 }
  if (pos.row >= buf.lineCount - 1) return null
  return { row: pos.row + 1, col: 0 }
}

/** One cell backward, wrapping to the previous row. Null at the very start. */
function prevPos(buf: CopyBuffer, pos: CopyPos): CopyPos | null {
  if (pos.col > 0) return { row: pos.row, col: pos.col - 1 }
  if (pos.row <= 0) return null
  return { row: pos.row - 1, col: lineLength(buf, pos.row - 1) }
}

/** vi `w`: start of the next word (word chars and punctuation are separate runs). */
export function wordForward(buf: CopyBuffer, from: CopyPos): CopyPos {
  let pos = clampPos(buf, from)
  const startClass = classify(charAt(buf, pos))
  if (startClass !== 'space') {
    // Leave the run we are standing on.
    while (classify(charAt(buf, pos)) === startClass) {
      const next = nextPos(buf, pos)
      if (!next) return clampPos(buf, pos)
      pos = next
    }
  }
  while (classify(charAt(buf, pos)) === 'space') {
    const next = nextPos(buf, pos)
    if (!next) return clampPos(buf, pos)
    pos = next
  }
  return clampPos(buf, pos)
}

/** vi `b`: start of the current word, or of the previous one when already there. */
export function wordBackward(buf: CopyBuffer, from: CopyPos): CopyPos {
  let pos = clampPos(buf, from)
  const first = prevPos(buf, pos)
  if (!first) return pos
  pos = first
  while (classify(charAt(buf, pos)) === 'space') {
    const prev = prevPos(buf, pos)
    if (!prev) return clampPos(buf, pos)
    pos = prev
  }
  const runClass = classify(charAt(buf, pos))
  for (;;) {
    const prev = prevPos(buf, pos)
    if (!prev || classify(charAt(buf, prev)) !== runClass) break
    pos = prev
  }
  return clampPos(buf, pos)
}

/**
 * Apply a cursor motion. Vertical/horizontal moves stop at the buffer edges;
 * `left`/`right` do not wrap across rows (tmux copy mode behaves the same).
 */
export function applyMotion(buf: CopyBuffer, pos: CopyPos, motion: CopyMotion): CopyPos {
  const cur = clampPos(buf, pos)
  switch (motion) {
    case 'left':
      return clampPos(buf, { row: cur.row, col: cur.col - 1 })
    case 'right':
      return clampPos(buf, { row: cur.row, col: cur.col + 1 })
    case 'up':
      return clampPos(buf, { row: cur.row - 1, col: cur.col })
    case 'down':
      return clampPos(buf, { row: cur.row + 1, col: cur.col })
    case 'wordForward':
      return wordForward(buf, cur)
    case 'wordBack':
      return wordBackward(buf, cur)
    case 'lineStart':
      return { row: cur.row, col: 0 }
    case 'lineEnd':
      return clampPos(buf, { row: cur.row, col: Math.max(0, lineLength(buf, cur.row) - 1) })
    case 'bufferStart':
      return clampPos(buf, { row: 0, col: 0 })
    case 'bufferEnd':
      return clampPos(buf, { row: buf.lineCount - 1, col: 0 })
  }
}

/** Ordered [start, end] pair for a selection between anchor and cursor. */
export function selectionRange(anchor: CopyPos, cursor: CopyPos): [CopyPos, CopyPos] {
  if (anchor.row < cursor.row || (anchor.row === cursor.row && anchor.col <= cursor.col)) {
    return [anchor, cursor]
  }
  return [cursor, anchor]
}

/**
 * Map a keydown to a copy-mode command. Returns null for keys copy mode
 * ignores — the caller still swallows them so nothing reaches the PTY.
 */
export function resolveCopyModeKey(
  e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey'>
): CopyCommand | null {
  if (e.altKey || e.metaKey) return null
  const key = e.key

  if (e.ctrlKey) {
    switch (key.toLowerCase()) {
      case 'u':
        return { type: 'scroll', amount: 'halfUp' }
      case 'd':
        return { type: 'scroll', amount: 'halfDown' }
      case 'b':
        return { type: 'scroll', amount: 'pageUp' }
      case 'f':
        return { type: 'scroll', amount: 'pageDown' }
      default:
        return null
    }
  }

  switch (key) {
    case 'h':
    case 'ArrowLeft':
      return { type: 'move', motion: 'left' }
    case 'j':
    case 'ArrowDown':
      return { type: 'move', motion: 'down' }
    case 'k':
    case 'ArrowUp':
      return { type: 'move', motion: 'up' }
    case 'l':
    case 'ArrowRight':
      return { type: 'move', motion: 'right' }
    case 'w':
      return { type: 'move', motion: 'wordForward' }
    case 'b':
      return { type: 'move', motion: 'wordBack' }
    case '0':
    case 'Home':
      return { type: 'move', motion: 'lineStart' }
    case '$':
    case 'End':
      return { type: 'move', motion: 'lineEnd' }
    case 'g':
      return { type: 'move', motion: 'bufferStart' }
    case 'G':
      return { type: 'move', motion: 'bufferEnd' }
    case 'PageUp':
      return { type: 'scroll', amount: 'pageUp' }
    case 'PageDown':
      return { type: 'scroll', amount: 'pageDown' }
    case ' ':
    case 'v':
      return { type: 'beginSelection' }
    case 'Enter':
    case 'y':
      return { type: 'copySelection' }
    case 'Escape':
      return { type: 'cancel' }
    case 'q':
      return { type: 'exit' }
    case '/':
      return { type: 'search', direction: 'forward' }
    case '?':
      return { type: 'search', direction: 'backward' }
    case 'n':
      return { type: 'findNext' }
    case 'N':
      return { type: 'findPrevious' }
    default:
      return null
  }
}

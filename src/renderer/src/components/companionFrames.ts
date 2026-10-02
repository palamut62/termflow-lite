// Agent companion, ASCII style: the very same scenes as the pixel style
// (companionScenes.ts) — the critter typing at its keyboard, watching a
// terminal, digging, thinking under a light bulb — turned into ASCII glyphs,
// with the speech bubble drawn as an ASCII box and a dim, flowing ASCII field
// filling the rest of the panel.
//
// Each terminal cell samples the scene's pixel under it. The critter's ramp
// tones become dense glyphs (the color carries the tone); props get a glyph
// by their brightness. Pure functions only, so it is all unit tested;
// AgentCompanion.tsx sizes the grid to the panel and paints it on a canvas.

import type { AgentActivity } from '../fun/agentActivity'
import { PIXEL_PALETTE, renderScene, sceneFor, type PixelColor, type SceneEvent } from './companionScenes'

/** What the agent is doing, derived from the tab's activity and process state. */
export type CompanionMood = 'working' | 'waiting' | 'attention' | 'done' | 'error' | 'sleeping'

/**
 * Color of a cell: a scene palette token (the critter's ramp tones are
 * recolored with the agent color), `bg` for the dim background field and
 * `eye` for the glowing eye glints.
 */
export type CompanionColor = PixelColor | 'bg' | 'eye'

export interface CompanionFrame {
  lines: string[]
  colors: CompanionColor[][]
}

export interface CompanionInput {
  event?: SceneEvent
  /** What the agent is doing (from its tool lines). */
  activity?: AgentActivity | null
  /** The user is typing into the agent's terminal. */
  listening?: boolean
  /** Current time, so a new action is announced plainly before any quip. */
  now?: number
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** The classic donut.c brightness ramp, dark to light. */
const RAMP = '.,-~:;=!*#$@'
const BG_RAMP = '      ..,-~'
/** Scene pixels across the panel width. */
const STAGE_COLUMNS = 38

const AGENT_TONES: Partial<Record<PixelColor, number>> = { r0: 0, bodyLo: 1, r1: 1, r2: 2, body: 2, r3: 3, bodyHi: 3, r4: 4 }

function glyph(bright: number): string {
  return RAMP[Math.round(clamp01(bright) * (RAMP.length - 1))]
}

/** Perceived brightness (0..1) of a fixed palette color. */
const LUMA: Partial<Record<PixelColor, number>> = Object.fromEntries(
  Object.entries(PIXEL_PALETTE).map(([token, hex]) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    return [token, 0.2126 * r + 0.7152 * g + 0.0722 * b]
  })
)

/** Background flow speed per mood. */
const FLOW: Record<CompanionMood, number> = { working: 1, waiting: 0.45, attention: 1.2, done: 0.7, error: 1.6, sleeping: 0.12 }

/** Splits a bubble line into lines of at most `width` characters. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && next.length > width) {
      lines.push(line)
      line = word.slice(0, width)
    } else {
      line = next.slice(0, width)
    }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * The frame for `mood`, `tick` frames after the mood began, on a `cols` x
 * `rows` grid. `aspect` is a cell's height divided by its width.
 */
export function renderCompanion(mood: CompanionMood, tick: number, cols: number, rows: number, aspect = 1.75, input: CompanionInput = {}): CompanionFrame {
  // Discrete steps (poses, blinks) use whole frames; the background flow uses
  // fractional time so it glides between steps.
  const time = Math.max(0, Number.isFinite(tick) ? tick : 0)
  const t = Math.floor(time)
  const w = Math.max(8, Math.floor(cols))
  const h = Math.max(6, Math.floor(rows))
  const ch = Array.from({ length: h }, () => Array.from({ length: w }, () => ' '))
  const color = Array.from({ length: h }, () => Array.from({ length: w }, (): CompanionColor => 'bg'))
  const put = (r: number, c: number, text: string, tone: CompanionColor, opaque = false): void => {
    if (r < 0 || r >= h) return
    for (let i = 0; i < text.length; i++) {
      if (c + i < 0 || c + i >= w || (text[i] === ' ' && !opaque)) continue
      ch[r][c + i] = text[i]
      color[r][c + i] = tone
    }
  }

  // Square scene pixels: each spans `cellsPerPixel` columns and that many
  // cell-widths of height, i.e. `rowsPerPixel` rows.
  const cellsPerPixel = w / STAGE_COLUMNS
  const rowsPerPixel = cellsPerPixel / aspect
  const stageRows = Math.ceil(h / rowsPerPixel)
  const scene = sceneFor(mood, input.event, input.activity)
  const frame = renderScene(scene, t, STAGE_COLUMNS, stageRows, { ...input, backdrop: false })
  const toCol = (x: number): number => Math.round(x * cellsPerPixel)
  const toRow = (y: number): number => Math.floor(y * rowsPerPixel)
  const groundRow = toRow(frame.groundY)

  const tf = time * FLOW[mood]
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const px = Math.min(frame.width - 1, Math.floor(c / cellsPerPixel))
      const py = Math.min(frame.height - 1, Math.floor(r / rowsPerPixel))
      const token = frame.pixels[py * frame.width + px]
      if (token === null) {
        if (r === groundRow) {
          ch[r][c] = '_'
          color[r][c] = 'grass'
          continue
        }
        // Background: a dim plasma flowing over the whole panel.
        const x = c / w - 0.5
        const y = (r / h - 0.5) * 2
        const v = Math.sin(x * 7 + tf * 0.09) + Math.sin(y * 9 - tf * 0.07) + Math.sin((x + y) * 5 + tf * 0.05) + Math.sin(Math.hypot(x, y) * 11 - tf * 0.11)
        ch[r][c] = BG_RAMP[Math.min(BG_RAMP.length - 1, Math.floor(((v + 4) / 8) * BG_RAMP.length))]
        continue
      }
      if (token === 'ink') continue // eyes and the like: dark holes
      if (token === 'white') {
        ch[r][c] = '@'
        color[r][c] = 'eye'
        continue
      }
      if (token === 'line') {
        ch[r][c] = ':'
        color[r][c] = 'line'
        continue
      }
      const dither = (((r * 7 + c * 13) % 5) - 2) * 0.012
      const tone = AGENT_TONES[token]
      // The critter: dense glyphs keep it solid, the tone picks among them.
      // Props: a glyph by how bright their color is.
      ch[r][c] = glyph(tone !== undefined ? 0.5 + tone * 0.11 + dither : 0.35 + 0.65 * (LUMA[token] ?? 0.5) + dither)
      color[r][c] = token
    }
  }

  for (const text of frame.texts) {
    const col = toCol(text.x)
    const row = toRow(text.y)
    if (text.kind === 'bubble') {
      // A rounded ASCII box above the critter, its tail pointing down.
      const lines = wrap(text.text, Math.max(6, w - 6))
      const inner = Math.max(...lines.map((l) => l.length))
      const left = Math.max(0, Math.min(w - inner - 4, col - Math.floor((inner + 4) / 2)))
      const bottom = Math.max(lines.length + 1, row)
      const top = bottom - lines.length - 1
      put(top, left, `╭${'─'.repeat(inner + 2)}╮`, 'r3', true)
      lines.forEach((line, i) => {
        put(top + 1 + i, left, `│ ${line.padEnd(inner)} │`, 'r3', true)
        put(top + 1 + i, left + 2, line, 'white')
      })
      const tail = Math.max(left + 2, Math.min(left + inner + 1, col))
      put(bottom, left, `╰${'─'.repeat(inner + 2)}╯`, 'r3', true)
      put(bottom, tail, '┬', 'r3')
      put(bottom + 1, tail, '│', 'r3')
    } else {
      // Centered under its prop, but kept fully inside the panel.
      const start = Math.max(0, Math.min(w - text.text.length, col - Math.floor(text.text.length / 2)))
      put(row, start, text.text, text.color ?? 'white')
    }
  }
  return { lines: ch.map((row) => row.join('')), colors: color }
}

/**
 * Animation speed for an agent's output rate (bytes/s): 1x when quiet, up to
 * 2x when output pours in. Logarithmic, so a burst doesn't make it frantic.
 */
export function companionEnergy(bytesPerSecond: number): number {
  const rate = Math.max(0, Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0)
  return Math.min(2, 1 + Math.log10(1 + rate / 200) / 2)
}

/** Maps tab state to a mood. An exited process always sleeps. */
export function companionMood(running: boolean, activity: 'running' | 'waiting' | 'unread' | 'completed' | 'error'): CompanionMood {
  if (!running) return activity === 'error' ? 'error' : 'sleeping'
  if (activity === 'running') return 'working'
  if (activity === 'waiting') return 'waiting'
  if (activity === 'unread') return 'attention'
  if (activity === 'error') return 'error'
  return 'done'
}

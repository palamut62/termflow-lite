// Agent companion, ASCII style: the same pixel critter as the pixel scenes
// (art/critter/build.py), rendered as shaded ASCII glyphs over a dim ASCII
// field that fills the whole panel. The critter's poses and eyes carry the
// emotion: focused, tired, waiting, surprised, proud, rested, angry, asleep.
//
// Each terminal cell samples the critter sprite (nearest pixel), takes the
// pixel's ramp tone plus a soft top-left light, and picks a glyph from the
// classic donut.c ramp; the color is the same hue-shifted ramp the pixel
// scenes use. Pure functions only, so it is all unit tested;
// AgentCompanion.tsx sizes the grid to the panel and paints it on a canvas.

import { blink, critterImage, hop, idleFrame, walkFrame, type CritterPose } from './companionScenes'
import { CRITTER_H, CRITTER_W } from './critterSprites'

/** What the agent is doing, derived from the tab's activity and process state. */
export type CompanionMood = 'working' | 'waiting' | 'attention' | 'done' | 'error' | 'sleeping'

/**
 * Color of a cell. `bg` is the dim background field, `r0`..`r4` and `line`
 * the critter's ramp in the agent color (as in the pixel scenes), `eye` the
 * glowing eye glint; the rest map to the theme's ANSI palette.
 */
export type CompanionColor =
  | 'bg' | 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'line' | 'eye'
  | 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta' | 'white'

export interface CompanionFrame {
  lines: string[]
  colors: CompanionColor[][]
}

/** Expression actually shown; a mood can move through several over time. */
export type CompanionExpression = 'focused' | 'tired' | 'waiting' | 'surprised' | 'proud' | 'rested' | 'angry' | 'asleep'

/** A tick is ~110 ms of animation time (fractional ticks are fine). Proud for ~8 s after finishing, tired after ~4 min of work. */
export const PROUD_TICKS = 70
export const TIRED_TICKS = 2200

/** The expression for a mood, `tick` frames after the mood began. */
export function companionExpression(mood: CompanionMood, tick: number): CompanionExpression {
  if (mood === 'working') return tick >= TIRED_TICKS ? 'tired' : 'focused'
  if (mood === 'waiting') return 'waiting'
  if (mood === 'attention') return 'surprised'
  if (mood === 'done') return tick < PROUD_TICKS ? 'proud' : 'rested'
  if (mood === 'error') return 'angry'
  return 'asleep'
}

/** Small deterministic hash: the same tick always draws the same frame. */
function hash(a: number, b = 0): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** The classic donut.c brightness ramp, dark to light. */
const RAMP = '.,-~:;=!*#$@'
const BG_RAMP = '      ..,-~'
const TONES: Record<string, number> = { r0: 0, r1: 1, r2: 2, r3: 3, r4: 4 }

function glyph(bright: number): string {
  return RAMP[Math.round(clamp01(bright) * (RAMP.length - 1))]
}

function reactsToInput(expression: CompanionExpression): boolean {
  return expression !== 'asleep' && expression !== 'angry'
}

/** The critter's pose for an expression, and how many sprite pixels it is off the ground. */
function poseFor(expression: CompanionExpression, t: number, listening: boolean): { pose: CritterPose; lift: number } {
  let result: { pose: CritterPose; lift: number }
  switch (expression) {
    case 'focused': {
      // Walking in place while it works, eyes scanning across a line.
      const look = [1, 1, 0, -1, 1, 1][Math.floor(t / 5) % 6]
      result = { pose: { frame: walkFrame(t), eyes: blink(t) ? 'closed' : 'open', look }, lift: 0 }
      break
    }
    case 'tired':
      // Slow, heavy breathing; the eyes keep falling shut.
      result = { pose: { frame: idleFrame(Math.floor(t / 2)), eyes: t % 40 < 16 ? 'closed' : 'open', look: 0 }, lift: 0 }
      break
    case 'waiting': {
      // Sits and looks toward the terminal on the left, glancing back now and then.
      const glance = Math.floor(t / 30) % 3 === 2
      result = { pose: { frame: 'sit', eyes: blink(t) ? 'closed' : 'open', look: glance ? 0 : -1 }, lift: 0 }
      break
    }
    case 'surprised': {
      const jump = hop(t, 12, 3)
      result = { pose: { frame: jump.frame, eyes: 'wide', look: 0 }, lift: jump.lift }
      break
    }
    case 'proud': {
      const jump = hop(t, 9, 4, 'cheer')
      result = { pose: { frame: jump.frame === 'crouch' ? 'crouch' : 'cheer', eyes: 'happy' }, lift: jump.lift }
      break
    }
    case 'rested':
      result = { pose: { frame: idleFrame(Math.floor(t / 2)), eyes: t % 53 < 2 ? 'closed' : 'open', look: 0 }, lift: 0 }
      break
    case 'angry':
      result = { pose: { frame: 'idle1', eyes: 'dead' }, lift: 0 }
      break
    case 'asleep':
      result = { pose: { frame: Math.floor(t / 8) % 2 ? 'sit' : 'land', eyes: 'closed' }, lift: 0 }
      break
  }
  // While you type into the agent's terminal it turns to listen.
  if (listening && reactsToInput(expression)) result.pose = { ...result.pose, eyes: blink(t) ? 'closed' : 'open', look: -1 }
  return result
}

/** Background flow speed per mood. */
const FLOW: Record<CompanionMood, number> = { working: 1, waiting: 0.45, attention: 1.2, done: 0.7, error: 1.6, sleeping: 0.12 }

const PARTY: CompanionColor[] = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta']

/**
 * The frame for `mood`, `tick` frames after the mood began, on a `cols` x
 * `rows` grid. `aspect` is a cell's height divided by its width; `listening`
 * is true while the user is typing into the agent's terminal.
 */
export function renderCompanion(mood: CompanionMood, tick: number, cols: number, rows: number, aspect = 1.75, listening = false): CompanionFrame {
  // Discrete steps (poses, blinks, glitches) use whole frames; the background
  // flow uses fractional time so it glides between steps.
  const time = Math.max(0, Number.isFinite(tick) ? tick : 0)
  const t = Math.floor(time)
  const w = Math.max(8, Math.floor(cols))
  const h = Math.max(6, Math.floor(rows))
  const ch = Array.from({ length: h }, () => Array.from({ length: w }, () => ' '))
  const color = Array.from({ length: h }, () => Array.from({ length: w }, (): CompanionColor => 'bg'))

  // World: y spans [-1, 1] over the panel height; x is scaled by the cell aspect.
  const cellH = 2 / h
  const cellW = cellH / aspect
  const halfW = (w * cellW) / 2
  const cx = (c: number): number => (c + 0.5 - w / 2) * cellW
  const cy = (r: number): number => (r + 0.5 - h / 2) * cellH
  const toCol = (x: number): number => Math.round(x / cellW + w / 2 - 0.5)
  const toRow = (y: number): number => Math.round(y / cellH + h / 2 - 0.5)
  const put = (r: number, c: number, text: string, tone: CompanionColor): void => {
    if (r < 0 || r >= h) return
    for (let i = 0; i < text.length; i++) {
      if (c + i < 0 || c + i >= w || text[i] === ' ') continue
      ch[r][c + i] = text[i]
      color[r][c + i] = tone
    }
  }

  const expression = companionExpression(mood, t)
  const { pose, lift } = poseFor(expression, t, listening)
  const image = critterImage(pose)

  // The critter fills most of the panel width (or height, if the panel is wide).
  const pixel = Math.min((halfW * 2 * 0.94) / CRITTER_W, 1.3 / CRITTER_H)
  const shake = mood === 'error' ? ((hash(t) % 3) - 1) * cellW : 0
  const groundY = 0.42
  const left = shake - (CRITTER_W * pixel) / 2
  const top = groundY - CRITTER_H * pixel - lift * pixel
  const spriteAt = (x: number, y: number): string | null => {
    const sx = Math.floor((x - left) / pixel)
    const sy = Math.floor((y - top) / pixel)
    if (sx < 0 || sy < 0 || sx >= CRITTER_W || sy >= CRITTER_H) return null
    return image[sy][sx]
  }
  // Its shadow shrinks while it is in the air.
  const shadowHalf = CRITTER_W * pixel * 0.36 * (1 - Math.min(0.6, lift / 8))

  const tf = time * FLOW[mood]
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const x = cx(c)
      const y = cy(r)
      const token = spriteAt(x, y)
      if (token === null) {
        if (Math.abs(y - (groundY + cellH * 0.5)) < cellH / 2 && Math.abs(x - shake) < shadowHalf) {
          ch[r][c] = Math.abs(x - shake) < shadowHalf * 0.6 ? '=' : '-'
          color[r][c] = 'r0'
          continue
        }
        // Background: a dim plasma flowing over the whole panel.
        const v = Math.sin(x * 7 + tf * 0.09) + Math.sin(y * 9 - tf * 0.07) + Math.sin((x + y) * 5 + tf * 0.05) + Math.sin(Math.hypot(x, y) * 11 - tf * 0.11)
        ch[r][c] = BG_RAMP[Math.min(BG_RAMP.length - 1, Math.floor(((v + 4) / 8) * BG_RAMP.length))]
        continue
      }
      if (token === 'ink') continue // eye: a dark hole in the body
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
      // Body: dense glyphs from the upper half of the ramp keep the figure
      // solid (the color already carries the tone); the tone and a soft
      // top-left light pick among them so it still reads as a rounded form.
      const tone = TONES[token] ?? 2
      const lx = (x - left) / (CRITTER_W * pixel) - 0.5
      const ly = (y - top) / (CRITTER_H * pixel) - 0.5
      const bright = 0.5 + tone * 0.11 - lx * 0.12 - ly * 0.12 + (((r * 7 + c * 13) % 5) - 2) * 0.012
      ch[r][c] = glyph(bright)
      color[r][c] = token as CompanionColor
    }
  }

  const headTop = toRow(top) - 1
  const headRight = toCol(left + CRITTER_W * pixel)
  const headCenter = toCol(shake)
  if (expression === 'proud') {
    // Sparkles pop around it.
    for (let k = 0; k < 12; k++) {
      const s = hash(Math.floor(t / 3), k)
      if (s % 3 === 0) continue
      const angle = (s % 360) * (Math.PI / 180)
      const radius = 0.55 + ((s >>> 9) % 25) / 100
      put(toRow(top + CRITTER_H * pixel * 0.5 + Math.sin(angle) * radius * 0.8), toCol(shake + Math.cos(angle) * radius), ['*', '+', '.', 'o'][(s >>> 4) % 4], PARTY[(s >>> 6) % PARTY.length])
    }
  } else if (expression === 'asleep') {
    for (let k = 0; k < 3; k++) {
      const phase = (Math.floor(t / 6) + k * 4) % 12
      put(headTop - Math.floor(phase / 2), Math.min(w - 1, headRight - 4 + Math.floor(phase / 2)), phase < 4 ? 'z' : 'Z', phase < 6 ? 'blue' : 'cyan')
    }
  } else if (expression === 'tired' && t % 60 >= 30) {
    // A sweat drop slides down beside it.
    const fall = (t % 60) - 30
    put(headTop + 2 + Math.floor(fall / 4), headRight, fall % 8 < 4 ? 'o' : '.', 'cyan')
  } else if (expression === 'surprised') {
    put(headTop - 1, headCenter, '!', t % 6 < 3 ? 'yellow' : 'white')
  } else if (expression === 'angry') {
    // Glitch: rows of the panel slip sideways and sparks flicker.
    const frame = Math.floor(t / 2)
    for (let r = 0; r < h; r++) {
      if (hash(frame, r) % 7 !== 0) continue
      const shift = (hash(frame, r + 50) % 5) - 2
      if (shift === 0) continue
      const slide = <T,>(row: T[], fill: T): T[] => shift > 0
        ? [...Array.from({ length: shift }, () => fill), ...row.slice(0, -shift)]
        : [...row.slice(-shift), ...Array.from({ length: -shift }, () => fill)]
      ch[r] = slide(ch[r], ' ')
      color[r] = slide<CompanionColor>(color[r], 'bg')
    }
    for (let k = 0; k < 6; k++) {
      const s = hash(frame, k + 100)
      put(s % h, (s >>> 8) % w, ['#', '%', '&', '!', '/', '|'][(s >>> 16) % 6], k % 2 ? 'red' : 'magenta')
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

const SPINNER = ['.', '+', '*', '#', '*', '+']
const WORK_VERBS = ['Thinking', 'Pondering', 'Tinkering', 'Crafting', 'Wrangling', 'Brewing', 'Untangling', 'Cooking']

export const COMPANION_CAPTIONS: Record<CompanionExpression, string> = {
  focused: 'Working',
  tired: 'Still working...',
  waiting: 'Waiting for you',
  surprised: 'New output',
  proud: 'Done!',
  rested: 'All done',
  angry: 'Something failed',
  asleep: 'Session ended'
}

/** Caption under the critter; while focused it spins and rotates its verb. */
export function companionCaption(mood: CompanionMood, tick: number, listening = false): string {
  const t = Math.max(0, Math.floor(tick))
  const expression = companionExpression(mood, t)
  if (listening && reactsToInput(expression)) return 'Listening...'
  if (expression !== 'focused') return COMPANION_CAPTIONS[expression]
  return `${SPINNER[Math.floor(t / 2) % SPINNER.length]} ${WORK_VERBS[Math.floor(t / 40) % WORK_VERBS.length]}...`
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

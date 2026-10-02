// Agent companion: one ASCII character that fills the whole side panel. A
// shaded head (in the agent's own color) with a dark screen-face and two
// glowing eyes that carry the emotion: focused, tired, waiting, surprised,
// proud, rested, angry, asleep. Behind it the entire panel is a dim, slowly
// flowing ASCII field, so every cell of the panel is part of the animation.
//
// Everything is a signed-distance-field scene sampled once per terminal cell;
// brightness picks a glyph from the classic donut.c ramp. Pure functions only,
// so it is all unit tested; AgentCompanion.tsx sizes the grid to the panel and
// repaints a <pre> on a timer.

/** What the agent is doing, derived from the tab's activity and process state. */
export type CompanionMood = 'working' | 'waiting' | 'attention' | 'done' | 'error' | 'sleeping'

/**
 * Color of a cell. `bg` is the dim background field, `v` the dark screen-face,
 * `b0`..`b4` dark-to-light steps of the agent color, `glow` its glowing tint
 * and `eye` the white-hot eye core; the rest map to the theme's ANSI palette.
 */
export type CompanionColor =
  | 'bg' | 'v' | 'b0' | 'b1' | 'b2' | 'b3' | 'b4' | 'glow' | 'eye'
  | 'red' | 'yellow' | 'green' | 'cyan' | 'blue' | 'magenta' | 'white'

export interface CompanionFrame {
  lines: string[]
  colors: CompanionColor[][]
}

/** Expression actually shown; a mood can move through several over time. */
export type CompanionExpression = 'focused' | 'tired' | 'waiting' | 'surprised' | 'proud' | 'rested' | 'angry' | 'asleep'

/** Ticks are ~110 ms. Proud for ~8 s after finishing, tired after ~4 min of work. */
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

/** Rounded box signed distance (negative = inside). */
function rbox(x: number, y: number, cx: number, cy: number, hx: number, hy: number, r: number): number {
  const qx = Math.abs(x - cx) - hx + r
  const qy = Math.abs(y - cy) - hy + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** Distance to a segment, minus half its thickness. */
function segment(x: number, y: number, ax: number, ay: number, bx: number, by: number, half: number): number {
  const dx = bx - ax
  const dy = by - ay
  const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - ax - dx * k, y - ay - dy * k) - half
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

/** The classic donut.c brightness ramp, dark to light. */
const RAMP = '.,-~:;=!*#$@'
const BG_RAMP = '      ..,-~'
const STEPS: CompanionColor[] = ['b0', 'b1', 'b2', 'b3', 'b4']

function glyph(bright: number): string {
  return RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round(bright * (RAMP.length - 1))))]
}

// ---- Face description per expression ----

interface Face {
  /** Eye shape: open ellipse with an upper lid, happy arc or closed curve. */
  eye: 'open' | 'arc' | 'closed'
  /** Upper lid level in eye units (-1 = fully open, 1 = shut) and its tilt toward the nose. */
  lid: number
  lidTilt: number
  /** Eye size multiplier and gaze offset (eye units). */
  scale: number
  lookX: number
  lookY: number
  /** Brows: height above the eye and tilt (+ = inner end down = angry). */
  brows: { lift: number; tilt: number } | null
  mouth: 'line' | 'smile' | 'frown' | 'o' | 'wave' | 'none'
}

/** Lid level during a blink every `every` frames (-2 = no blink). */
function blinkLid(t: number, every: number): number {
  const phase = t % every
  return phase === 1 ? 1 : phase === 0 || phase === 2 ? 0.2 : -2
}

function faceFor(expression: CompanionExpression, t: number): Face {
  const base: Face = { eye: 'open', lid: -2, lidTilt: 0, scale: 1, lookX: 0, lookY: 0, brows: null, mouth: 'line' }
  switch (expression) {
    case 'focused': {
      // Reading: the gaze steps across a line, then jumps back to the next one.
      const step = Math.floor(t / 3) % 8
      return { ...base, lid: Math.max(-0.45, blinkLid(t, 41)), lookX: -0.45 + step * 0.13, lookY: -0.1 + (Math.floor(t / 24) % 3) * 0.1, brows: { lift: 0.25, tilt: 0.12 } }
    }
    case 'tired':
      // Heavy lids droop and slowly fight back open.
      return { ...base, lid: Math.max(0.05 + 0.25 * Math.max(0, Math.sin(t * 0.07)), blinkLid(t, 23)), lookY: 0.25, brows: { lift: 0.3, tilt: -0.25 }, mouth: 'wave' }
    case 'waiting': {
      // Looks toward the terminal on the left, now and then back at you.
      const away = Math.floor(t / 30) % 3 !== 2
      return { ...base, lid: blinkLid(t, 37), lookX: away ? -0.4 : 0, lookY: away ? 0.05 : 0, brows: { lift: 0.4, tilt: 0 } }
    }
    case 'surprised':
      return { ...base, scale: 1.18 + 0.05 * Math.sin(t * 0.6), brows: { lift: 0.75, tilt: -0.1 }, mouth: 'o' }
    case 'proud':
      return { ...base, eye: 'arc', brows: { lift: 0.55, tilt: -0.05 }, mouth: 'smile' }
    case 'rested':
      return { ...base, lid: Math.max(-0.2, blinkLid(t, 53)), mouth: 'smile' }
    case 'angry':
      return { ...base, lid: -0.15, lidTilt: 0.55, scale: 0.95, brows: { lift: 0.18, tilt: 0.55 }, mouth: 'frown' }
    case 'asleep':
      return { ...base, eye: 'closed', mouth: 'none' }
  }
}

// ---- Rendering ----

/** Background flow speed per mood. */
const FLOW: Record<CompanionMood, number> = { working: 1, waiting: 0.45, attention: 1.2, done: 0.7, error: 1.6, sleeping: 0.12 }

const PARTY: CompanionColor[] = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta']

// Light comes from the top-left and slightly in front (unit vector).
const LIGHT = [-0.43, -0.58, 0.69]

/**
 * The frame for `mood`, `tick` frames after the mood began, on a `cols` x
 * `rows` grid. `aspect` is a cell's height divided by its width.
 */
export function renderCompanion(mood: CompanionMood, tick: number, cols: number, rows: number, aspect = 1.75): CompanionFrame {
  const t = Math.max(0, Math.floor(tick))
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
  const face = faceFor(expression, t)

  // Head geometry, sized to the panel.
  const hx = Math.min(halfW * 0.86, 0.82)
  const hy = Math.min(0.6, hx * 0.86)
  const bob = mood === 'sleeping' ? Math.sin(t * 0.1) * 0.015
    : expression === 'proud' ? -Math.abs(Math.sin(t * 0.3)) * 0.06
      : Math.sin(t * 0.12) * 0.012
  const hcx = mood === 'error' ? ((hash(t) % 3) - 1) * cellW : 0
  const hcy = -0.08 + bob
  const head = (x: number, y: number): number => rbox(x, y, hcx, hcy, hx, hy, hy * 0.55)
  const bevel = hy * 0.4
  const relief = (d: number): number => d >= 0 ? 0 : d <= -bevel ? bevel : Math.sqrt(bevel * bevel - (bevel + d) * (bevel + d))
  const vx = hx * 0.8
  const vy = hy * 0.66
  const visor = (x: number, y: number): number => rbox(x, y, hcx, hcy + hy * 0.02, vx, vy, vy * 0.45)

  // Eyes.
  const erx = hx * 0.17 * face.scale
  const ery = hy * 0.25 * face.scale
  const eyeY = hcy - hy * 0.1
  const eyes = [-1, 1].map((side) => ({ side, x: hcx + side * hx * 0.36 + face.lookX * erx * 0.6, y: eyeY + face.lookY * ery * 0.6 }))
  /** Signed eye field in eye units: negative = lit. */
  const eyeField = (x: number, y: number): number => {
    let best = Infinity
    for (const eye of eyes) {
      const qx = (x - eye.x) / erx
      const qy = (y - eye.y) / ery
      let d: number
      if (face.eye === 'arc') {
        // Smiling eyes: the upper half of a ring.
        d = Math.abs(Math.hypot(qx, qy + 0.35) - 0.75) - 0.28
        if (qy > -0.05) d = Math.max(d, qy + 0.05)
      } else if (face.eye === 'closed') {
        // A soft downward curve.
        d = Math.max(Math.abs(qy - 0.15 - 0.35 * qx * qx) - 0.16, Math.abs(qx) - 1)
      } else {
        // Open eye cut by the upper lid; anger tilts the lid toward the nose.
        const lidAt = face.lid + face.lidTilt * qx * -eye.side
        d = Math.max(Math.hypot(qx, qy) - 1, lidAt - qy)
      }
      best = Math.min(best, d)
    }
    return best
  }

  // Brows and mouth as glowing strokes.
  const my = hcy + vy * 0.62
  const mw = hx * 0.2
  const strokes = (x: number, y: number): number => {
    let d = Infinity
    if (face.brows) {
      for (const eye of eyes) {
        const by = eye.y - ery * (1.35 + face.brows.lift)
        d = Math.min(d, segment(x, y, eye.x - eye.side * erx, by + face.brows.tilt * ery, eye.x + eye.side * erx * 1.1, by - face.brows.tilt * ery * 0.4, ery * 0.13))
      }
    }
    if (face.mouth === 'line') {
      d = Math.min(d, segment(x, y, hcx - mw * 0.6, my, hcx + mw * 0.6, my, ery * 0.1))
    } else if (face.mouth === 'smile' || face.mouth === 'frown' || face.mouth === 'wave') {
      const dx = (x - hcx) / mw
      if (Math.abs(dx) <= 1) {
        const curve = face.mouth === 'smile' ? -0.5 * (1 - dx * dx) : face.mouth === 'frown' ? 0.5 * (1 - dx * dx) : 0.12 * Math.sin(dx * 6 + t * 0.2)
        d = Math.min(d, Math.abs(y - (my + curve * ery)) - ery * 0.11)
      }
    } else if (face.mouth === 'o') {
      d = Math.min(d, (Math.abs(Math.hypot((x - hcx) / (mw * 0.35), (y - my) / (ery * 0.45)) - 1) - 0.3) * ery * 0.4)
    }
    return d
  }

  const tf = t * FLOW[mood]
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const x = cx(c)
      const y = cy(r)
      const dHead = head(x, y)
      if (dHead >= 0) {
        // Background: a dim plasma flowing over the whole panel, tinted with
        // the agent color right around the head.
        const v = Math.sin(x * 7 + tf * 0.09) + Math.sin(y * 9 - tf * 0.07) + Math.sin((x + y) * 5 + tf * 0.05) + Math.sin(Math.hypot(x, y) * 11 - tf * 0.11)
        ch[r][c] = BG_RAMP[Math.min(BG_RAMP.length - 1, Math.floor(((v + 4) / 8) * BG_RAMP.length))]
        color[r][c] = dHead < 0.06 ? 'b0' : 'bg'
        continue
      }
      const dVisor = visor(x, y)
      if (dVisor < 0) {
        // Dark screen-face: eyes, brows and mouth glow on it.
        const de = eyeField(x, y)
        const ds = strokes(x, y)
        if (de < 0) {
          const core = clamp01(-de * 2.2)
          ch[r][c] = glyph(0.72 + 0.28 * core)
          color[r][c] = core > 0.55 ? 'eye' : 'glow'
        } else if (ds < 0) {
          ch[r][c] = glyph(0.78)
          color[r][c] = 'glow'
        } else if (de < 0.45) {
          // Glow spilling onto the screen around the eyes.
          ch[r][c] = glyph(0.25 + 0.3 * (1 - de / 0.45))
          color[r][c] = 'b2'
        } else {
          // Faint scanlines rolling down the screen.
          ch[r][c] = (r + Math.floor(t / 3)) % 3 === 0 ? '.' : ' '
          color[r][c] = 'v'
        }
        continue
      }
      // Head shell: a puffy relief lit from the top-left; the visor rim is a groove.
      const e = cellW * 0.6
      const nx = -(relief(head(x + e, y)) - relief(head(x - e, y))) / (2 * e)
      const ny = -(relief(head(x, y + e)) - relief(head(x, y - e))) / (2 * e)
      const groove = dVisor < cellH * 0.9 ? 0.55 : 1
      const lambert = Math.max(0, (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / Math.hypot(nx, ny, 1)) * groove
      const bright = clamp01(0.05 + 0.95 * lambert + (((r * 7 + c * 13) % 5) - 2) * 0.012)
      ch[r][c] = glyph(bright)
      color[r][c] = STEPS[Math.min(4, Math.floor(bright * 5))]
    }
  }

  const top = toRow(hcy - hy)
  const right = toCol(hcx + hx)
  if (expression === 'proud') {
    // Sparkles pop around the head.
    for (let k = 0; k < 10; k++) {
      const s = hash(Math.floor(t / 3), k)
      if (s % 3 === 0) continue
      const angle = (s % 360) * (Math.PI / 180)
      const radius = 1.08 + ((s >>> 9) % 20) / 100
      put(toRow(hcy + Math.sin(angle) * hy * radius), toCol(hcx + Math.cos(angle) * hx * radius), ['*', '+', '.', 'o'][(s >>> 4) % 4], PARTY[(s >>> 6) % PARTY.length])
    }
  } else if (expression === 'asleep') {
    for (let k = 0; k < 3; k++) {
      const phase = (Math.floor(t / 6) + k * 4) % 12
      put(top - 1 - Math.floor(phase / 2), Math.min(w - 1, right - 2 + Math.floor(phase / 2)), phase < 4 ? 'z' : 'Z', phase < 6 ? 'blue' : 'cyan')
    }
  } else if (expression === 'tired' && t % 60 >= 30) {
    // A sweat drop slides down the side of the head.
    const fall = (t % 60) - 30
    put(top + 1 + Math.floor(fall / 4), right - 1, fall % 8 < 4 ? 'o' : '.', 'cyan')
  } else if (expression === 'surprised') {
    put(top - 2, toCol(hcx), '!', t % 6 < 3 ? 'yellow' : 'white')
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

/** Caption under the face; while focused it spins and rotates its verb. */
export function companionCaption(mood: CompanionMood, tick: number): string {
  const t = Math.max(0, Math.floor(tick))
  const expression = companionExpression(mood, t)
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

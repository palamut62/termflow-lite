// Agent scenes: a little pixel-art critter (in the agent's own color) acting
// out what the agent is really doing — typing at a keyboard while it edits,
// watching a terminal while a command runs, erupting a volcano while tests
// run, digging while it reads and searches, thinking under a light bulb —
// with a short line about it in a speech bubble.
//
// The work comes from the agent's own tool lines (fun/agentActivity.ts); no
// LLM involved, so it is free, instant and works offline. Both animation
// styles use these scenes: the pixel style paints them as is, the ASCII style
// turns them into glyphs. Everything here is pure and unit tested.

import type { CompanionMood } from './companionFrames'
import { activityLine, type AgentActivity } from '../fun/agentActivity'
import { CRITTER, CRITTER_W, CRITTER_H } from './critterSprites'

export type SceneId = 'typing' | 'terminal' | 'volcano' | 'digging' | 'thinking' | 'waiting' | 'approval' | 'mail' | 'party' | 'storm' | 'night'

/** Scenes that act out a piece of work; their bubble says what it is. */
const WORK_SCENES: ReadonlySet<SceneId> = new Set(['typing', 'terminal', 'volcano', 'digging', 'thinking'])

/** The latest agent event, as far as the scene cares. */
export interface SceneEvent {
  kind?: string
  title?: string
  detail?: string
}

/** Palette tokens; `body*` are tones of the agent's color, resolved by the component. */
export type PixelColor =
  | 'body' | 'bodyHi' | 'bodyLo' | 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'line' | 'ink' | 'white'
  | 'sky0' | 'sky1' | 'sky2' | 'hill' | 'hill2' | 'puff' | 'skyStorm' | 'flash' | 'star' | 'moon'
  | 'grass' | 'grass2' | 'dirt' | 'dirt2' | 'pit'
  | 'rock' | 'rockHi' | 'lava' | 'lava2' | 'smoke'
  | 'wood' | 'metal' | 'screen' | 'key' | 'keyDark'
  | 'paper' | 'cloud' | 'rain' | 'bolt'
  | 'red' | 'gold' | 'green' | 'blue' | 'pink' | 'cyan'

/** Tokens recolored per agent at runtime (see critterRamp). */
export type AgentTone = 'body' | 'bodyHi' | 'bodyLo' | 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'line'

/** Fixed colors for everything except the agent's own tones. */
export const PIXEL_PALETTE: Record<Exclude<PixelColor, AgentTone>, string> = {
  ink: '#16161c', white: '#f4f4f4',
  sky0: '#0b1020', sky1: '#131c33', sky2: '#1d2a48', hill: '#16263a', hill2: '#1c3148', puff: '#2a3a5c', skyStorm: '#1b1d24', flash: '#3a3f52', star: '#c9d4ff', moon: '#f2e8b0',
  grass: '#46a854', grass2: '#2f7d3c', dirt: '#6b4428', dirt2: '#4d2f1b', pit: '#24150b',
  rock: '#5c5a66', rockHi: '#7d7b88', lava: '#ff6a1f', lava2: '#ffc23d', smoke: '#7c7c86',
  wood: '#8b5a2b', metal: '#a3adbb', screen: '#0c1612', key: '#c9ccd4', keyDark: '#4a4f5c',
  paper: '#e9e3d1', cloud: '#5e6573', rain: '#6aa7e8', bolt: '#ffe14d',
  red: '#e5484d', gold: '#f2c94c', green: '#3dd68c', blue: '#4f8cff', pink: '#e879f9', cyan: '#3fc8e0'
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return [((h * 60) + 360) % 360, max ? d / max : 0, max]
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return '#' + [r, g, b].map((k) => Math.round((k + m) * 255).toString(16).padStart(2, '0')).join('')
}

/** Rotates hue `deg` by up to `amount` degrees toward `target` along the short way. */
function toward(deg: number, target: number, amount: number): number {
  const diff = ((target - deg + 540) % 360) - 180
  return (deg + Math.sign(diff) * Math.min(Math.abs(diff), amount) + 360) % 360
}

/**
 * The critter's 5-step shading ramp (dark -> light) for an agent color, plus
 * its outline. A port of ramp() from pixel-art-studio (MIT, github.com/Gamezxz/pixel-art-studio): shadows rotate toward
 * blue, highlights toward yellow, saturation peaks at the midtone, and the
 * middle step is the agent color itself.
 */
export function critterRamp(rgb: [number, number, number], hueShift = 14, dark = 0.4, light = 0.8): { ramp: string[]; line: string } {
  const [h, s, v] = rgbToHsv(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
  const vDark = Math.max(0.06, v * (1 - dark))
  const vLight = Math.min(1, v + (1 - v) * light)
  const ramp = [0, 1, 2, 3, 4].map((i) => {
    const t = i / 4
    const vv = vDark + (vLight - vDark) * t
    const hh = t < 0.5 ? toward(h, 240, (0.5 - t) * 2 * hueShift) : toward(h, 60, (t - 0.5) * 2 * hueShift)
    const ss = t < 0.5 ? Math.min(1, s * (1 + 0.25 * (0.5 - t) * 2)) : s * (1 - 0.45 * (t - 0.5) * 2)
    return hsvToHex(hh, Math.max(0, ss), Math.max(0, Math.min(1, vv)))
  })
  ramp[2] = '#' + rgb.map((k) => Math.round(k).toString(16).padStart(2, '0')).join('')
  // Outline: the darkest step, pushed further toward blue and almost black.
  const line = hsvToHex(toward(h, 240, hueShift * 1.5), Math.min(1, s * 0.7), Math.max(0.08, vDark * 0.32))
  return { ramp, line }
}

/** Text drawn over the pixels by the component. Positions are in scene pixels. */
export interface SceneText {
  kind: 'bubble' | 'label' | 'float'
  x: number
  y: number
  text: string
  color?: PixelColor
}

export interface PixelFrame {
  width: number
  height: number
  /** Row of the ground line the critter stands on. */
  groundY: number
  /** Row-major, `null` = transparent (never left after a full scene). */
  pixels: (PixelColor | null)[]
  texts: SceneText[]
}

/**
 * Which scene fits the agent's state and what it is doing. While it works,
 * the scene follows its real action (from its tool lines); with no action
 * shown yet, it is thinking.
 */
export function sceneFor(mood: CompanionMood, event?: SceneEvent, activity?: AgentActivity | null): SceneId {
  if (mood === 'sleeping') return 'night'
  if (mood === 'error') return 'storm'
  if (mood === 'done') return 'party'
  if (mood === 'attention') return 'mail'
  if (mood === 'waiting') return event?.kind === 'approval' ? 'approval' : 'waiting'
  switch (activity?.kind) {
    case 'edit':
    case 'write':
      return 'typing'
    case 'run':
      return 'terminal'
    case 'test':
      return 'volcano'
    case 'read':
    case 'search':
      return 'digging'
    default:
      return 'thinking'
  }
}

/** Lines for the scenes that are about you or the session, not the work. */
const LINES: Partial<Record<SceneId, string[]>> = {
  waiting: ['Your turn!', 'Waiting for your answer.', 'I will be right here.'],
  approval: ['Need your OK to continue.', 'Permission, please?', 'Holding the gate until you say so.'],
  mail: ['New output arrived!', 'Something new to look at.'],
  party: ['Done! Nailed it.', 'All finished. Flag planted.', 'Mission complete.'],
  storm: ['Uh-oh. Something broke.', 'Storm in the logs.', 'That did not go as planned.'],
  night: ['Session ended. Sweet dreams.', 'Resting until next time.']
}

/**
 * The speech bubble line. Work scenes say what the agent is doing
 * ("Editing app.ts", now and then a quip); the others rotate their own lines.
 */
export function sceneLine(scene: SceneId, tick: number, activity?: AgentActivity | null, now?: number): string {
  if (WORK_SCENES.has(scene)) return activityLine(activity ?? null, tick, now)
  const lines = LINES[scene] ?? ['']
  return lines[Math.floor(Math.max(0, tick) / 70) % lines.length]
}

/** Small deterministic hash: the same tick always draws the same frame. */
function hash(a: number, b = 0): number {
  let h = (a * 374761393 + b * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return (h ^ (h >>> 16)) >>> 0
}

// ---- Pixel canvas ----

class Pixels {
  readonly width: number
  readonly height: number
  readonly data: (PixelColor | null)[]
  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.data = new Array(width * height).fill(null)
  }

  set(x: number, y: number, color: PixelColor | null): void {
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= this.width || py >= this.height) return
    this.data[py * this.width + px] = color
  }

  rect(x: number, y: number, w: number, h: number, color: PixelColor): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, color)
  }

  circle(cx: number, cy: number, r: number, color: PixelColor | null): void {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) {
      for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, color)
    }
  }

  /** Draws a sprite: each char maps to a color, '.' is transparent. */
  sprite(x: number, y: number, rows: string[], colors: Record<string, PixelColor>, flip = false): void {
    rows.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const color = colors[row[i]]
        if (color) this.set(x + (flip ? row.length - 1 - i : i), y + j, color)
      }
    })
  }
}

// ---- The critter ----
// Drawn with the pixel-art-studio skill: art/critter/build.py generates the
// index-mapped poses in critterSprites.ts. Ramp tokens are recolored with the
// agent's own color at runtime; eyes are drawn here so any pose shows any mood.

export type CritterPoseName = keyof typeof CRITTER

export interface CritterPose {
  frame: CritterPoseName
  eyes?: 'open' | 'closed' | 'happy' | 'dead' | 'wide'
  /** Where the eyes look: -1 left .. 1 right (the glint follows). */
  look?: number
}

const SPRITE_COLORS: Record<string, PixelColor> = { o: 'line', '0': 'r0', '1': 'r1', '2': 'r2', '3': 'r3', '4': 'r4' }

/**
 * The critter in one pose with its eyes, as a CRITTER_W x CRITTER_H grid of
 * palette tokens (null = transparent). Shared by both animation styles: the
 * pixel scenes blit it, the ASCII style turns it into shaded glyphs.
 */
export function critterImage(pose: CritterPose): (PixelColor | null)[][] {
  const px = new Pixels(CRITTER_W, CRITTER_H)
  critter(px, 0, 0, pose)
  return Array.from({ length: CRITTER_H }, (_, y) => px.data.slice(y * CRITTER_W, (y + 1) * CRITTER_W))
}

/** Draws the critter with its sprite's top-left corner at (x, y). */
function critter(px: Pixels, x: number, y: number, pose: CritterPose): void {
  const sprite = CRITTER[pose.frame]
  px.sprite(x, y, sprite.rows, SPRITE_COLORS)
  const [ex0, ey] = sprite.eyes
  const look = Math.max(-1, Math.min(1, Math.round(pose.look ?? 0)))
  for (const eyeX of [x + ex0, x + ex0 + sprite.eyeGap]) {
    const top = y + ey
    // Looking left or right moves the open eyes a pixel that way.
    const ex = eyeX + look
    switch (pose.eyes ?? 'open') {
      case 'open':
        px.rect(ex, top, 2, 3, 'ink')
        px.set(ex + (look > 0 ? 1 : 0), top, 'white')
        break
      case 'wide':
        px.rect(ex, top - 1, 2, 4, 'ink')
        px.set(ex + (look > 0 ? 1 : 0), top - 1, 'white')
        break
      case 'closed':
        px.rect(ex, top + 2, 2, 1, 'ink')
        break
      case 'happy':
        // A little upside-down U: smiling, squeezed-shut eyes.
        px.rect(ex, top + 1, 2, 1, 'ink')
        px.set(ex - 1, top + 2, 'ink')
        px.set(ex + 2, top + 2, 'ink')
        break
      case 'dead':
        px.set(ex - 1, top, 'ink'); px.set(ex + 1, top, 'ink'); px.set(ex, top + 1, 'ink')
        px.set(ex - 1, top + 2, 'ink'); px.set(ex + 1, top + 2, 'ink')
        break
    }
  }
}

/** Walk cycle at ~140 ms per frame (contact - passing - contact - passing). */
export function walkFrame(t: number): CritterPoseName {
  return (['walk0', 'walk1', 'walk2', 'walk3'] as const)[Math.floor((t * 110) / 140) % 4]
}

/** Idle breathing, ping-pong at ~330 ms. */
export function idleFrame(t: number): CritterPoseName {
  return Math.floor(t / 3) % 2 ? 'idle1' : 'idle0'
}

/**
 * A hop with anticipation: crouch, launch into the air, land with a squash,
 * then rest. Returns the pose and how high the body is off the ground.
 */
export function hop(t: number, period: number, height: number, airPose: CritterPoseName = 'air'): { frame: CritterPoseName; lift: number } {
  const p = t % period
  if (p < 2) return { frame: 'crouch', lift: 0 }
  if (p < 6) return { frame: airPose, lift: Math.round(Math.sin(((p - 2) / 4) * Math.PI) * height) }
  if (p < 7) return { frame: 'land', lift: 0 }
  return { frame: idleFrame(t), lift: 0 }
}

export function blink(t: number): boolean {
  return t % 37 < 2
}

// ---- Backdrops ----

function sky(px: Pixels, groundY: number, t: number, kind: 'day' | 'night' | 'storm', flash = false): void {
  for (let y = 0; y < groundY; y++) {
    const band = y / groundY
    const color: PixelColor = kind === 'storm' ? (flash ? 'flash' : 'skyStorm') : band < 0.35 ? 'sky0' : band < 0.7 ? 'sky1' : 'sky2'
    px.rect(0, y, px.width, 1, color)
  }
  if (kind !== 'storm') {
    // Stars, twinkling; more of them at night.
    const count = kind === 'night' ? 30 : 12
    for (let k = 0; k < count; k++) {
      const h = hash(k, 17)
      if ((t + k * 7) % 41 < 3) continue
      px.set(h % px.width, (h >>> 8) % Math.max(1, Math.floor(groundY * 0.6)), 'star')
    }
    // Slow clouds drifting across.
    for (let k = 0; k < 3; k++) {
      const y = 4 + (hash(k, 23) % Math.max(1, Math.floor(groundY * 0.45)))
      const x = ((hash(k, 29) % px.width) + t * (0.08 + k * 0.03)) % (px.width + 16) - 8
      px.rect(x, y, 9, 1, 'puff')
      px.rect(x + 2, y - 1, 5, 1, 'puff')
    }
  }
  // Distant hills along the horizon.
  for (let x = 0; x < px.width; x++) {
    const far = Math.round(3 + 2 * Math.sin(x * 0.11) + Math.sin(x * 0.27 + 1))
    const near = Math.round(2 + 1.5 * Math.sin(x * 0.17 + 2))
    for (let y = groundY - far; y < groundY; y++) px.set(x, y, 'hill')
    for (let y = groundY - near; y < groundY; y++) px.set(x, y, 'hill2')
  }
}

function ground(px: Pixels, groundY: number): void {
  px.rect(0, groundY, px.width, 1, 'grass')
  px.rect(0, groundY + 1, px.width, 1, 'grass2')
  for (let y = groundY + 2; y < px.height; y++) {
    // Darker the deeper it goes.
    const deep = (y - groundY) / Math.max(1, px.height - groundY)
    for (let x = 0; x < px.width; x++) px.set(x, y, hash(x, y) % (deep > 0.5 ? 4 : 9) === 0 ? 'dirt2' : 'dirt')
  }
  // Buried stones and a few roots.
  for (let k = 0; k < 8; k++) {
    const h = hash(k, 31)
    const x = h % px.width
    const y = groundY + 4 + ((h >>> 8) % Math.max(1, px.height - groundY - 6))
    px.rect(x, y, 2 + (h % 3), 2, k % 2 ? 'rock' : 'rockHi')
  }
  for (let k = 0; k < 4; k++) {
    const h = hash(k, 37)
    let x = h % px.width
    for (let y = groundY + 2; y < groundY + 6 + (h % 4); y++) { px.set(x, y, 'wood'); x += (hash(y, k) % 3) - 1 }
  }
}

// ---- Scenes ----

interface Stage {
  px: Pixels
  t: number
  groundY: number
  /** Critter's top-left corner. */
  cx: number
  cy: number
  texts: SceneText[]
  activity: AgentActivity | null
  /**
   * Draw sky and ground. Off for the ASCII style, which keeps only the
   * critter and its props and fills the rest with its own ASCII field.
   */
  backdrop: boolean
}

function setting(s: Stage, kind: 'day' | 'night' | 'storm', flash = false): void {
  if (!s.backdrop) return
  sky(s.px, s.groundY, s.t, kind, flash)
  ground(s.px, s.groundY)
}

/** Label under a prop: the file or command the agent is working on. */
function label(s: Stage, x: number, fallback: string): void {
  s.texts.push({ kind: 'label', x, y: s.groundY + 3, text: s.activity?.target || fallback, color: 'gold' })
}

const CODE_COLORS: PixelColor[] = ['green', 'cyan', 'pink', 'gold', 'blue']

/**
 * A desk with a monitor (and a keyboard in front of the critter). `typing`
 * fills the screen with code line by line; otherwise it shows a prompt and
 * command output scrolling past.
 */
function workstation(s: Stage, typing: boolean): void {
  const { px, t, groundY } = s
  const deskTop = groundY - 6
  const deskX = s.cx + CRITTER_W - 6
  const deskW = Math.max(18, px.width - deskX - 1)
  px.rect(deskX, deskTop, deskW, 2, 'wood')
  px.rect(deskX + 1, deskTop + 2, 1, groundY - deskTop - 2, 'wood')
  px.rect(deskX + deskW - 2, deskTop + 2, 1, groundY - deskTop - 2, 'wood')
  // Monitor on the desk.
  const mw = Math.min(16, deskW - 4)
  const mh = 11
  const mx = deskX + deskW - mw - 2
  const my = deskTop - mh - 2
  px.rect(mx, my, mw, mh, 'metal')
  px.rect(mx + 1, my + 1, mw - 2, mh - 2, 'screen')
  px.rect(mx + Math.floor(mw / 2) - 1, my + mh, 3, 2, 'metal')
  const lines = mh - 3
  const width = mw - 4
  if (typing) {
    // Code appears line by line, then the screen scrolls on.
    const written = Math.floor(t / 3) % (lines * 2)
    const shown = Math.min(lines, written)
    for (let row = 0; row < shown; row++) {
      const n = Math.floor(t / (3 * lines * 2)) * lines + row
      const indent = (hash(n, 1) % 3) * 2
      const len = Math.min(width - indent, 3 + (hash(n, 2) % (width - 2)))
      px.rect(mx + 2 + indent, my + 2 + row, len, 1, CODE_COLORS[hash(n, 3) % CODE_COLORS.length])
    }
    if (shown < lines && t % 4 < 2) px.set(mx + 2, my + 2 + shown, 'white')
    // Keyboard in front of the critter; the key being hit flashes.
    const kx = s.cx + CRITTER_W - 8
    px.rect(kx, deskTop - 1, 11, 1, 'keyDark')
    for (let k = 0; k < 5; k++) px.set(kx + 1 + k * 2, deskTop - 1, 'key')
    px.set(kx + 1 + (hash(t, 7) % 5) * 2, deskTop - 1, 'gold')
  } else {
    // A prompt, then output scrolling up quickly.
    for (let row = 0; row < lines; row++) {
      const n = Math.floor(t / 2) + row
      if (row === 0) {
        px.rect(mx + 2, my + 2, 1, 1, 'green')
        px.rect(mx + 4, my + 2, Math.min(width - 3, 6), 1, 'white')
        continue
      }
      px.rect(mx + 2, my + 2 + row, Math.max(2, (hash(n, 4) % width)), 1, hash(n, 5) % 5 === 0 ? 'gold' : 'green')
    }
  }
  label(s, mx + mw / 2, typing ? 'code' : 'command')
}

function typingScene(s: Stage): void {
  setting(s, 'day')
  workstation(s, true)
  // Focused: types with little bobs, eyes on the screen.
  const { t } = s
  critter(s.px, s.cx, s.cy, { frame: t % 2 ? 'idle1' : 'idle0', eyes: blink(t) ? 'closed' : 'open', look: 1 })
}

function terminalScene(s: Stage): void {
  setting(s, 'day')
  workstation(s, false)
  // Watches the output roll by; perks up when something stands out.
  const { t } = s
  const perk = t % 18 < 3
  critter(s.px, s.cx, s.cy - (perk ? 1 : 0), { frame: perk ? 'cheer' : idleFrame(t), eyes: perk ? 'wide' : blink(t) ? 'closed' : 'open', look: 1 })
}

function volcano(s: Stage): void {
  const { px, t, groundY } = s
  setting(s, 'day')
  const vx = Math.round(px.width * 0.7)
  const height = Math.min(16, Math.round(groundY * 0.45))
  const top = groundY - height
  for (let dy = 0; dy <= height; dy++) {
    const half = 2 + Math.round(dy * 0.8)
    for (let x = vx - half; x <= vx + half; x++) px.set(x, top + dy, x < vx ? 'rockHi' : 'rock')
  }
  px.rect(vx - 2, top, 5, 1, 'lava')
  // Lava trickling down both flanks.
  for (let dy = 1; dy <= height; dy++) {
    if ((dy + t) % 6 < 3) {
      const half = 2 + Math.round(dy * 0.8)
      px.set(vx - half + 1, top + dy, 'lava')
      if (dy > 3) px.set(vx + half - 2, top + dy, 'lava2')
    }
  }
  // Eruption: blobs fly out on arcs.
  for (let k = 0; k < 14; k++) {
    const phase = (t + hash(k, 3) % 24) % 24
    const vxk = ((hash(k, 5) % 9) - 4) * 0.35
    const vy = 1.4 + (hash(k, 7) % 6) * 0.15
    const y = top - (vy * phase - 0.09 * phase * phase)
    if (y <= top) px.set(vx + vxk * phase, y, k % 3 ? 'lava' : 'lava2')
  }
  // Smoke puffs drifting up.
  for (let k = 0; k < 3; k++) {
    const rise = (Math.floor(t / 2) + k * 6) % 18
    px.circle(vx + Math.sin((t + k * 9) * 0.15) * 2, top - 4 - rise, 1.5 + rise / 8, 'smoke')
  }
  // Nervous: hops beside it, eyes wide, watching the crater.
  const jump = hop(t, 14, 3)
  critter(px, s.cx, s.cy - jump.lift, { frame: jump.frame, eyes: blink(t) ? 'closed' : 'wide', look: 1 })
  label(s, vx, 'tests')
}

function digging(s: Stage): void {
  const { px, t, groundY } = s
  setting(s, 'day')
  const hole = s.cx + CRITTER_W + 3
  px.rect(hole, groundY, 9, 5, 'pit')
  px.rect(hole + 1, groundY + 5, 7, 1, 'pit')
  // A dirt pile grows on the far side while clods fly out of the hole.
  const pile = 2 + (Math.floor(t / 10) % 5)
  for (let i = 0; i < pile; i++) px.rect(hole + 11 + i, groundY - Math.min(i, pile - i), 1, Math.min(i, pile - i) + 1, 'dirt')
  for (let k = 0; k < 5; k++) {
    const phase = (t + k * 4) % 16
    px.set(hole + 4 + phase * 0.8, groundY - (1.6 * phase - 0.12 * phase * phase), k % 2 ? 'dirt' : 'dirt2')
  }
  // Now and then a file pops out.
  const pop = t % 60
  if (pop < 18) {
    const y = groundY - 2 - Math.round(6 * Math.sin((pop / 18) * Math.PI))
    px.rect(hole + 3, y, 4, 5, 'paper')
    px.rect(hole + 4, y + 1, 2, 1, 'rock')
    px.rect(hole + 4, y + 3, 2, 1, 'rock')
  }
  // Curious: scoops and throws, eyes on the hole.
  critter(px, s.cx, s.cy, { frame: Math.floor(t / 3) % 2 === 0 ? 'crouch' : 'cheer', eyes: blink(t) ? 'closed' : 'open', look: 1 })
  label(s, hole + 5, 'the code')
}

function thinking(s: Stage): void {
  const { px, t } = s
  setting(s, 'day')
  // A thought cloud rises from its head, with a light bulb that flickers on.
  const hx = s.cx + CRITTER_W - 4
  const top = Math.max(3, s.cy - 14)
  const rise = Math.floor(t / 4) % 3
  px.circle(hx, s.cy - 1, 1, 'paper')
  if (rise >= 1) px.circle(hx + 2, s.cy - 4, 1.4, 'paper')
  if (rise >= 2) px.circle(hx + 4, s.cy - 7, 1.8, 'paper')
  for (const [dx, dy, r] of [[5, 2, 3.2], [9, 0, 3.6], [13, 2, 3.0], [9, 4, 3.0]] as const) px.circle(hx + dx, top + dy, r, 'paper')
  const lit = t % 14 < 9
  px.circle(hx + 9, top + 1, 1.6, lit ? 'gold' : 'rockHi')
  px.rect(hx + 8, top + 3, 3, 1, 'metal')
  // Pondering: sits, eyes half shut, opening when the idea lights up.
  critter(px, s.cx, s.cy, { frame: 'sit', eyes: lit && !blink(t) ? 'open' : 'closed', look: 1 })
}

function signpost(px: Pixels, x: number, groundY: number, icon: 'question' | 'lock'): void {
  px.rect(x + 3, groundY - 6, 1, 6, 'wood')
  px.rect(x, groundY - 12, 7, 6, 'paper')
  if (icon === 'question') {
    px.rect(x + 2, groundY - 11, 3, 1, 'red')
    px.set(x + 4, groundY - 10, 'red')
    px.set(x + 3, groundY - 9, 'red')
    px.set(x + 3, groundY - 7, 'red')
  } else {
    px.rect(x + 2, groundY - 9, 3, 3, 'gold')
    px.set(x + 2, groundY - 10, 'metal')
    px.set(x + 4, groundY - 10, 'metal')
    px.set(x + 3, groundY - 11, 'metal')
  }
}

function waiting(s: Stage, icon: 'question' | 'lock'): void {
  const { px, t, groundY } = s
  setting(s, 'day')
  signpost(px, s.cx + CRITTER_W + 3, groundY, icon)
  // Sits and looks at you, glancing at the sign now and then.
  const glance = Math.floor(t / 25) % 3 === 2 ? 1 : 0
  critter(px, s.cx, s.cy, { frame: 'sit', eyes: blink(t) ? 'closed' : 'open', look: glance })
}

function mail(s: Stage): void {
  const { px, t } = s
  setting(s, 'day')
  const bounce = Math.round(Math.abs(Math.sin(t * 0.4)) * 3)
  const ex = s.cx + 7
  const ey = s.cy - 9 - bounce
  px.rect(ex, ey, 8, 5, 'paper')
  for (let i = 0; i < 4; i++) { px.set(ex + i, ey + i, 'rock'); px.set(ex + 7 - i, ey + i, 'rock') }
  // Surprised: hops with wide eyes.
  const jump = hop(t, 12, 3, 'cheer')
  critter(px, s.cx, s.cy - jump.lift, { frame: jump.frame, eyes: 'wide', look: 0 })
}

const CONFETTI: PixelColor[] = ['red', 'gold', 'green', 'blue', 'pink', 'cyan']

function party(s: Stage): void {
  const { px, t, groundY } = s
  setting(s, 'day')
  // A flag planted on the right.
  const fx = Math.min(px.width - 6, s.cx + CRITTER_W + 6)
  px.rect(fx, groundY - 12, 1, 12, 'metal')
  const wave = Math.floor(t / 3) % 2
  px.rect(fx + 1, groundY - 12 + wave, 5, 3, 'body')
  // Confetti falls over the whole sky.
  for (let k = 0; k < 40; k++) {
    const speed = 0.4 + (hash(k, 2) % 5) * 0.15
    const y = (hash(k, 4) % groundY + t * speed) % groundY
    px.set((hash(k, 6) % px.width) + Math.sin(t * 0.2 + k) * 1.5, y, CONFETTI[k % CONFETTI.length])
  }
  // Proud: arms up, jumping, happy eyes.
  const jump = hop(t, 9, 4, 'cheer')
  critter(px, s.cx, s.cy - jump.lift, { frame: jump.frame === 'crouch' ? 'crouch' : 'cheer', eyes: 'happy' })
}

function storm(s: Stage): void {
  const { px, t, groundY } = s
  const flash = t % 26 < 2
  setting(s, 'storm', flash)
  // A dark cloud right over the critter, raining.
  const cloudY = Math.max(3, s.cy - 12)
  for (const [dx, r] of [[3, 3], [8, 4], [13, 3.5], [18, 2.5]] as const) px.circle(s.cx + dx, cloudY, r, 'cloud')
  for (let k = 0; k < 14; k++) {
    const x = s.cx + (hash(k, 3) % (CRITTER_W - 2)) + 1
    const y = cloudY + 3 + ((t * 1.5 + hash(k, 5)) % Math.max(1, groundY - cloudY - 3))
    px.rect(x, y, 1, 2, 'rain')
  }
  if (flash) {
    let x = s.cx + 11
    for (let y = cloudY + 3; y < s.cy + 1; y++) { px.set(x, y, 'bolt'); x += (y % 3) - 1 }
  }
  // Upset: shaking, X eyes.
  const shake = (hash(t) % 3) - 1
  critter(px, s.cx + shake, s.cy, { frame: 'idle1', eyes: 'dead' })
}

function night(s: Stage): void {
  const { px, t } = s
  setting(s, 'night')
  // A crescent moon (the bite is sky, or empty when there is no sky).
  const mx = px.width - 9
  px.circle(mx, 6, 4, 'moon')
  px.circle(mx - 2, 5, 3.5, s.backdrop ? 'sky0' : null)
  // Asleep: slow breathing.
  critter(px, s.cx, s.cy, { frame: Math.floor(t / 8) % 2 ? 'sit' : 'land', eyes: 'closed' })
  for (let k = 0; k < 3; k++) {
    const phase = (Math.floor(t / 6) + k * 4) % 12
    s.texts.push({ kind: 'float', x: s.cx + CRITTER_W - 2 + phase * 0.8, y: s.cy - 2 - phase * 1.2, text: phase < 4 ? 'z' : 'Z', color: phase < 6 ? 'blue' : 'cyan' })
  }
}

const SCENES: Record<SceneId, (s: Stage) => void> = {
  typing: typingScene,
  terminal: terminalScene,
  volcano,
  digging,
  thinking,
  waiting: (s) => waiting(s, 'question'),
  approval: (s) => waiting(s, 'lock'),
  mail,
  party,
  storm,
  night
}

export interface SceneOptions {
  event?: SceneEvent
  /** What the agent is doing (from its tool lines). */
  activity?: AgentActivity | null
  /** The user is typing into the agent's terminal. */
  listening?: boolean
  /** Draw sky and ground (default). The ASCII style turns this off. */
  backdrop?: boolean
  /** Current time, so a new action is announced plainly before any quip. */
  now?: number
}

/**
 * Renders `scene` `tick` frames in, on a pixel grid `width` x `height`.
 * The bubble line is attached above the critter.
 */
export function renderScene(scene: SceneId, tick: number, width: number, height: number, options: SceneOptions = {}): PixelFrame {
  const w = Math.max(CRITTER_W + 8, Math.floor(width))
  const h = Math.max(CRITTER_H + 14, Math.floor(height))
  const t = Math.max(0, Math.floor(tick))
  const px = new Pixels(w, h)
  const groundY = Math.round(h * 0.7)
  const stage: Stage = {
    px,
    t,
    groundY,
    cx: Math.max(1, Math.round(w * 0.1)),
    // The sprite's feet (its last opaque row) stand on the grass line.
    cy: groundY - CRITTER_H + 1,
    texts: [],
    activity: options.activity ?? null,
    backdrop: options.backdrop ?? true
  }
  SCENES[scene](stage)
  // While you type into the agent's terminal, the critter says it is listening.
  const listens = options.listening && scene !== 'night' && scene !== 'storm'
  stage.texts.unshift({ kind: 'bubble', x: stage.cx + CRITTER_W / 2, y: Math.max(1, stage.cy - 6), text: listens ? 'Listening...' : sceneLine(scene, t, stage.activity, options.now) })
  return { width: w, height: h, groundY, pixels: px.data, texts: stage.texts }
}

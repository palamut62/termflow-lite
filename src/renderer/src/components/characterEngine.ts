// Agent character engine, ported from the TermFlow ASCII motion kit
// (output/ascii-animation-kit/source/animation.js). Each character is drawn
// as vector geometry on a 360x390 offscreen canvas, then sampled into either
// ASCII glyphs or square pixel blocks. Body, eyes, brows, mouth and hands are
// separate layers; the face eases toward per-state targets, so every mood
// change is a visible expression change, not a frame swap.
//
// One CharacterEngine per agent pane: state, time, blink and face never leak
// between sessions.

import type { WeatherKind } from '../fun/weather'

export type CharacterKind = 'ember' | 'miso' | 'piko'
export type CharacterState =
  | 'working'
  | 'thinking'
  | 'waiting'
  | 'tired'
  | 'angry'
  | 'sleeping'
  | 'rested'
  | 'done'
  | 'error'
  | 'idle'
export type CharacterStyle = 'ascii' | 'pixel'

export interface Face {
  open: number
  gazeX: number
  gazeY: number
  tilt: number
  sy: number
  smile: number
}

interface Palette {
  main: string
  shade: string
  light: string
}

export const CHARACTERS: Record<CharacterKind, Palette & { name: string }> = {
  ember: { name: 'Ember', main: '#f69a68', shade: '#ad534c', light: '#ffd09b' },
  miso: { name: 'Miso', main: '#8ebfb5', shade: '#3b7b81', light: '#d7edd4' },
  piko: { name: 'Piko', main: '#d9bf72', shade: '#a37d47', light: '#ffedb6' }
}

export const SCENE_W = 360
export const SCENE_H = 390
/** Simulation seconds per real second (the kit's default). */
const SPEED = 1.4
/** A tired worker types noticeably slower. */
const TIRED_PACE = 0.65
/** Faces move this share of the way to their target on every frame. */
const EASE = 0.32
/** Sim seconds between redraws of the background field (~9 fps at the default speed). */
const FIELD_STEP = 0.15

const INK = '#141c24'
/** Panel background (matches .agent-companion), used to mask the field behind glyphs. */
const STAGE = '#0c1015'
const CREAM = '#fff1d4'

/** 5.2 s loop: type 0-1.8, short break, type 2.2-4.15, then read the screen. */
export function workPose(t: number): { typing: boolean; reading: boolean; phase: number } {
  const phase = t % 5.2
  return { typing: phase < 1.8 || (phase > 2.2 && phase < 4.15), reading: phase >= 4.15, phase }
}

/** Key under one hand (-1 left, 1 right): finger and lit key share column, row and press. */
export function keyPose(t: number, side: -1 | 1): { col: number; row: number; press: number } {
  const beat = t * 7 + (side === 1 ? 0.5 : 0)
  const step = Math.floor(beat)
  const f = beat - step
  return { col: (side === -1 ? 1 : 6) + ((step * 3) % 4), row: step % 3, press: Math.pow(Math.sin(f * Math.PI), 4) }
}

/** 0..1 while a tired worker yawns (about 1.4 s out of every 7.5 sim seconds). */
export function yawnAmount(t: number): number {
  const phase = t % 7.5
  return phase > 6.1 ? Math.sin(((phase - 6.1) / 1.4) * Math.PI) : 0
}

/** Where the face is heading for `state` at sim time `t`. `tired` droops a working face. */
export function faceTargets(state: CharacterState, t: number, tired = false): Face {
  const w = workPose(t)
  if (state === 'working' && tired) {
    const yawn = yawnAmount(t)
    return {
      open: (w.reading ? 0.6 : 0.42) * (1 - yawn * 0.75),
      gazeX: w.reading ? 15 : 3 * Math.sin(t * 2),
      gazeY: w.reading ? 6 : 15,
      tilt: 0.09 + 0.04 * Math.sin(t * 0.9) - yawn * 0.12,
      sy: 0.9,
      smile: 0
    }
  }
  return {
    open:
      state === 'sleeping' ? 0
        : state === 'tired' ? 0.22
          : state === 'working' ? (w.reading ? 1 : 0.72)
            : state === 'angry' ? 0.85
              : state === 'error' ? 1.28
                : state === 'waiting' ? 1.12
                  : 1,
    gazeX:
      state === 'thinking' ? 15 * Math.sin(t * 1.1)
        : state === 'waiting' ? Math.tanh(Math.sin(t * 1.4) * 3) * 14
          : state === 'working' ? (w.reading ? 17 : 4 * Math.sin(t * 3))
            : 0,
    gazeY: state === 'thinking' ? -13 : state === 'tired' ? 7 : state === 'working' ? (w.reading ? 3 : 14) : 0,
    tilt:
      state === 'thinking' ? -0.16
        : state === 'tired' ? 0.19
          : state === 'angry' ? -0.1
            : state === 'waiting' ? 0.07 * Math.sin(t * 1.2)
              : state === 'error' ? 0.09
                : state === 'working' ? (w.reading ? 0.055 : -0.025)
                  : 0,
    sy:
      state === 'sleeping' ? 0.8 + 0.012 * Math.sin(t * 1.5)
        : state === 'tired' ? 0.84
          : state === 'angry' ? 0.94
            : state === 'error' ? 1.06
              : 1 + 0.008 * Math.sin(t * 2),
    smile: state === 'done' ? 1 : state === 'angry' ? -1 : state === 'rested' ? 0.9 : 0
  }
}

/** Sim seconds the "noticed you" reaction lasts after the pointer arrives. */
export const NOTICE_S = 0.7
/** Middle of the eyes in scene pixels. */
const EYES_X = 170
const EYES_Y = 194

/**
 * The face while the pointer hovers the panel: the pupils turn toward it and
 * the head leans its way. Arriving gets a wide-eyed "oh, hi" (`notice` is sim
 * seconds since then); a pointer right on the face gets a happy squint.
 * Grumpy and error faces look but do not smile. `point` is in scene pixels.
 */
export function lookToward(face: Face, state: CharacterState, point: { x: number; y: number }, notice: number): Face {
  const dx = point.x - EYES_X
  const dy = point.y - EYES_Y
  const distance = Math.hypot(dx, dy) || 1
  const reach = Math.min(1, distance / 120)
  const look: Face = {
    ...face,
    gazeX: (dx / distance) * 15 * reach,
    gazeY: (dy / distance) * 12 * reach,
    tilt: face.tilt + Math.max(-1, Math.min(1, dx / 200)) * 0.06
  }
  const grumpy = state === 'angry' || state === 'error'
  if (notice < NOTICE_S) look.open = Math.max(face.open, 1.2)
  else if (distance < 70 && !grumpy) {
    look.open = Math.min(Math.max(face.open, 0.5), 0.55)
    look.smile = 1
  }
  if (!grumpy) look.smile = Math.max(look.smile, 0.45)
  return look
}

type Point = [number, number]

interface SceneInput {
  kind: CharacterKind
  state: CharacterState
  tired: boolean
  t: number
  age: number
  blinkAge: number
  face: Face
  /** Height of the little hop when the pointer is first noticed. */
  hop: number
  /** The sky and how far it has faded in (0..1). */
  weather: SceneWeather | null
}

interface SceneWeather {
  kind: WeatherKind
  amount: number
  night: boolean
}

/** Umbrella canopy colors per character: [main, stripe]. */
const UMBRELLA: Record<CharacterKind, [string, string]> = {
  ember: ['#5c8fd6', '#3d6db3'],
  miso: ['#e0796a', '#b85a4d'],
  piko: ['#5fae7d', '#3f8a5c']
}

/**
 * The face in the weather: a sunny day brings a smile, heat makes it droopy,
 * wind makes it squint and lean, rain sends a glance up at the umbrella now
 * and then. `amount` is how far the weather has faded in.
 */
export function weatherFace(face: Face, state: CharacterState, kind: WeatherKind, amount: number, t: number): Face {
  if (amount <= 0) return face
  const out = { ...face }
  const grumpy = state === 'angry' || state === 'error'
  if (kind === 'sunny' && !grumpy) out.smile = Math.max(out.smile, 0.35 * amount)
  if (kind === 'hot') {
    out.open *= 1 - 0.15 * amount
    out.gazeY += 3 * amount
  }
  if (kind === 'windy') {
    out.open *= 1 - 0.25 * amount
    out.tilt += 0.07 * amount * (0.6 + 0.4 * Math.sin(t * 2.3))
  }
  if (kind === 'snow') out.open *= 1 - 0.05 * amount
  if (kind === 'rain' && state !== 'working' && Math.sin(t * 0.6) > 0.6) out.gazeY -= 8 * amount
  return out
}

/** The open umbrella, in scene pixels; rain stops at it. */
interface Canopy {
  x: number
  y: number
  rx: number
  ry: number
}

/**
 * The kit's scene(): background props, body, face, desk, hands, monitor, then
 * state symbols, plus what the character wears for the weather (umbrella,
 * scarf, sweat). The sky itself is its own layer behind (drawSkyLayer).
 */
function drawScene(g: CanvasRenderingContext2D, input: SceneInput): Canopy | null {
  const { kind, state: s, face, t, age } = input
  const m = CHARACTERS[kind]
  g.clearRect(0, 0, SCENE_W, SCENE_H)
  const box = (x: number, y: number, w: number, h: number, c: string, r = 0): void => {
    g.fillStyle = c
    g.beginPath()
    g.roundRect(x, y, w, h, r)
    g.fill()
  }
  const oval = (x: number, y: number, rx: number, ry: number, c: string): void => {
    g.fillStyle = c
    g.beginPath()
    g.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2)
    g.fill()
  }
  const path = (points: Point[], c: string): void => {
    g.fillStyle = c
    g.beginPath()
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fill()
  }
  const stroke = (points: Point[], c: string, width = 4): void => {
    g.strokeStyle = c
    g.lineWidth = width
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }

  // Art-directed scenery stays subordinate to the face.
  stroke([[22, 337], [338, 337]], '#435c65', 2)
  if (kind === 'ember') {
    box(24, 56, 61, 49, '#44636a', 4)
    box(29, 62, 51, 34, '#15252e')
    stroke([[36, 73], [42, 78], [36, 83]], '#9bd1c1', 3)
    stroke([[48, 85], [66, 85]], '#9bd1c1', 3)
    box(252, 86, 62, 8, '#806e58')
    for (let i = 0; i < 3; i++) box(256 + i * 17, 54, 10, 30, ['#837e91', '#8cbaaf', '#c3956c'][i], 2)
  } else if (kind === 'miso') {
    box(244, 44, 69, 75, '#354b60', 24)
    oval(278, 74, 14, 14, '#d9d5b0')
    oval(284, 70, 13, 13, '#354b60')
    stroke([[247, 98], [309, 98]], '#8292a1', 3)
    for (let i = 0; i < 3; i++) box(31 + i * 15, 73, 10, 27, ['#63899e', '#b19f76', '#9d808a'][i], 2)
    box(25, 102, 58, 6, '#a28b76')
  } else {
    box(27, 52, 68, 43, '#507176', 4)
    stroke([[36, 77], [47, 67], [57, 82], [69, 63], [84, 68]], '#b0d2b8', 3)
    oval(303, 67, 17, 17, '#7d939a')
    stroke([[303, 55], [303, 67], [313, 73]], '#e2dcc6', 3)
  }

  const weather = input.weather
  const wk = weather?.kind
  const wa = weather?.amount ?? 0

  const working = s === 'working'
  const sleep = s === 'sleeping'
  const happy = s === 'done'
  const angry = s === 'angry'
  // "Tired" covers both the resting tired pose and a tired face at the desk.
  const droopy = s === 'tired' || (working && input.tired)
  const yawn = working && input.tired ? yawnAmount(t) : 0
  const work = workPose(t)
  const typing = working && work.typing && yawn < 0.3
  const nod = typing ? Math.sin(t * 8) * 0.012 : 0
  const jump = happy ? Math.abs(Math.sin(age * 5)) * (age < 4 ? 29 : 8) : s === 'rested' ? Math.max(0, Math.sin(t * 2.5)) * 7 : 0
  let cx = 170
  let cy = sleep ? 258 : 214 - jump - input.hop
  if (s === 'thinking') cx += Math.sin(t * 0.5) * 7
  if (s === 'waiting') cx += Math.sin(t * 1.2) * 5
  if (s === 'tired') cy += 6 + Math.max(0, Math.sin(t * 1.1)) * 5
  if (working && input.tired) cy += 5
  if (s === 'error' && age < 1) cy -= Math.sin(age * Math.PI) * 17
  if (wk === 'windy') cx += 5 * wa
  if (wk === 'snow' && !sleep) cx += Math.sin(t * 38) * 1.6 * wa

  // Ground shadow narrows as the body rises; feet have discrete poses.
  oval(cx, 326, 64 - jump * 0.55, 6 - jump * 0.08, '#233038')
  if (!sleep) {
    oval(cx - 34, 317 - jump, 22, 10, m.shade)
    oval(cx + 35, 317 - jump - (s === 'waiting' ? Math.max(0, Math.sin(t * 8)) * 8 : 0), 22, 10, m.shade)
  } else {
    box(51, 316, 245, 12, '#697d98', 3)
    box(52, 290, 242, 24, '#6679aa', 5)
    box(51, 300, 8, 35, '#a6b1c1')
    box(289, 300, 8, 35, '#a6b1c1')
    box(73, 278, 66, 22, '#c7d4d4', 9)
  }

  if (wk === 'rain') oval(cx + 78, 331, 44 * wa, 4, '#4f7398')
  // The umbrella goes behind the body, so its handle disappears into the character's grip.
  const canopy: Canopy | null = wk === 'rain' && !sleep ? { x: cx + 30, y: cy - 132, rx: 105 * Math.min(1, wa * 1.4), ry: 48 * Math.min(1, wa * 1.4) } : null
  if (canopy && canopy.rx > 2) {
    const [main, stripe] = UMBRELLA[kind]
    stroke([[canopy.x, canopy.y - canopy.ry], [canopy.x, canopy.y], [cx + 92, cy + 26]], '#6b5642', 7)
    g.strokeStyle = '#6b5642'
    g.lineWidth = 7
    g.beginPath()
    g.arc(cx + 84, cy + 26, 8, 0, Math.PI)
    g.stroke()
    g.fillStyle = main
    g.beginPath()
    g.ellipse(canopy.x, canopy.y, canopy.rx, canopy.ry, 0, Math.PI, Math.PI * 2)
    g.closePath()
    g.fill()
    // Two darker panels between the ribs, and a scalloped hem.
    for (const [a, b] of [[1.15, 1.4], [1.62, 1.86]]) {
      g.fillStyle = stripe
      g.beginPath()
      g.moveTo(canopy.x, canopy.y)
      g.ellipse(canopy.x, canopy.y, canopy.rx, canopy.ry, 0, Math.PI * a, Math.PI * b)
      g.closePath()
      g.fill()
    }
    for (let k = 0; k < 4; k++) oval(canopy.x - canopy.rx + canopy.rx * (k * 2 + 1) / 4, canopy.y, canopy.rx / 4, 6, main)
    stroke([[canopy.x, canopy.y - canopy.ry], [canopy.x, canopy.y - canopy.ry - 10]], '#5b4a3a', 4)
  }

  g.save()
  g.translate(cx, cy)
  g.rotate(face.tilt + nod + (angry ? Math.sin(t * 15) * 0.012 : 0))
  g.scale(1 / face.sy, face.sy)
  // Three silhouettes: asymmetric flame, ear-tuft spirit, articulated robot.
  if (kind === 'ember') {
    g.fillStyle = m.main
    g.beginPath()
    g.moveTo(-83, 39)
    g.bezierCurveTo(-105, -10, -75, -58, -40, -78)
    g.bezierCurveTo(-26, -89, -26, -107, -19, -116)
    g.bezierCurveTo(10, -91, 14, -69, 29, -79)
    g.bezierCurveTo(49, -96, 47, -104, 53, -104)
    g.bezierCurveTo(73, -62, 102, -32, 85, 43)
    g.bezierCurveTo(71, 77, 34, 91, -10, 83)
    g.bezierCurveTo(-44, 88, -67, 72, -83, 39)
    g.fill()
    path([[-82, 33], [-55, 61], [15, 71], [76, 44], [58, 76], [-10, 83], [-61, 65]], m.shade)
    path([[-66, -29], [-53, -56], [-33, -65], [-39, -39]], m.light)
  } else if (kind === 'miso') {
    g.fillStyle = m.main
    g.beginPath()
    g.moveTo(-85, 41)
    g.lineTo(-87, -73)
    g.quadraticCurveTo(-86, -103, -64, -106)
    g.lineTo(-31, -66)
    g.quadraticCurveTo(2, -80, 35, -64)
    g.lineTo(65, -107)
    g.quadraticCurveTo(94, -102, 89, -56)
    g.lineTo(89, 50)
    g.quadraticCurveTo(64, 92, 41, 71)
    g.quadraticCurveTo(17, 96, -8, 75)
    g.quadraticCurveTo(-49, 96, -85, 41)
    g.fill()
    path([[-75, -68], [-73, -91], [-50, -63]], m.shade)
    path([[57, -66], [70, -90], [76, -63]], m.shade)
    path([[-81, 43], [-40, 65], [3, 66], [80, 38], [60, 76], [40, 72], [8, 88], [-15, 76], [-48, 81]], m.shade)
  } else {
    box(-82, -72, 168, 151, m.shade, 24)
    box(-86, -82, 168, 148, m.main, 23)
    box(-76, -72, 148, 107, '#233945', 17)
    box(-97, -25, 13, 42, m.shade, 4)
    box(82, -25, 13, 42, m.shade, 4)
    stroke([[20, -81], [29, -102]], m.light, 6)
    oval(31, -107, 9, 9, s === 'error' ? '#ff8870' : droopy ? '#d9c27a' : '#a4e4b6')
    box(-44, 48, 65, 6, m.shade, 2)
    oval(48, 51, 5, 5, '#93c59e')
  }

  if (wk === 'snow' && wa > 0.3) {
    box(-80, 46, 160, 20, '#d9534f', 9)
    for (let k = 0; k < 4; k++) box(-56 + k * 32, 46, 10, 20, '#f2e1c9')
    box(36, 56, 20, 34, '#c2443f', 5)
  }

  // Hands have anticipation, contact and a rest phase. A yawning worker covers the mouth.
  const handY = working ? 32 : s === 'waiting' ? 16 : happy ? -58 + Math.sin(t * 7) * 10 : angry ? -5 + Math.sin(t * 9) * 7 : s === 'error' ? -40 : s === 'rested' ? -30 : 32
  if (!working) {
    oval(-86, handY + 12, 17, 22, m.shade)
    oval(86, handY, 18, 23, m.main)
  }

  // Eye whites and pupils are independent of the silhouette and palette.
  const blink = input.blinkAge < 0.18 ? Math.max(0.06, Math.abs(input.blinkAge - 0.09) / 0.09) : 1
  const eyeOpen = Math.max(0.02, face.open * blink)
  for (const side of [-1, 1] as const) {
    const ex = side * 37
    const ey = -20 + (side === 1 && s === 'thinking' ? -5 : 0)
    if (sleep) {
      stroke([[ex - 22, ey], [ex - 10, ey + 6], [ex + 8, ey + 6], [ex + 22, ey]], CREAM, 5)
      continue
    }
    if (happy) {
      g.strokeStyle = CREAM
      g.lineWidth = 7
      g.beginPath()
      g.arc(ex, ey + 9, 22, Math.PI, Math.PI * 2)
      g.stroke()
      continue
    }
    g.save()
    g.beginPath()
    g.roundRect(ex - 25, ey - 29 * eyeOpen, 50, 58 * eyeOpen, Math.min(18, 24 * eyeOpen))
    g.clip()
    box(ex - 26, ey - 40, 52, 80, CREAM)
    oval(ex + face.gazeX, ey + face.gazeY, s === 'error' ? 7 : 12, s === 'error' ? 11 : 20, INK)
    oval(ex + face.gazeX - 4, ey + face.gazeY - 7, 4, 5, '#ffffff')
    if (angry) path([[ex - 29, ey - 32], [ex + 29, ey - 32], [ex + 29, ey + (side === -1 ? 5 : -14)], [ex - 29, ey + (side === -1 ? -14 : 5)]], kind === 'piko' ? '#233945' : m.main)
    g.restore()
    if (angry) stroke([[ex - 26, ey + (side === -1 ? -22 : -3)], [ex + 26, ey + (side === -1 ? -3 : -22)]], INK, 7)
    if (droopy) {
      // Heavy lids and eye bags.
      stroke([[ex - 24, ey - 4 - (1 - eyeOpen) * 6], [ex + 24, ey + 1 - (1 - eyeOpen) * 6]], m.shade, 5)
      stroke([[ex - 19, ey + 17], [ex + 15, ey + 20]], m.shade, 5)
    }
    if (s === 'error') stroke([[ex - 22, ey - 46], [ex, ey - 53], [ex + 20, ey - 45]], CREAM, 5)
    if (s === 'waiting') stroke([[ex - 22, ey - 43], [ex + 18, ey - 49]], INK, 5)
    if (s === 'thinking' && side === 1) stroke([[ex - 21, ey - 48], [ex + 18, ey - 54]], INK, 5)
  }
  if (happy) {
    oval(0, 38, 25, 22, INK)
    box(-17, 20, 34, 8, CREAM, 2)
    oval(2, 49, 13, 6, '#ec9c93')
  } else if (s === 'error' || s === 'waiting') oval(0, 36, s === 'error' ? 16 : 7, s === 'error' ? 21 : 8, INK)
  else if (sleep) oval(3, 29, 7, 5, INK)
  else if (angry) stroke([[-18, 43], [0, 32], [19, 40]], INK, 5)
  else if (s === 'tired') {
    if (t % 5 > 3.6) oval(0, 37, 12, 17, INK)
    else stroke([[-17, 43], [0, 39], [17, 43]], INK, 5)
  } else if (working && input.tired) {
    if (yawn > 0.05) oval(0, 37, 6 + yawn * 8, 4 + yawn * 16, INK)
    else stroke([[-16, 41], [0, 38], [16, 42]], INK, 5)
  } else {
    g.strokeStyle = INK
    g.lineWidth = 5
    g.beginPath()
    g.moveTo(-19, 31)
    g.quadraticCurveTo(0, 43 + face.smile * 17, 20, 31)
    g.stroke()
  }
  if ((wk === 'hot' || wk === 'snow') && wa > 0.3 && !sleep) {
    oval(-60, 16, 15, 9, '#ff8a8a')
    oval(60, 16, 15, 9, '#ff8a8a')
  }
  if (wk === 'hot' && wa > 0.3) {
    // Sweat drops roll down both temples.
    const drip = (t * 26) % 46
    oval(-82, -44 + drip, 6, 9, '#9fd3ff')
    oval(80, -60 + ((drip + 23) % 46), 6, 9, '#9fd3ff')
  }
  g.restore()

  if (!sleep) {
    // Keyboard, desk and a code display stay readable as ASCII shapes.
    box(37, 329, 291, 8, '#819294', 3)
    box(47, 337, 7, 18, '#536c76')
    box(313, 337, 7, 18, '#536c76')
    path([[84, 289], [230, 289], [243, 325], [74, 325]], '#536777')
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 11; col++) {
        const hit = typing && ([-1, 1] as const).some((side) => {
          const k = keyPose(t, side)
          return k.col === col && k.row === row && k.press > 0.55
        })
        box(88 + col * 12 - row * 2, 294 + row * 9, 8, 5, hit ? '#ffdda4' : '#abc3c9', 1)
      }
    }
    box(120, 319, 65, 4, '#b8ccce', 1)
    if (working) {
      for (const side of [-1, 1] as const) {
        const k = keyPose(t, side)
        const press = typing ? k.press : 0
        // While yawning, the left hand leaves the keys to cover the mouth.
        const covering = side === -1 && yawn > 0.3
        const hx = covering ? cx - 8 : typing ? 92 + k.col * 12 - k.row * 2 : side === -1 ? 121 : 198
        const hy = covering ? cy + 44 : typing ? 284 + k.row * 9 - (1 - press) * 8 : 282
        g.strokeStyle = m.shade
        g.lineWidth = 12
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(cx + side * 77, 255)
        g.quadraticCurveTo(hx + side * 22, covering ? 250 : 275, hx, hy)
        g.stroke()
        oval(hx, hy, 15, 8 - press * 2, m.main)
        for (let finger = 0; finger < 3; finger++) box(hx - 9 + finger * 7, hy + 3, 5, finger === 1 ? 11 : 7, m.light, 2)
      }
    }
    box(254, 239, 80, 64, '#8197a4', 5)
    box(260, 246, 68, 49, '#142934', 2)
    if (wk === 'snow') box(251, 233, 86, 8 * wa, '#f2f6ff', 4)
    box(287, 302, 10, 18, '#718695')
    box(270, 320, 44, 6, '#95a9b2', 2)
    if (s === 'error' || angry) {
      stroke([[279, 256], [303, 281]], '#ff967e', 5)
      stroke([[303, 256], [279, 281]], '#ff967e', 5)
    } else if (happy) stroke([[273, 269], [284, 280], [312, 255]], '#b7edbb', 5)
    else {
      for (let row = 0; row < 5; row++) {
        const codeTime = Math.floor(t / 5.2) * 4.15 + Math.min(work.phase, 4.15)
        const line = Math.floor(codeTime * 2) % 5
        const len = working ? (row === line ? 8 + ((codeTime * 25) % 37) : 18 + ((row * 11) % 31)) : 18 + row * 5
        box(266 + (row % 2) * 5, 252 + row * 8, Math.min(len, 49), 3, row % 2 ? '#9dbde5' : '#8cdbbb')
        if (working && row === line && Math.floor(t * 3) % 2 === 0) box(268 + (row % 2) * 5 + Math.min(len, 49), 250 + row * 8, 3, 6, '#f6d29b')
      }
    }
  }
  if (droopy || s === 'waiting') {
    // Coffee mug with a wisp of steam.
    box(279, 299, 29, 29, '#c9c1a6', 4)
    g.strokeStyle = '#c9c1a6'
    g.lineWidth = 5
    g.beginPath()
    g.arc(310, 311, 9, -Math.PI / 2, Math.PI / 2)
    g.stroke()
    stroke([[288, 291], [285 + Math.sin(t) * 3, 280], [289, 272]], '#75919c', 2)
  }
  if (sleep || yawn > 0.5) {
    g.font = '20px Consolas'
    g.fillStyle = '#b4cbe4'
    g.fillText('z', 261, 201 - Math.sin(t) * 3)
    g.font = '26px Consolas'
    g.fillText('Z', 280, 178 - Math.sin(t + 1) * 4)
  }
  if (s === 'thinking') {
    g.font = '24px Consolas'
    g.fillStyle = '#f5d59d'
    g.fillText('?', 274, 138 + Math.sin(t) * 3)
    oval(246, 157, 3, 3, '#d1b47a')
    oval(255, 148, 5, 5, '#d1b47a')
  }
  if (happy && age < 5) {
    for (let i = 0; i < 16; i++) {
      const px = 30 + ((i * 43) % 300)
      const py = 55 + ((age * 33 + i * 19) % 235)
      box(px, py, 4, 7, ['#efaa78', '#a3d9c2', '#b2a4dd'][i % 3])
    }
  }
  if (angry) {
    stroke([[290, 127], [278, 144], [291, 144], [281, 163]], '#f18a74', 5)
    stroke([[62, 133], [71, 133], [71, 143]], '#f18a74', 5)
    stroke([[79, 151], [79, 142], [89, 142]], '#f18a74', 5)
  }
  if (s === 'error') {
    box(283, 131, 8, 26, '#ffd495', 2)
    oval(287, 167, 5, 5, '#ffd495')
    path([[249, 170], [242, 187], [248, 196], [255, 188]], '#86cce4')
  }
  if (wk === 'snow') box(22, 333, 316, 4 * wa, '#e8eef8', 2)
  return canopy
}

/**
 * The weather sky, drawn behind the character across the whole panel: sun or
 * moon and clouds at the very top (`top` is the panel's top edge in scene
 * pixels, negative when the panel is taller than the scene), rain, snow or
 * wind falling and blowing down to the floor. Rain stops at the umbrella.
 */
function drawSkyLayer(g: CanvasRenderingContext2D, w: SceneWeather, t: number, top: number, cover: Canopy | null): void {
  // `top` is the panel's real top edge in scene pixels (the layer itself may start higher, on the grid).
  const a = w.amount
  const oval = (x: number, y: number, rx: number, ry: number, c: string): void => {
    g.fillStyle = c
    g.beginPath()
    g.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2)
    g.fill()
  }
  const stroke = (points: Point[], c: string, width: number): void => {
    g.strokeStyle = c
    g.lineWidth = width
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.beginPath()
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.stroke()
  }
  // Sky bodies sit high up, but never lower than the top of the scene.
  const skyY = Math.min(top + 52, 34)
  const height = 337 - top
  if (w.kind === 'sunny' || w.kind === 'hot') {
    const big = w.kind === 'hot'
    if (w.night) {
      oval(300, skyY, 19 * a, 19 * a, '#e9e4c4')
      oval(311, skyY - 8, 14 * a, 14 * a, STAGE)
    } else {
      const r = (big ? 26 : 21) * a
      for (let k = 0; k < 8; k++) {
        const angle = t * 0.4 + (k * Math.PI) / 4
        const reach = r + (big ? 14 + Math.sin(t * 4 + k) * 4 : 11)
        stroke([[300 + Math.cos(angle) * (r + 4), skyY + Math.sin(angle) * (r + 4)], [300 + Math.cos(angle) * reach, skyY + Math.sin(angle) * reach]], big ? '#ffb347' : '#ffd36b', 5)
      }
      oval(300, skyY, r, r, big ? '#ffb347' : '#ffd36b')
    }
    if (big) {
      // Heat shimmer rising along both edges.
      for (let k = 0; k < 4; k++) {
        const x = k < 2 ? 22 + k * 22 : 316 + (k - 2) * 22
        const points: Point[] = []
        for (let y = 330; y > Math.max(top + 90, 120); y -= 10) points.push([x + Math.sin(y * 0.08 - t * 4 + k) * 5, y - ((t * 30) % 10)])
        stroke(points, '#e9a36a', 5)
      }
    }
  }
  // Clouds: one light puff on a sunny day, darker drifting clouds otherwise.
  const clouds = w.kind === 'sunny' ? 1 : w.kind === 'hot' ? 0 : 3
  const tone = w.kind === 'rain' || w.kind === 'snow' ? '#7b8796' : w.kind === 'sunny' ? '#c9d3dd' : '#9aa8b8'
  for (let k = 0; k < clouds; k++) {
    const x = ((t * 6 + k * 150) % 470) - 55
    const y = skyY - 14 + k * 16
    oval(x, y, 34 * a, 14 * a, tone)
    oval(x + 23 * a, y - 10 * a, 20 * a, 15 * a, tone)
    oval(x - 21 * a, y + 2, 18 * a, 11 * a, tone)
  }
  // Precipitation starts under the clouds and falls the full height of the panel.
  const from = skyY
  const fall = 337 - from + 30
  if (w.kind === 'rain') {
    const drops = Math.round(46 * a * Math.max(1, height / 390))
    for (let k = 0; k < drops; k++) {
      const y = from + ((t * 300 + k * 53) % fall)
      const x = ((k * 47.9) % 380) - 10 + (y - from) * 0.12
      if (cover && x > cover.x - cover.rx && x < cover.x + cover.rx && y > cover.y - cover.ry) continue
      if (y > 322) {
        stroke([[x - 7, 335], [x, 326], [x + 7, 335]], '#8fb9e8', 3)
        continue
      }
      stroke([[x, y], [x - 3, y + 18]], '#8fb9e8', 4)
    }
    // Drips off the canopy edge.
    if (cover && cover.rx > 40) {
      for (const edge of [-1, 1]) oval(cover.x + edge * cover.rx, cover.y + ((t * 120 + (edge + 1) * 20) % 60), 3, 6, '#8fb9e8')
    }
  } else if (w.kind === 'snow') {
    const flakes = Math.round(30 * a * Math.max(1, height / 390))
    for (let k = 0; k < flakes; k++) {
      const y = from + ((t * 35 + k * 41) % fall)
      const x = ((k * 47.3) % 360) + Math.sin(t * 1.3 + k) * 14
      const r = 4 + (k % 3)
      oval(x, y, r, r, '#f4f8ff')
    }
  } else if (w.kind === 'windy') {
    const rows = Math.max(7, Math.round(7 * height / 390))
    for (let k = 0; k < rows; k++) {
      const y = from + 30 + ((k * 37) % (fall - 60))
      const x = ((t * 220 + k * 90) % 520) - 80
      stroke([[x, y], [x + 50 * a, y], [x + 62 * a, y - 6]], '#a9c4cf', 4)
    }
    for (let k = 0; k < 6; k++) {
      const x = ((t * 150 + k * 113) % 480) - 60
      const y = from + 40 + ((k * 53) % (fall - 80)) + Math.sin(t * 3 + k) * 18
      g.fillStyle = ['#c98f4a', '#9fbf6a', '#d8b24a'][k % 3]
      g.beginPath()
      g.ellipse(x, y, 11 * a, 6 * a, t * 4 + k, 0, Math.PI * 2)
      g.fill()
    }
  }
}

const GLYPH_FONT = "'Cascadia Mono', Consolas, monospace"
/**
 * ASCII cell in scene pixels and its glyph size. Coarser than the kit's 4x6
 * so the characters read clearly as ASCII; each cell averages its area, so
 * thin lines (mouth, brows) still show up as darker glyphs.
 */
const CELL_W = 5
const CELL_H = 7.5
const GLYPH_PX = 8.75

/**
 * One agent character: its own clock, blink and face. `step` advances it,
 * `paint` draws it onto a panel canvas of `width` x `height` CSS pixels.
 */
export class CharacterEngine {
  kind: CharacterKind
  state: CharacterState = 'idle'
  tired = false
  time = 0
  age = 0
  private blinkAt = 2.8
  private blinkAge = 10
  /** Pointer over the panel, in scene pixels (null when it is elsewhere). */
  private pointer: { x: number; y: number } | null = null
  private noticeAt = -10
  /** Where the scene sat in the panel on the last paint, to map pointer positions. */
  private layout = { scale: 1, ox: 0, oy: 0 }
  /** The sky being shown, the one asked for, and how far the shown one has faded in. */
  private weather: WeatherKind | null = null
  private weatherWanted: WeatherKind | null = null
  private weatherAmount = 0
  private night = false
  face: Face
  private readonly g: CanvasRenderingContext2D | null
  private readonly field: HTMLCanvasElement | null = typeof document === 'undefined' ? null : document.createElement('canvas')
  private readonly small: HTMLCanvasElement | null = typeof document === 'undefined' ? null : document.createElement('canvas')
  /** The weather sky (panel tall, behind the character) and its cell sample. */
  private readonly sky: HTMLCanvasElement | null = typeof document === 'undefined' ? null : document.createElement('canvas')
  private readonly skySmall: HTMLCanvasElement | null = typeof document === 'undefined' ? null : document.createElement('canvas')
  private fieldKey = ''
  private fieldTime = 0

  constructor(kind: CharacterKind) {
    this.kind = kind
    const src = document.createElement('canvas')
    src.width = SCENE_W
    src.height = SCENE_H
    this.g = src.getContext('2d', { willReadFrequently: true })
    this.face = faceTargets(this.state, 0)
  }

  /** Asks for a sky; the current one fades out first, then the new one fades in. */
  setWeather(kind: WeatherKind | null, night = false): void {
    this.weatherWanted = kind
    this.night = night
  }

  /** Follows a pointer at panel point (x, y) in CSS px with the eyes; null when it leaves. */
  setPointer(point: { x: number; y: number } | null): void {
    if (point && !this.pointer) this.noticeAt = this.time
    const { scale, ox, oy } = this.layout
    this.pointer = point ? { x: (point.x - ox) / scale, y: (point.y - oy) / scale } : null
  }

  /** A new state restarts its reaction (the jump, the flinch, the confetti). */
  setState(state: CharacterState, tired: boolean): void {
    if (state !== this.state) {
      this.state = state
      this.age = 0
      this.blinkAge = 10
    }
    this.tired = tired
  }

  /** Advances `dt` real seconds. Without motion the face snaps to its target. */
  step(dt: number, animate: boolean): void {
    if (animate) {
      const pace = this.state === 'working' && this.tired ? TIRED_PACE : 1
      this.time += dt * SPEED * pace
      this.age += dt * SPEED
      this.blinkAge += dt
      if (this.time > this.blinkAt) {
        this.blinkAge = 0
        // Tired eyes blink more often.
        this.blinkAt = this.time + (this.tired ? 2 : 3.2) + 1.1 * Math.sin(this.time * 0.73)
      }
    }
    if (this.weatherWanted !== this.weather) {
      this.weatherAmount = animate ? this.weatherAmount - dt * 1.2 : 0
      if (this.weatherAmount <= 0) {
        this.weather = this.weatherWanted
        this.weatherAmount = animate ? 0 : 1
      }
    } else if (this.weather) {
      this.weatherAmount = animate ? Math.min(1, this.weatherAmount + dt * 0.7) : 1
    }
    let target = faceTargets(this.state, this.time, this.tired)
    if (this.weather) target = weatherFace(target, this.state, this.weather, this.weatherAmount, this.time)
    // A sleeper keeps sleeping; everyone else looks at the pointer.
    if (this.pointer && this.state !== 'sleeping') target = lookToward(target, this.state, this.pointer, this.time - this.noticeAt)
    for (const key of Object.keys(target) as Array<keyof Face>) {
      this.face[key] = animate ? this.face[key] + (target[key] - this.face[key]) * EASE : target[key]
    }
  }

  /** Averages a layer into one sample per ASCII cell (area-filtered by the browser's downscale). */
  private sampleCells(source: HTMLCanvasElement | null, small: HTMLCanvasElement | null, height: number): Cells {
    const cols = Math.ceil(SCENE_W / CELL_W)
    const rows = Math.ceil(height / CELL_H)
    const s = small?.getContext('2d', { willReadFrequently: true })
    if (!source || !small || !s) return { data: new Uint8ClampedArray(cols * rows * 4), cols, rows }
    if (small.width !== cols || small.height !== rows) {
      small.width = cols
      small.height = rows
    }
    s.clearRect(0, 0, cols, rows)
    s.imageSmoothingEnabled = true
    s.imageSmoothingQuality = 'high'
    // The source rect may run past the layer's bottom edge; drawImage clips it proportionally.
    s.drawImage(source, 0, 0, cols * CELL_W, rows * CELL_H, 0, 0, cols, rows)
    return { data: s.getImageData(0, 0, cols, rows).data, cols, rows }
  }

  /**
   * Draws the sky layer from the panel's top edge down to the floor, on the
   * same glyph / pixel grid as the scene (its top is a multiple of both cell
   * heights above the scene), behind the character.
   */
  private paintSky(ctx: CanvasRenderingContext2D, style: CharacterStyle, canopy: Canopy | null, scale: number, ox: number, oy: number, width: number, fieldH: number): void {
    const sky = this.sky
    const s = sky?.getContext('2d', { willReadFrequently: true })
    if (!sky || !s || !this.weather) return
    const grid = 60 // lcm of the ASCII (7.5) and pixel (4) cell heights
    const top = -Math.ceil(oy / scale / grid) * grid
    const height = SCENE_H - top
    if (sky.width !== SCENE_W || sky.height !== height) {
      sky.width = SCENE_W
      sky.height = height
    }
    s.setTransform(1, 0, 0, 1, 0, 0)
    s.clearRect(0, 0, SCENE_W, height)
    s.setTransform(1, 0, 0, 1, 0, -top)
    drawSkyLayer(s, { kind: this.weather, amount: this.weatherAmount, night: this.night }, this.time, -oy / scale, canopy)
    const skyOy = oy + top * scale
    if (style === 'pixel') paintPixels(ctx, s.getImageData(0, 0, SCENE_W, height).data, height, scale, ox, skyOy)
    else paintAscii(ctx, this.sampleCells(sky, this.skySmall, height), scale, ox, skyOy, width, fieldH, this.time, 'scene')
  }

  paint(ctx: CanvasRenderingContext2D, width: number, height: number, style: CharacterStyle, caption: string[]): void {
    const g = this.g
    if (!g) return
    const notice = this.time - this.noticeAt
    const hop = this.pointer && this.state !== 'sleeping' && notice < NOTICE_S ? Math.sin((notice / NOTICE_S) * Math.PI) * 10 : 0
    const canopy = drawScene(g, { kind: this.kind, state: this.state, tired: this.tired, t: this.time, age: this.age, blinkAge: this.blinkAge, face: this.face, hop, weather: this.weather ? { kind: this.weather, amount: this.weatherAmount, night: this.night } : null })
    const pixels = style === 'pixel' ? g.getImageData(0, 0, SCENE_W, SCENE_H).data : null
    const cells = this.sampleCells(g.canvas, this.small, SCENE_H)
    // Contain-fit the scene, centered across and standing just above the caption.
    const captionH = caption.length ? 44 : 8
    const scale = Math.max(0.1, Math.min(width / SCENE_W, (height - captionH) / SCENE_H))
    const ox = (width - SCENE_W * scale) / 2
    const oy = Math.max(4, height - captionH - SCENE_H * scale)
    this.layout = { scale, ox, oy }
    ctx.clearRect(0, 0, width, height)
    // Both styles stand on the same faint ASCII field. It moves slowly, so it is
    // redrawn into its own layer at ~9 fps and copied in with one drawImage.
    const dpr = ctx.getTransform().a || 1
    const fieldH = height - captionH
    const key = `${width}|${fieldH}|${dpr}|${scale.toFixed(4)}|${ox.toFixed(2)}|${oy.toFixed(2)}`
    if (this.field && (key !== this.fieldKey || Math.abs(this.time - this.fieldTime) >= FIELD_STEP)) {
      this.fieldKey = key
      this.fieldTime = this.time
      this.field.width = Math.max(1, Math.round(width * dpr))
      this.field.height = Math.max(1, Math.round(fieldH * dpr))
      const f = this.field.getContext('2d')
      if (f) {
        f.setTransform(dpr, 0, 0, dpr, 0, 0)
        paintAscii(f, cells, scale, ox, oy, width, fieldH, this.time, 'field')
      }
    }
    if (this.field) ctx.drawImage(this.field, 0, 0, width, fieldH)
    if (this.weather && this.weatherAmount > 0) this.paintSky(ctx, style, canopy, scale, ox, oy, width, fieldH)
    if (pixels) paintPixels(ctx, pixels, SCENE_H, scale, ox, oy)
    else paintAscii(ctx, cells, scale, ox, oy, width, fieldH, this.time, 'scene')
    paintCaption(ctx, caption, width, height, CHARACTERS[this.kind].main)
  }
}

const rgbCache = new Map<number, string>()
function rgb(r: number, g: number, b: number): string {
  const key = (r << 16) | (g << 8) | b
  let value = rgbCache.get(key)
  if (!value) {
    value = `rgb(${r},${g},${b})`
    if (rgbCache.size > 4096) rgbCache.clear()
    rgbCache.set(key, value)
  }
  return value
}

/** True where the scene has something drawn at panel point (px, py). */
/** The scene averaged down to one RGBA sample per glyph cell. */
interface Cells {
  data: Uint8ClampedArray
  cols: number
  rows: number
}

/** Index into `cells` where the scene covers the glyph cell at panel point (px, py), else -1. */
function opaqueAt(cells: Cells, px: number, py: number, scale: number, ox: number, oy: number): number {
  const cx = Math.floor((px - ox) / scale / CELL_W)
  const cy = Math.floor((py - oy) / scale / CELL_H)
  if (cx < 0 || cx >= cells.cols || cy < 0 || cy >= cells.rows) return -1
  const k = (cy * cells.cols + cx) * 4
  return cells.data[k + 3] > 80 ? k : -1
}

/** Glyph grid over the whole panel, aligned with the scene's CELL_W x CELL_H cells. */
function glyphGrid(scale: number, ox: number, oy: number): { cw: number; ch: number; startX: number; startY: number } {
  const cw = CELL_W * scale
  const ch = CELL_H * scale
  return { cw, ch, startX: ox - Math.ceil(ox / cw) * cw + cw / 2, startY: oy - Math.ceil(oy / ch) * ch + ch / 2 }
}

/** Background field, by brightness (dim to dense) and the "code" glyphs that drift down. */
const FIELD_RAMP = '.:-=+*'
const CODE_GLYPHS = '01{}[]<>/=;:+*#$&|~'
const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * The ASCII layer: the kit's raster() for the scene (one glyph per
 * CELL_W x CELL_H scene pixels, luminance picks `. + x # @`, color kept) when `scene` is set, and a faint
 * field across the whole panel: a slow brightness wave plus sparse columns
 * of code glyphs drifting down. The field only fills cells the scene leaves
 * empty and fades around the character, so it never covers the animation.
 *
 * Thousands of single-glyph fillText calls were the main paint cost, so each
 * row is drawn as one string per color/opacity, spaced onto the grid with
 * letterSpacing (monospace glyphs, no kerning).
 */
function paintAscii(ctx: CanvasRenderingContext2D, cells: Cells, scale: number, ox: number, oy: number, width: number, height: number, time: number, layer: 'field' | 'scene'): void {
  const { cw, ch, startX, startY } = glyphGrid(scale, ox, oy)
  ctx.font = `${(GLYPH_PX * scale).toFixed(2)}px ${GLYPH_FONT}`
  ctx.fontKerning = 'none'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const advance = ctx.measureText('M').width
  ctx.letterSpacing = `${(cw - advance).toFixed(3)}px`
  const x0 = startX - advance / 2
  const cols = Math.max(0, Math.ceil((width - startX) / cw))
  // Colors snap to 16 levels per channel and opacity to 20 steps, so a row has few runs.
  const snap = (v: number): number => (v & 0xf0) | 0x08
  // The character's middle in panel space; the field quiets down around it.
  const fx = ox + 170 * scale
  const fy = oy + 230 * scale
  const quiet = 120 * scale
  const rows = Math.ceil(height / ch) + 1
  const heads: number[] = []
  for (let col = 0; col < cols; col++) {
    // About one column in four carries a code trail, each at its own speed.
    heads.push(hash(col) < 0.24 ? (time * (1.5 + hash(col + 50) * 2.5) + hash(col + 99) * rows * 3) % (rows * 2.2) : -99)
  }
  const runs = new Map<string, { color: string; alpha: number; chars: string[] }>()
  const put = (color: string, level: number, col: number, glyph: string): void => {
    if (level <= 0) return
    const key = `${color}|${level}`
    let run = runs.get(key)
    if (!run) runs.set(key, (run = { color, alpha: level / 20, chars: new Array<string>(cols).fill(' ') }))
    run.chars[col] = glyph
  }
  let row = 0
  let runStart = -1
  const masks: Array<[number, number, number, number]> = []
  const texts: Array<[number, string, string, number]> = []
  for (let py = startY; py < height; py += ch, row++) {
    runs.clear()
    runStart = -1
    for (let col = 0; col < cols; col++) {
      const px = startX + col * cw
      const k = layer === 'scene' ? opaqueAt(cells, px, py, scale, ox, oy) : -1
      if (layer === 'scene') {
        if (k < 0) {
          runStart = -1
          continue
        }
        // The field layer underneath is masked cell by cell, merged into row runs.
        if (runStart < 0) runStart = col
        if (col === cols - 1 || opaqueAt(cells, px + cw, py, scale, ox, oy) < 0) {
          masks.push([x0 + runStart * cw - (cw - advance) / 2, py - ch / 2, (col - runStart + 1) * cw, ch])
          runStart = -1
        }
        const r = cells.data[k]
        const g = cells.data[k + 1]
        const b = cells.data[k + 2]
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
        put(rgb(snap(r), snap(g), snap(b)), 20, col, lum > 195 ? '@' : lum > 140 ? '#' : lum > 95 ? 'x' : lum > 45 ? '+' : '.')
        continue
      }
      const wx = (px - ox) / scale
      const wy = (py - oy) / scale
      const f = (Math.sin(wx * 0.045 + wy * 0.035 - time * 0.25) + Math.cos(wy * 0.075 - time * 0.14) + 2) / 4
      const d = Math.hypot((px - fx) * 0.8, py - fy)
      const focus = 0.35 + 0.65 * Math.min(1, Math.max(0, (d - quiet * 0.55) / quiet))
      const trail = heads[col] - row
      if (trail >= 0 && trail < 7) {
        // Brightest at the head, fading up the trail; glyphs change as it moves.
        const glyph = CODE_GLYPHS[Math.floor(hash(col * 31 + row + Math.floor(time * 3)) * CODE_GLYPHS.length)]
        put(trail < 1 ? '#b9e6cf' : '#7fbfa6', Math.round((0.5 - trail * 0.055) * focus * 20), col, glyph)
      } else {
        put('#86a9ba', Math.round((0.11 + 0.17 * f) * focus * 20), col, FIELD_RAMP[Math.min(FIELD_RAMP.length - 1, Math.floor(f * f * FIELD_RAMP.length * 1.2))])
      }
    }
    for (const run of runs.values()) texts.push([run.alpha, run.color, run.chars.join(''), py])
  }
  // Masks first, so a row's mask never clips the glyphs of the row above.
  ctx.fillStyle = STAGE
  for (const [x, y, w, h] of masks) ctx.fillRect(x, y, w, h)
  for (const [alpha, color, text, y] of texts) {
    ctx.globalAlpha = alpha
    ctx.fillStyle = color
    ctx.fillText(text, x0, y)
  }
  ctx.globalAlpha = 1
  ctx.letterSpacing = '0px'
}

/** Square blocks on a 4x4 scene-pixel grid, colors snapped to a short ramp for a pixel-art look. */
function paintPixels(ctx: CanvasRenderingContext2D, pixels: Uint8ClampedArray, height: number, scale: number, ox: number, oy: number): void {
  const cell = 4
  const size = cell * scale
  const snap = (v: number): number => Math.min(255, Math.round(v / 24) * 24)
  for (let sy = 0; sy < height; sy += cell) {
    for (let sx = 0; sx < SCENE_W; sx += cell) {
      // Sample the block center, clamped inside the layer (the last row would read past it).
      const k = (Math.min(sy + 2, height - 1) * SCENE_W + Math.min(sx + 2, SCENE_W - 1)) * 4
      if (pixels[k + 3] <= 80) continue
      ctx.fillStyle = rgb(snap(pixels[k]), snap(pixels[k + 1]), snap(pixels[k + 2]))
      // +0.5 closes hairline gaps between blocks at fractional scales.
      ctx.fillRect(Math.floor(ox + sx * scale), Math.floor(oy + sy * scale), Math.ceil(size) + 0.5, Math.ceil(size) + 0.5)
    }
  }
}

/** Two short lines under the character: the state label and what it is about. */
function paintCaption(ctx: CanvasRenderingContext2D, caption: string[], width: number, height: number, accent: string): void {
  if (!caption.length) return
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const fit = (text: string): string => {
    if (ctx.measureText(text).width <= width - 16) return text
    let cut = text
    while (cut.length > 1 && ctx.measureText(`${cut}...`).width > width - 16) cut = cut.slice(0, -1)
    return `${cut}...`
  }
  ctx.font = `bold 11px ${GLYPH_FONT}`
  ctx.fillStyle = accent
  ctx.fillText(fit(caption[0]), width / 2, height - 26)
  if (caption[1]) {
    ctx.font = `11px ${GLYPH_FONT}`
    ctx.fillStyle = '#d5d4c8'
    ctx.fillText(fit(caption[1]), width / 2, height - 10)
  }
}

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import type { AgentEvent } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentEventStore } from '../store/agentEventStore'
import { useToastStore } from '../store/toastStore'
import { motionEnabled } from '../motion'
import { companionCaption, companionEnergy, companionMood, renderCompanion, type CompanionColor, type CompanionFrame, type CompanionMood } from './companionFrames'
import { lastInputAt, latestRate } from '../fun/outputMeter'
import { PIXEL_PALETTE, critterRamp, renderScene, sceneFor, type PixelColor, type PixelFrame } from './companionScenes'

/** ~15 fps: smooth enough for the glide, still a retro character-art cadence. */
const FRAME_MS = 66
/** Animation time advances in ~110 ms ticks (see companionFrames). */
const TICKS_PER_FRAME = FRAME_MS / 110
/** The character keeps listening this long after your last keystroke. */
const LISTEN_MS = 1500

type Rgb = [number, number, number]

function parseRgb(color: string, fallback: Rgb = [217, 119, 87]): Rgb {
  const hex = color.trim().match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb
  const match = color.match(/\d+(\.\d+)?/g)
  return match && match.length >= 3 ? [Number(match[0]), Number(match[1]), Number(match[2])] : fallback
}

/** `amount` of the way from `from` toward `to`. */
function mixRgb(from: Rgb, to: Rgb, amount: number): string {
  const [r, g, b] = from.map((v, i) => Math.round(v + (to[i] - v) * amount))
  return `rgb(${r}, ${g}, ${b})`
}

const WHITE: Rgb = [255, 255, 255]

// ---- ASCII face on a canvas ----

const FACE_FONT_PX = 9
const FACE_FONT = `${FACE_FONT_PX}px 'Cascadia Mono', Consolas, 'Courier New', monospace`

/** Theme-aware colors for every CompanionColor, resolved once per measure. */
function facePalette(canvas: HTMLCanvasElement): Record<CompanionColor, string> {
  const root = getComputedStyle(document.documentElement)
  const css = (name: string, fallback: string): string => root.getPropertyValue(name).trim() || fallback
  const body = parseRgb(getComputedStyle(canvas).color)
  const bg = parseRgb(css('--terminal-background', '#1e1e1e'), [30, 30, 30])
  const muted = parseRgb(css('--tab-inactive-foreground', '#8b8b8b'), [139, 139, 139])
  return {
    bg: mixRgb(bg, muted, 0.38),
    v: mixRgb(bg, body, 0.22),
    b0: mixRgb(bg, body, 0.4),
    b1: mixRgb(bg, body, 0.62),
    b2: mixRgb(bg, body, 0.82),
    b3: `rgb(${body.join(', ')})`,
    b4: mixRgb(body, WHITE, 0.3),
    glow: mixRgb(body, WHITE, 0.55),
    eye: '#ffffff',
    white: css('--term-bright-white', '#ffffff'),
    red: css('--term-bright-red', '#f14c4c'),
    green: css('--term-bright-green', '#23d18b'),
    yellow: css('--term-bright-yellow', '#f5f543'),
    blue: css('--term-bright-blue', '#3b8eea'),
    magenta: css('--term-bright-magenta', '#d670d6'),
    cyan: css('--term-bright-cyan', '#29b8db')
  }
}

/**
 * Draws an ASCII frame with one fillText per glyph, batched by color so the
 * fill style changes only a few times. Glowing cells (eyes, brows, mouth) get
 * a soft shadow in a second pass; nothing else pays for it.
 */
function paintFace(canvas: HTMLCanvasElement, frame: CompanionFrame, cellW: number, cellH: number, palette: Record<CompanionColor, string>, glow: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.font = FACE_FONT
  ctx.textBaseline = 'top'
  const byColor = new Map<CompanionColor, Array<[string, number, number]>>()
  frame.lines.forEach((line, row) => {
    for (let col = 0; col < line.length; col++) {
      const ch = line[col]
      if (ch === ' ') continue
      const color = frame.colors[row][col]
      let list = byColor.get(color)
      if (!list) byColor.set(color, (list = []))
      list.push([ch, col * cellW, row * cellH])
    }
  })
  for (const [color, cells] of byColor) {
    const glowing = color === 'glow' || color === 'eye'
    ctx.shadowBlur = glowing ? 6 : 0
    ctx.shadowColor = glowing ? glow : 'transparent'
    ctx.fillStyle = palette[color]
    for (const [ch, x, y] of cells) ctx.fillText(ch, x, y)
  }
  ctx.shadowBlur = 0
}

// ---- Pixel scenes on a canvas ----

/** Scene pixels across the panel width; each one becomes a square block. */
const SCENE_COLUMNS = 64

/** Splits `text` into lines no wider than `maxWidth` pixels. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

function paintScene(canvas: HTMLCanvasElement, frame: PixelFrame, scale: number, body: string): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rgb = parseRgb(body)
  // The critter's hue-shifted ramp in the agent's color (pixel-art-studio's ramp()).
  const { ramp, line } = critterRamp(rgb)
  const colors: Record<PixelColor, string> = {
    ...PIXEL_PALETTE,
    r0: ramp[0], r1: ramp[1], r2: ramp[2], r3: ramp[3], r4: ramp[4], line,
    body: ramp[2], bodyHi: ramp[3], bodyLo: ramp[1]
  }
  const dpr = window.devicePixelRatio || 1
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // Pixels, merged into horizontal runs to keep the draw calls down.
  for (let y = 0; y < frame.height; y++) {
    let start = 0
    for (let x = 1; x <= frame.width; x++) {
      const current = frame.pixels[y * frame.width + start]
      if (x < frame.width && frame.pixels[y * frame.width + x] === current) continue
      if (current) {
        ctx.fillStyle = colors[current]
        ctx.fillRect(start * scale, y * scale, (x - start) * scale + 0.5, scale + 0.5)
      }
      start = x
    }
  }
  const width = frame.width * scale
  ctx.textBaseline = 'top'
  for (const text of frame.texts) {
    const x = text.x * scale
    const y = text.y * scale
    if (text.kind === 'bubble') {
      ctx.font = `12px 'Cascadia Mono', Consolas, monospace`
      const lines = wrap(ctx, text.text, Math.min(width - 24, 260))
      const lineH = 15
      const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16
      const boxH = lines.length * lineH + 10
      const left = Math.max(6, Math.min(width - boxW - 6, x - boxW / 2))
      const top = Math.max(6, y - boxH)
      ctx.fillStyle = 'rgba(14, 14, 20, 0.92)'
      ctx.fillRect(left, top, boxW, boxH)
      ctx.strokeStyle = colors.body
      ctx.lineWidth = 1
      ctx.strokeRect(left + 0.5, top + 0.5, boxW - 1, boxH - 1)
      // Tail pointing down at the critter.
      ctx.fillStyle = colors.body
      ctx.fillRect(Math.max(left + 6, Math.min(left + boxW - 10, x)), top + boxH, 2, 6)
      ctx.fillStyle = '#f4f4f4'
      lines.forEach((line, i) => ctx.fillText(line, left + 8, top + 5 + i * lineH))
    } else {
      ctx.font = text.kind === 'label' ? `11px 'Cascadia Mono', Consolas, monospace` : `bold 13px 'Cascadia Mono', Consolas, monospace`
      ctx.fillStyle = colors[text.color ?? 'white']
      ctx.textAlign = 'center'
      ctx.fillText(text.text, x, y)
      ctx.textAlign = 'start'
    }
  }
}

/**
 * Agent animation docked to the right of an agent terminal, in one of two
 * styles: an ASCII face whose eyes mirror the agent's state, or pixel scenes
 * that act out what the agent is doing. Both are painted on one canvas on a
 * timer (no React render per frame), and the timer only runs while the pane
 * is visible, the window is shown and motion is enabled.
 */
export function AgentCompanion({ tabId, visible }: { tabId: string; visible: boolean }): React.JSX.Element | null {
  const tab = useTerminalStore((state) => state.tabs.find((item) => item.id === tabId))
  const settings = useSettingsStore((state) => state.settings)
  const latestEvent = useAgentEventStore((state) => {
    for (let index = state.events.length - 1; index >= 0; index -= 1) {
      if (state.events[index].tabId === tabId) return state.events[index]
    }
    return undefined
  })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const captionRef = useRef<HTMLSpanElement>(null)
  // Read on every frame, so a new event changes the scene without restarting it.
  const eventRef = useRef<AgentEvent | undefined>(latestEvent)
  eventRef.current = latestEvent

  const profile = tab ? mergeProfiles(settings.profiles).find((item) => item.id === tab.profileId) : undefined
  const provider = tab ? providerFromProfileId(settings, tab.profileId) : undefined
  const isAgent = !!provider || !!profile?.startupCommand
  // The character is drawn in the agent's own color (Claude orange, Codex blue, ...).
  const bodyColor = profile?.color || provider?.color || 'var(--accent-color)'
  const enabled = settings.agentCompanion && isAgent
  const style = settings.agentAnimationStyle
  const mood: CompanionMood = tab ? companionMood(tab.running, tab.activity) : 'sleeping'
  const animate = enabled && visible && motionEnabled(settings.motion)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!enabled || !canvas) return
    // Every mood starts from its first frame, so each reaction plays afresh.
    let tick = 0
    let disposed = false
    let paint = (): void => undefined
    const measure = (): void => {
      const box = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(box.width * dpr))
      canvas.height = Math.max(1, Math.round(box.height * dpr))
      // The canvas CSS color is the agent color (red while angry), resolved here.
      const body = getComputedStyle(canvas).color
      if (style === 'scenes') {
        const scale = Math.max(3, box.width / SCENE_COLUMNS)
        const columns = Math.floor(box.width / scale)
        const rows = Math.ceil(box.height / scale)
        paint = () => {
          const event = eventRef.current
          const listening = Date.now() - lastInputAt(tabId) < LISTEN_MS
          paintScene(canvas, renderScene(sceneFor(mood, event), tick, columns, rows, event, listening), scale, body)
        }
        return
      }
      // Cell metrics come from the real font, so the aspect correction is exact.
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.font = FACE_FONT
      const cellW = (ctx?.measureText('MMMMMMMMMM').width ?? FACE_FONT_PX * 6) / 10 || FACE_FONT_PX * 0.6
      const cellH = FACE_FONT_PX
      const cols = Math.max(8, Math.floor(box.width / cellW))
      const rows = Math.max(6, Math.floor(box.height / cellH))
      const palette = facePalette(canvas)
      paint = () => {
        const listening = Date.now() - lastInputAt(tabId) < LISTEN_MS
        paintFace(canvas, renderCompanion(mood, tick, cols, rows, cellH / cellW, listening), cellW, cellH, palette, body)
        if (captionRef.current) captionRef.current.textContent = companionCaption(mood, tick, listening)
      }
    }
    measure()
    paint()
    // Re-measure once the monospace font has loaded (it settles the cell
    // metrics) and whenever the panel resizes.
    void document.fonts?.ready.then(() => {
      if (disposed) return
      measure()
      paint()
    })
    const observer = new ResizeObserver(() => {
      measure()
      paint()
    })
    observer.observe(canvas)
    if (!animate) {
      return () => {
        disposed = true
        observer.disconnect()
      }
    }
    const timer = window.setInterval(() => {
      if (document.hidden) return
      // Busier output, livelier animation (only while the agent works).
      tick += TICKS_PER_FRAME * (mood === 'working' ? companionEnergy(latestRate(tabId)) : 1)
      paint()
    }, FRAME_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
      observer.disconnect()
    }
  }, [enabled, animate, mood, style, bodyColor, tabId])

  if (!enabled) return null

  const hide = (): void => {
    void useSettingsStore.getState().update({ agentCompanion: false })
    useToastStore.getState().show('Agent animation hidden. Turn it back on in Settings > Appearance.', 'info')
  }

  return (
    <aside
      className={`agent-companion agent-companion-${mood} agent-companion-${style}`}
      style={{ '--companion-body': bodyColor } as React.CSSProperties}
      aria-label="Agent status animation"
    >
      <button className="agent-companion-close" type="button" onClick={hide} title="Hide agent animation" aria-label="Hide agent animation">
        <X size={12} />
      </button>
      {/* Keyed by style so switching styles starts from a fresh canvas. */}
      <canvas key={style} ref={canvasRef} className="agent-companion-canvas" aria-hidden="true" />
      {/* Not a live region: the spinner changes every few frames and must not be read out. */}
      {style === 'face' && (
        <div className="agent-companion-caption">
          <span ref={captionRef} />
          {mood === 'working' && latestEvent?.title && <small title={latestEvent.title}>{latestEvent.title}</small>}
        </div>
      )}
    </aside>
  )
}

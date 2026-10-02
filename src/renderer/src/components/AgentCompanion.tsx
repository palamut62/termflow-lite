import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import type { AgentEvent } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentEventStore } from '../store/agentEventStore'
import { useToastStore } from '../store/toastStore'
import { motionEnabled } from '../motion'
import { companionCaption, companionMood, renderCompanion, type CompanionFrame, type CompanionMood } from './companionFrames'
import { PIXEL_PALETTE, renderScene, sceneFor, type PixelColor, type PixelFrame } from './companionScenes'

const FRAME_MS = 110

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

/** One ASCII frame as HTML: runs of same-colored cells become one span each. */
function frameHtml({ lines, colors }: CompanionFrame): string {
  return lines.map((line, row) => {
    const chars = Array.from(line)
    let html = ''
    let start = 0
    for (let i = 1; i <= chars.length; i++) {
      if (i < chars.length && colors[row][i] === colors[row][start]) continue
      const text = chars.slice(start, i).join('').replace(/[&<>]/g, (ch) => ESCAPES[ch])
      html += text.trim() ? `<span class="cc-${colors[row][start]}">${text}</span>` : text
      start = i
    }
    return html
  }).join('\n')
}

/** Grid size that fills the panel, from the <pre>'s font metrics. */
function measureGrid(pre: HTMLPreElement): { cols: number; rows: number; aspect: number } {
  const style = getComputedStyle(pre)
  const ctx = document.createElement('canvas').getContext('2d')
  let charW = parseFloat(style.fontSize) * 0.6
  if (ctx) {
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    charW = ctx.measureText('MMMMMMMMMM').width / 10 || charW
  }
  const lineH = parseFloat(style.lineHeight) || parseFloat(style.fontSize)
  const box = pre.getBoundingClientRect()
  return { cols: Math.max(8, Math.floor(box.width / charW)), rows: Math.max(6, Math.floor(box.height / lineH)), aspect: lineH / charW }
}

// ---- Pixel scenes on a canvas ----

/** Scene pixels across the panel width; each one becomes a square block. */
const SCENE_COLUMNS = 64

function parseRgb(color: string): [number, number, number] {
  const match = color.match(/\d+(\.\d+)?/g)
  return match && match.length >= 3 ? [Number(match[0]), Number(match[1]), Number(match[2])] : [217, 119, 87]
}

function mix(rgb: [number, number, number], target: number, amount: number): string {
  const [r, g, b] = rgb.map((v) => Math.round(v + (target - v) * amount))
  return `rgb(${r}, ${g}, ${b})`
}

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
  const colors: Record<PixelColor, string> = { ...PIXEL_PALETTE, body: `rgb(${rgb.join(', ')})`, bodyHi: mix(rgb, 255, 0.35), bodyLo: mix(rgb, 0, 0.3) }
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
 * that act out what the agent is doing. Frames are painted straight into the
 * DOM on a timer (no React render per frame), and the timer only runs while
 * the pane is visible, the window is shown and motion is enabled.
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
  const artRef = useRef<HTMLPreElement>(null)
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
    if (!enabled) return
    const pre = artRef.current
    const canvas = canvasRef.current
    if (style === 'scenes' ? !canvas : !pre) return
    // Every mood starts from its first frame, so each reaction plays afresh.
    let tick = 0
    let paint = (): void => undefined
    const measure = (): void => {
      if (canvas && style === 'scenes') {
        const box = canvas.getBoundingClientRect()
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.max(1, Math.round(box.width * dpr))
        canvas.height = Math.max(1, Math.round(box.height * dpr))
        const scale = Math.max(3, box.width / SCENE_COLUMNS)
        const columns = Math.floor(box.width / scale)
        const rows = Math.ceil(box.height / scale)
        // The canvas CSS color is the agent color, resolved to rgb here.
        const body = getComputedStyle(canvas).color
        paint = () => {
          const event = eventRef.current
          paintScene(canvas, renderScene(sceneFor(mood, event), tick, columns, rows, event), scale, body)
        }
      } else if (pre) {
        const grid = measureGrid(pre)
        paint = () => {
          // Built only from the fixed glyph set in companionFrames, and escaped anyway.
          pre.innerHTML = frameHtml(renderCompanion(mood, tick, grid.cols, grid.rows, grid.aspect))
          if (captionRef.current) captionRef.current.textContent = companionCaption(mood, tick)
        }
      }
    }
    measure()
    paint()
    // The animation always fills the panel, so it is re-measured when the panel resizes.
    const host = (style === 'scenes' ? canvas : pre) as Element
    const observer = new ResizeObserver(() => {
      measure()
      paint()
    })
    observer.observe(host)
    if (!animate) return () => observer.disconnect()
    const timer = window.setInterval(() => {
      if (document.hidden) return
      tick += 1
      paint()
    }, FRAME_MS)
    return () => {
      window.clearInterval(timer)
      observer.disconnect()
    }
  }, [enabled, animate, mood, style, bodyColor])

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
      {style === 'scenes'
        ? <canvas ref={canvasRef} className="agent-companion-canvas" aria-hidden="true" />
        : <pre ref={artRef} className="agent-companion-art" aria-hidden="true" />}
      {style === 'face' && (
        <div className="agent-companion-caption" role="status">
          <span ref={captionRef} />
          {mood === 'working' && latestEvent?.title && <small title={latestEvent.title}>{latestEvent.title}</small>}
        </div>
      )}
    </aside>
  )
}

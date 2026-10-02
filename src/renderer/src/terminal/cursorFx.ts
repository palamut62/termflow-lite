import type { IDisposable, Terminal } from '@xterm/xterm'
import type { CursorEffect } from '../../../shared/types'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

interface Streak {
  from: Rect
  to: Rect
  start: number
}

const DURATION: Record<Exclude<CursorEffect, 'none'>, number> = { trail: 170, blaze: 260 }
/** Bu süre içinde bu kadar imleç hareketi = yoğun çıktı; efekt kısa süre susar. */
const FLOOD_WINDOW_MS = 120
const FLOOD_MOVES = 6
const FLOOD_COOLDOWN_MS = 400

/**
 * İmleç hareket efekti: xterm ekranının üstünde saydam bir canvas. Gerçek
 * imleç xterm'de kalır (yanıp sönme, stil, odak hali bozulmaz); burada yalnızca
 * eski konumdan yeni konuma kısa ömürlü bir iz çizilir. rAF yalnızca bir iz
 * yaşarken döner, yoğun çıktıda (build log, cat) efekt otomatik kısılır.
 */
export class CursorFx implements IDisposable {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly subs: IDisposable[] = []
  private streaks: Streak[] = []
  private last: Rect | null = null
  private frame = 0
  private moves: number[] = []
  private quietUntil = 0

  constructor(
    private readonly term: Terminal,
    private readonly read: () => { effect: CursorEffect; color: string; enabled: boolean }
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'cursor-fx'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.ctx = this.canvas.getContext('2d')
    this.screen()?.appendChild(this.canvas)
    this.subs.push(term.onCursorMove(() => this.onMove()))
    this.subs.push(term.onScroll(() => (this.last = null)))
    this.subs.push(term.onResize(() => (this.last = null)))
  }

  private screen(): HTMLElement | null {
    return this.term.element?.querySelector<HTMLElement>('.xterm-screen') ?? null
  }

  private cursorRect(): Rect | null {
    const screen = this.screen()
    if (!screen || this.term.cols === 0 || this.term.rows === 0) return null
    const buf = this.term.buffer.active
    const row = buf.cursorY + buf.baseY - buf.viewportY
    if (row < 0 || row >= this.term.rows) return null
    const cw = screen.clientWidth / this.term.cols
    const ch = screen.clientHeight / this.term.rows
    return { x: buf.cursorX * cw, y: row * ch, w: cw, h: ch }
  }

  private onMove(): void {
    const { effect, enabled } = this.read()
    const next = this.cursorRect()
    const prev = this.last
    this.last = next
    if (!enabled || effect === 'none' || !next || !prev) return
    const now = performance.now()
    this.moves = this.moves.filter((t) => now - t < FLOOD_WINDOW_MS)
    this.moves.push(now)
    if (this.moves.length > FLOOD_MOVES) this.quietUntil = now + FLOOD_COOLDOWN_MS
    if (now < this.quietUntil) {
      this.streaks = []
      return
    }
    if (prev.x === next.x && prev.y === next.y) return
    this.streaks.push({ from: prev, to: next, start: now })
    if (this.streaks.length > 4) this.streaks.shift()
    if (!this.frame) this.frame = requestAnimationFrame(this.draw)
  }

  private readonly draw = (): void => {
    this.frame = 0
    const ctx = this.ctx
    const screen = this.screen()
    if (!ctx || !screen) return
    const dpr = window.devicePixelRatio || 1
    const w = screen.clientWidth
    const h = screen.clientHeight
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr)
      this.canvas.height = Math.round(h * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const { effect, color } = this.read()
    if (effect === 'none') {
      this.streaks = []
      return
    }
    const duration = DURATION[effect]
    const now = performance.now()
    this.streaks = this.streaks.filter((s) => now - s.start < duration)
    for (const s of this.streaks) {
      const t = (now - s.start) / duration
      const fade = 1 - t * t
      if (effect === 'trail') this.drawTrail(ctx, s, fade, color)
      else this.drawBlaze(ctx, s, fade, t, color)
    }
    if (this.streaks.length) this.frame = requestAnimationFrame(this.draw)
  }

  /** Eski ve yeni imleç kutusunu birleştiren dörtgen; kuyruk ucu incelir. */
  private quad(s: Streak, shrink: number): [number, number][] {
    const { from: a, to: b } = s
    const cx = a.x + a.w / 2
    const cy = a.y + a.h / 2
    const tw = (a.w / 2) * shrink
    const th = (a.h / 2) * shrink
    // Hareket yönüne göre kuyruk ve baş kenarlarını seç.
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) {
      return b.y > a.y
        ? [[cx - tw, cy], [cx + tw, cy], [b.x + b.w, b.y], [b.x, b.y]]
        : [[cx - tw, cy], [cx + tw, cy], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]
    }
    return b.x > a.x
      ? [[cx, cy - th], [cx, cy + th], [b.x, b.y + b.h], [b.x, b.y]]
      : [[cx, cy - th], [cx, cy + th], [b.x + b.w, b.y + b.h], [b.x + b.w, b.y]]
  }

  private fillQuad(ctx: CanvasRenderingContext2D, points: [number, number][]): void {
    ctx.beginPath()
    ctx.moveTo(points[0][0], points[0][1])
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y)
    ctx.closePath()
    ctx.fill()
  }

  private drawTrail(ctx: CanvasRenderingContext2D, s: Streak, fade: number, color: string): void {
    ctx.globalAlpha = 0.35 * fade
    ctx.fillStyle = color
    this.fillQuad(ctx, this.quad(s, 0.6))
    ctx.globalAlpha = 1
  }

  private drawBlaze(ctx: CanvasRenderingContext2D, s: Streak, fade: number, t: number, color: string): void {
    const { from: a, to: b } = s
    const grad = ctx.createLinearGradient(a.x + a.w / 2, a.y + a.h / 2, b.x + b.w / 2, b.y + b.h / 2)
    grad.addColorStop(0, 'transparent')
    grad.addColorStop(1, color)
    ctx.save()
    ctx.globalAlpha = 0.75 * fade
    ctx.shadowColor = color
    ctx.shadowBlur = 14 * fade
    ctx.fillStyle = grad
    this.fillQuad(ctx, this.quad(s, 0.25 + 0.5 * (1 - t)))
    // Varış noktasında kısa bir parlama.
    ctx.globalAlpha = 0.45 * fade
    ctx.fillStyle = color
    ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2)
    ctx.restore()
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    for (const sub of this.subs) sub.dispose()
    this.canvas.remove()
  }
}

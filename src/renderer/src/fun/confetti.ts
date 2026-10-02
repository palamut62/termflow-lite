/** Test/build komutu başarıyla bitince kısa konfeti patlaması (isteğe bağlı). */

const CELEBRATE_RE = /\b(test|tests|jest|vitest|pytest|mocha|playwright|cargo\s+(test|build)|go\s+(test|build)|(npm|pnpm|yarn|bun)\s+(run\s+)?(test|build|verify)|make|gradle|mvn|dotnet\s+(test|build)|tsc)\b/i
const MIN_MS = 1500
const DURATION = 1100
const COUNT = 70

export function shouldCelebrate(command: string, exitCode: number, durationMs: number): boolean {
  return exitCode === 0 && durationMs >= MIN_MS && CELEBRATE_RE.test(command)
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  color: string
  w: number
  h: number
}

export function burstConfetti(host: HTMLElement): void {
  const rect = host.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return
  const canvas = document.createElement('canvas')
  canvas.className = 'confetti-layer'
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * dpr)
  canvas.height = Math.round(rect.height * dpr)
  Object.assign(canvas.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` })
  document.body.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    return
  }
  ctx.scale(dpr, dpr)
  const css = getComputedStyle(document.documentElement)
  const palette = ['--term-green', '--term-yellow', '--term-blue', '--term-magenta', '--term-cyan', '--accent-color']
    .map((name) => css.getPropertyValue(name).trim())
    .filter(Boolean)
  const particles: Particle[] = Array.from({ length: COUNT }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.6
    const speed = 5 + Math.random() * 7
    return {
      x: rect.width / 2 + (Math.random() - 0.5) * rect.width * 0.3,
      y: rect.height * 0.85,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: palette[Math.floor(Math.random() * palette.length)] ?? '#4ec9b0',
      w: 4 + Math.random() * 4,
      h: 2 + Math.random() * 3
    }
  })
  const start = performance.now()
  const frame = (now: number): void => {
    const t = (now - start) / DURATION
    ctx.clearRect(0, 0, rect.width, rect.height)
    if (t >= 1) {
      canvas.remove()
      return
    }
    ctx.globalAlpha = 1 - t * t
    for (const p of particles) {
      p.vy += 0.28
      p.vx *= 0.985
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vr
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.rot)
      ctx.fillStyle = p.color
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
}

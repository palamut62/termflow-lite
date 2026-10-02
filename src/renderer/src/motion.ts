import type { MotionLevel } from '../../shared/types'

/** Sistemin "reduce motion" tercihi her zaman ayarın önüne geçer. */
export function effectiveMotion(level: MotionLevel): MotionLevel {
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return 'off'
  return level
}

export function motionEnabled(level: MotionLevel): boolean {
  return effectiveMotion(level) !== 'off'
}

/** Kısa view transition; desteklenmiyorsa ya da hareket kapalıysa doğrudan uygular. */
export function withViewTransition(level: MotionLevel, apply: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  if (!motionEnabled(level) || typeof doc.startViewTransition !== 'function') {
    apply()
    return
  }
  doc.startViewTransition(apply)
}

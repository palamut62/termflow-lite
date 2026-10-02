import { describe, expect, it } from 'vitest'
import { restoredBounds, widgetBounds, WIDGET_COLLAPSED_HEIGHT, WIDGET_HEIGHT, WIDGET_MARGIN, WIDGET_WIDTH } from './widget'

const primary = { x: 0, y: 0, width: 1920, height: 1040 }
const second = { x: 1920, y: 0, width: 1280, height: 1000 }

describe('widgetBounds', () => {
  it('opens 16 px in from the top-right corner of the primary work area', () => {
    expect(widgetBounds([primary], primary, null, false)).toEqual({
      x: 1920 - WIDGET_WIDTH - WIDGET_MARGIN, y: WIDGET_MARGIN, width: WIDGET_WIDTH, height: WIDGET_HEIGHT
    })
  })

  it('collapses to a single 40 px line', () => {
    expect(widgetBounds([primary], primary, null, true).height).toBe(WIDGET_COLLAPSED_HEIGHT)
  })

  it('returns to where the user dragged it, on any monitor', () => {
    expect(widgetBounds([primary, second], primary, { x: 2000, y: 300 }, false)).toMatchObject({ x: 2000, y: 300 })
  })

  it('falls back to the primary corner when that monitor is gone', () => {
    expect(widgetBounds([primary], primary, { x: 2000, y: 300 }, false)).toMatchObject({ x: 1920 - WIDGET_WIDTH - WIDGET_MARGIN, y: WIDGET_MARGIN })
  })

  it('never sticks out of the work area', () => {
    const bounds = widgetBounds([primary], primary, { x: 1900, y: 1030 }, false)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1920)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(1040)
  })

  it('shrinks to a small screen but keeps its minimum width', () => {
    const small = { x: 0, y: 0, width: 560, height: 400 }
    const bounds = widgetBounds([small], small, null, false)
    expect(bounds.width).toBeGreaterThanOrEqual(520)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
  })
})

describe('restoredBounds', () => {
  it('keeps the full window where it was', () => {
    const full = { x: 100, y: 80, width: 1100, height: 700 }
    expect(restoredBounds([primary, second], primary, full)).toEqual(full)
  })

  it('brings it back on screen when its monitor was unplugged', () => {
    const full = { x: 2100, y: 100, width: 1100, height: 700 }
    const bounds = restoredBounds([primary], primary, full)
    expect(bounds.x).toBeGreaterThanOrEqual(0)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1920)
  })
})

// Compact widget view of the main window (TermFlow widget spec 02.10.2026).
//
// The same BrowserWindow shrinks into a 640 x 260 status widget in the top
// right corner and back. It is never recreated, so every PTY and agent session
// keeps running through the switch. The main process owns all geometry: the
// renderer only asks for an action over one narrow IPC channel.

import { screen, type BrowserWindow, type Rectangle } from 'electron'
import type { WidgetAction, WidgetState } from '../shared/ipc'
import type { AppSettings } from '../shared/types'

export const WIDGET_WIDTH = 640
export const WIDGET_MIN_WIDTH = 520
export const WIDGET_HEIGHT = 260
export const WIDGET_COLLAPSED_HEIGHT = 40
export const WIDGET_MARGIN = 16
const FULL_MIN_WIDTH = 640
const FULL_MIN_HEIGHT = 400

export const WIDGET_ACTIONS: readonly WidgetAction[] = ['enter', 'exit', 'collapse', 'expand', 'pin', 'unpin']

function contains(area: Rectangle, x: number, y: number): boolean {
  return x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Where the widget goes: its saved spot if that is still on a connected
 * display, otherwise 16 px in from the top-right corner of the primary work
 * area. Always kept fully inside the work area.
 */
export function widgetBounds(workAreas: Rectangle[], primary: Rectangle, saved: { x: number; y: number } | null, collapsed: boolean): Rectangle {
  const savedArea = saved ? workAreas.find((area) => contains(area, saved.x, saved.y)) : undefined
  const area = savedArea ?? primary
  const width = clamp(area.width - WIDGET_MARGIN * 2, Math.min(WIDGET_MIN_WIDTH, area.width), WIDGET_WIDTH)
  const height = Math.min(collapsed ? WIDGET_COLLAPSED_HEIGHT : WIDGET_HEIGHT, area.height)
  const x = savedArea && saved ? saved.x : area.x + area.width - width - WIDGET_MARGIN
  const y = savedArea && saved ? saved.y : area.y + WIDGET_MARGIN
  return {
    x: Math.round(clamp(x, area.x, area.x + area.width - width)),
    y: Math.round(clamp(y, area.y, area.y + area.height - height)),
    width: Math.round(width),
    height: Math.round(height)
  }
}

/**
 * The full window's bounds to restore: unchanged when still on screen,
 * otherwise centered on the primary work area (e.g. its monitor was unplugged).
 */
export function restoredBounds(workAreas: Rectangle[], primary: Rectangle, full: Rectangle): Rectangle {
  const cx = full.x + full.width / 2
  const cy = full.y + full.height / 2
  const area = workAreas.find((candidate) => contains(candidate, cx, cy))
  if (area) {
    const width = Math.min(full.width, area.width)
    const height = Math.min(full.height, area.height)
    return { x: clamp(full.x, area.x, area.x + area.width - width), y: clamp(full.y, area.y, area.y + area.height - height), width, height }
  }
  const width = Math.min(full.width, primary.width)
  const height = Math.min(full.height, primary.height)
  return {
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2),
    width,
    height
  }
}

interface SettingsAccess {
  get(): AppSettings
  update(patch: Partial<AppSettings>): AppSettings
}

export class WidgetController {
  private active = false
  private full: Rectangle | null = null
  private wasMaximized = false

  constructor(private readonly getWindow: () => BrowserWindow | null, private readonly settings: SettingsAccess) {}

  isActive(): boolean {
    return this.active
  }

  state(): WidgetState {
    const settings = this.settings.get()
    return { active: this.active, collapsed: settings.widgetCollapsed, pinned: settings.widgetPinned }
  }

  handle(action: WidgetAction): WidgetState {
    const win = this.getWindow()
    if (!win || win.isDestroyed()) return this.state()
    if (action === 'enter') this.enter(win)
    else if (action === 'exit') this.exit(win)
    else if (action === 'collapse' || action === 'expand') {
      this.rememberPosition(win)
      this.settings.update({ widgetCollapsed: action === 'collapse' })
      if (this.active) this.place(win)
    } else {
      this.settings.update({ widgetPinned: action === 'pin' })
      if (this.active) win.setAlwaysOnTop(action === 'pin', 'floating')
    }
    return this.state()
  }

  /** Saves the widget's position after the user drags it. */
  onMoved(): void {
    const win = this.getWindow()
    if (this.active && win && !win.isDestroyed()) this.rememberPosition(win)
  }

  private enter(win: BrowserWindow): void {
    if (this.active) return
    this.wasMaximized = win.isMaximized()
    this.full = win.getNormalBounds()
    if (win.isFullScreen()) win.setFullScreen(false)
    if (this.wasMaximized) win.unmaximize()
    this.active = true
    win.setMinimumSize(WIDGET_MIN_WIDTH, WIDGET_COLLAPSED_HEIGHT)
    win.setResizable(false)
    win.setMaximizable(false)
    this.place(win)
    if (win.isMinimized()) win.restore()
    win.show()
  }

  private exit(win: BrowserWindow): void {
    if (!this.active) return
    this.rememberPosition(win)
    this.active = false
    win.setAlwaysOnTop(false)
    win.setResizable(true)
    win.setMaximizable(true)
    win.setMinimumSize(FULL_MIN_WIDTH, FULL_MIN_HEIGHT)
    const displays = screen.getAllDisplays().map((display) => display.workArea)
    const full = this.full ?? { ...screen.getPrimaryDisplay().workArea, width: this.settings.get().windowWidth, height: this.settings.get().windowHeight }
    const target = restoredBounds(displays, screen.getPrimaryDisplay().workArea, full)
    win.setBounds(target)
    // Frameless windows on Windows can land a pixel or two off the requested
    // bounds; correct once so repeated round trips never drift or grow.
    const actual = win.getBounds()
    if (actual.x !== target.x || actual.y !== target.y || actual.width !== target.width || actual.height !== target.height) {
      win.setBounds({
        x: target.x * 2 - actual.x,
        y: target.y * 2 - actual.y,
        width: target.width * 2 - actual.width,
        height: target.height * 2 - actual.height
      })
    }
    if (this.wasMaximized) win.maximize()
    win.focus()
  }

  private place(win: BrowserWindow): void {
    const settings = this.settings.get()
    const saved = settings.widgetX !== null && settings.widgetY !== null ? { x: settings.widgetX, y: settings.widgetY } : null
    const displays = screen.getAllDisplays().map((display) => display.workArea)
    win.setBounds(widgetBounds(displays, screen.getPrimaryDisplay().workArea, saved, settings.widgetCollapsed))
    win.setAlwaysOnTop(settings.widgetPinned, 'floating')
  }

  private rememberPosition(win: BrowserWindow): void {
    if (!this.active) return
    const [x, y] = win.getPosition()
    this.settings.update({ widgetX: x, widgetY: y })
  }
}

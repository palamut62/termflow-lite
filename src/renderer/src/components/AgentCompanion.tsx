import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentEventStore } from '../store/agentEventStore'
import { useToastStore } from '../store/toastStore'
import { motionEnabled } from '../motion'
import { companionCaption, companionMood, renderCompanion, type CompanionFrame } from './companionFrames'

const FRAME_MS = 110

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' }

/** One frame as HTML: runs of same-colored cells become one span each. */
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

/**
 * One ASCII character filling a panel to the right of an agent terminal. Its
 * eyes mirror the agent's state (focused, tired, waiting, surprised, proud,
 * rested, angry, asleep) so the state is readable at a glance. Frames are painted straight into a <pre> on a timer —
 * no React render per frame — and the timer only runs while the pane is
 * visible, the window is shown and motion is enabled.
 */
export function AgentCompanion({ tabId, visible }: { tabId: string; visible: boolean }): React.JSX.Element | null {
  const tab = useTerminalStore((state) => state.tabs.find((item) => item.id === tabId))
  const settings = useSettingsStore((state) => state.settings)
  const latestTitle = useAgentEventStore((state) => {
    for (let index = state.events.length - 1; index >= 0; index -= 1) {
      if (state.events[index].tabId === tabId) return state.events[index].title
    }
    return ''
  })
  const artRef = useRef<HTMLPreElement>(null)
  const captionRef = useRef<HTMLSpanElement>(null)

  const profile = tab ? mergeProfiles(settings.profiles).find((item) => item.id === tab.profileId) : undefined
  const provider = tab ? providerFromProfileId(settings, tab.profileId) : undefined
  const isAgent = !!provider || !!profile?.startupCommand
  // The character is drawn in the agent's own color (Claude orange, Codex blue, ...).
  const bodyColor = profile?.color || provider?.color || 'var(--accent-color)'
  const enabled = settings.agentCompanion && isAgent
  const mood = tab ? companionMood(tab.running, tab.activity) : 'sleeping'
  const animate = enabled && visible && motionEnabled(settings.motion)

  useEffect(() => {
    if (!enabled) return
    const pre = artRef.current
    if (!pre) return
    // Every mood starts from its first frame (the face reacts afresh).
    let tick = 0
    let grid = measureGrid(pre)
    const paint = (): void => {
      // Built only from the fixed glyph set in companionFrames, and escaped anyway.
      pre.innerHTML = frameHtml(renderCompanion(mood, tick, grid.cols, grid.rows, grid.aspect))
      if (captionRef.current) captionRef.current.textContent = companionCaption(mood, tick)
    }
    paint()
    // The grid always fills the panel, so it is re-measured when the panel resizes.
    const observer = new ResizeObserver(() => {
      grid = measureGrid(pre)
      paint()
    })
    observer.observe(pre)
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
  }, [enabled, animate, mood])

  if (!enabled) return null

  const hide = (): void => {
    void useSettingsStore.getState().update({ agentCompanion: false })
    useToastStore.getState().show('Agent animation hidden. Turn it back on in Settings > Appearance.', 'info')
  }

  return (
    <aside
      className={`agent-companion agent-companion-${mood}`}
      style={{ '--companion-body': bodyColor } as React.CSSProperties}
      aria-label="Agent status animation"
    >
      <button className="agent-companion-close" type="button" onClick={hide} title="Hide agent animation" aria-label="Hide agent animation">
        <X size={12} />
      </button>
      <pre ref={artRef} className="agent-companion-art" aria-hidden="true" />
      <div className="agent-companion-caption" role="status">
        <span ref={captionRef} />
        {mood === 'working' && latestTitle && <small title={latestTitle}>{latestTitle}</small>}
      </div>
    </aside>
  )
}

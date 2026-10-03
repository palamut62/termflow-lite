import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import { agentKindForCommand } from '../../../shared/agentEvents'
import type { AgentCharacter, AgentEvent, AgentKind, AgentWeather, AppSettings, TabActivity } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'
import { useAgentEventStore } from '../store/agentEventStore'
import { useToastStore } from '../store/toastStore'
import { useFilePanelStore } from '../store/filePanelStore'
import { motionEnabled } from '../motion'
import { activityLine, agentPulse, currentActivity } from '../fun/agentActivity'
import { cycleWeather, lastLiveReading, liveWeather, type WeatherNow } from '../fun/weather'
import { CHARACTERS, CharacterEngine, type CharacterKind, type CharacterState } from './characterEngine'
import { STATE_LABELS, STATE_LINES, createStateMemory, resolveCharacterState } from './characterState'

/** ~24 fps, the kit's live cadence. */
const FRAME_MS = 42

const AUTO_CHARACTER: Record<AgentKind, CharacterKind> = { claude: 'ember', codex: 'miso', opencode: 'piko' }

export function characterFor(setting: AgentCharacter | undefined, agent: AgentKind | null): CharacterKind {
  if (setting && setting !== 'auto' && setting in CHARACTERS) return setting
  return agent ? AUTO_CHARACTER[agent] : 'piko'
}

/** The sky for this frame: the changing demo sky (moon at night), live weather, or none. */
function skyFor(mode: AgentWeather, place: AppSettings['weatherPlace'], now: number): WeatherNow | null {
  if (mode === 'cycle') {
    const hour = new Date(now).getHours()
    return { kind: cycleWeather(now), night: hour < 6 || hour >= 20 }
  }
  return mode === 'live' && place ? liveWeather(place, now) : null
}

/** " · 12°C" after the label while live weather has a reading. */
function liveTemperature(mode: AgentWeather): string {
  const reading = mode === 'live' ? lastLiveReading() : null
  return reading ? ` · ${Math.round(reading.temperature)}°C` : ''
}

/** The line under the label: the real work while busy, otherwise a short state line. */
function captionLine(state: CharacterState, tired: boolean, tabId: string, now: number): string {
  if (state === 'working' || state === 'thinking') {
    const activity = currentActivity(tabId, now)
    // Busy without a tool line: the agent is writing its answer.
    if (state === 'working' && !activity) return tired ? 'Still going (long session)' : 'Working on it...'
    const line = activityLine(activity, now / 110, now)
    return tired && state === 'working' ? `${line} (long session)` : line
  }
  return STATE_LINES[state]
}

/**
 * Agent character docked to the right of an agent terminal. Its expression
 * follows the session: working at the keyboard, thinking, waiting on you,
 * done, error, idle, plus time-based tired / grumpy / sleeping / rested.
 * Drawn on one canvas from a rAF loop (no React render per frame) that only
 * runs while the pane is visible, the window is shown and motion is on.
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
  // The running engine, so hovering the panel can point its eyes (only while it animates).
  const engineRef = useRef<CharacterEngine | null>(null)
  // Read every frame, so new events and activity change the face without restarting the loop.
  const live = useRef<{ event?: AgentEvent; running: boolean; activity: TabActivity; weather: AgentWeather; place: AppSettings['weatherPlace'] }>({ running: true, activity: 'running', weather: 'off', place: null })
  live.current = { event: latestEvent, running: tab?.running ?? false, activity: tab?.activity ?? 'completed', weather: settings.agentWeather ?? 'off', place: settings.weatherPlace ?? null }
  // Session history for the time rules; survives style/character changes and panel re-opens.
  const memory = useRef(createStateMemory(Date.now()))
  const [label, setLabel] = useState<CharacterState>('idle')

  const profile = tab ? mergeProfiles(settings.profiles).find((item) => item.id === tab.profileId) : undefined
  const provider = tab ? providerFromProfileId(settings, tab.profileId) : undefined
  const isAgent = !!provider || !!profile?.startupCommand
  const agent = agentKindForCommand(profile?.startupCommand || profile?.command || provider?.command)
  const kind = characterFor(settings.agentCharacter, agent)
  // The file panel takes the right side while it is open.
  const filesOpen = useFilePanelStore((s) => s.open)
  const enabled = settings.agentCompanion && isAgent && !filesOpen
  const style = settings.agentAnimationStyle === 'scenes' ? 'pixel' : 'ascii'
  const animate = enabled && visible && motionEnabled(settings.motion)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!enabled || !canvas || !ctx) return
    const engine = new CharacterEngine(kind)
    engineRef.current = animate ? engine : null
    let width = 0
    let height = 0
    let frame = 0
    let last = 0
    let shown: CharacterState | undefined

    const update = (now: number): void => {
      const { event, running, activity } = live.current
      const resolved = resolveCharacterState(
        {
          running,
          activity,
          eventId: event?.id,
          eventKind: event?.kind,
          eventAt: event?.createdAt,
          eventDetail: event?.detail,
          activityKind: currentActivity(tabId, now)?.kind ?? null,
          // Claude Code and Codex always show a spinner while busy, so its absence means idle from the start.
          pulse: agent === 'claude' || agent === 'codex' ? agentPulse(tabId) ?? {} : agentPulse(tabId),
          now
        },
        memory.current
      )
      engine.setState(resolved.state, resolved.tired)
      const sky = skyFor(live.current.weather, live.current.place, now)
      engine.setWeather(sky?.kind ?? null, sky?.night)
      if (resolved.state !== shown) {
        shown = resolved.state
        setLabel(resolved.state)
      }
    }
    const paint = (now: number): void => {
      if (!width || !height) return
      const tired = engine.tired && engine.state === 'working'
      engine.paint(ctx, width, height, style, [
        `${CHARACTERS[kind].name} / ${tired ? 'Tired but working' : STATE_LABELS[engine.state]}${liveTemperature(live.current.weather)}`,
        captionLine(engine.state, tired, tabId, now)
      ])
    }
    const measure = (): void => {
      const box = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = box.width
      height = box.height
      canvas.width = Math.max(1, Math.round(width * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const still = (): void => {
      const now = Date.now()
      update(now)
      engine.step(0, false)
      paint(now)
    }

    measure()
    still()
    const observer = new ResizeObserver(() => {
      measure()
      if (animate) paint(Date.now())
      else still()
    })
    observer.observe(canvas)
    let disposed = false
    // The monospace font settles the glyph metrics once it has loaded.
    void document.fonts?.ready.then(() => {
      if (!disposed) paint(Date.now())
    })

    if (animate) {
      const tick = (time: number): void => {
        frame = requestAnimationFrame(tick)
        if (document.hidden || time - last < FRAME_MS) return
        const dt = last ? Math.min((time - last) / 1000, 0.08) : 0
        last = time
        const now = Date.now()
        update(now)
        engine.step(dt, true)
        paint(now)
      }
      frame = requestAnimationFrame(tick)
    }
    // Without motion a visible panel still follows state changes, one still frame per change.
    let pending = 0
    const request = (): void => {
      if (!pending) pending = requestAnimationFrame(() => {
        pending = 0
        still()
      })
    }
    const unsubscribe = !animate && visible ? useTerminalStore.subscribe(request) : undefined
    const unsubscribeEvents = !animate && visible ? useAgentEventStore.subscribe(request) : undefined

    return () => {
      disposed = true
      if (engineRef.current === engine) engineRef.current = null
      cancelAnimationFrame(frame)
      cancelAnimationFrame(pending)
      observer.disconnect()
      unsubscribe?.()
      unsubscribeEvents?.()
    }
  }, [enabled, animate, visible, kind, style, tabId, agent])

  if (!enabled) return null

  const hide = (): void => {
    void useSettingsStore.getState().update({ agentCompanion: false })
    useToastStore.getState().show('Agent animation hidden. Turn it back on in Settings > Appearance.', 'info')
  }

  return (
    <aside
      className={`agent-companion agent-companion-${style}`}
      aria-label="Agent status animation"
      onPointerMove={(event) => {
        const box = canvasRef.current?.getBoundingClientRect()
        if (box) engineRef.current?.setPointer({ x: event.clientX - box.left, y: event.clientY - box.top })
      }}
      onPointerLeave={() => engineRef.current?.setPointer(null)}
    >
      <button className="agent-companion-close" type="button" onClick={hide} title="Hide agent animation" aria-label="Hide agent animation">
        <X size={12} />
      </button>
      <canvas ref={canvasRef} className="agent-companion-canvas" role="img" aria-label={`${CHARACTERS[kind].name}: ${STATE_LABELS[label]}`} />
      {/* Screen readers hear only the label change. */}
      <span className="sr-only" aria-live="polite">{STATE_LABELS[label]}</span>
    </aside>
  )
}

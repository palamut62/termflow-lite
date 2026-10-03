// Maps an agent tab's real state to a character state. The task states come
// straight from the session (work, approval, finish, failure, no task).
// Tired, grumpy, sleeping and rested are character personality, picked only
// by the explicit time rules below, never guessed from output text.

import type { AgentEventKind, TabActivity } from '../../../shared/types'
import type { ActivityKind } from '../fun/agentActivity'
import type { CharacterState } from './characterEngine'

/** Continuous work (gaps under WORK_GAP_MS) past this shows a tired face at the desk. */
export const TIRED_AFTER_MS = 20 * 60_000
/** A break this long ends a work streak. */
export const WORK_GAP_MS = 2 * 60_000
/** Waiting on your approval this long makes the character tired. */
export const WAIT_TIRED_MS = 5 * 60_000
/** Idle this long, or an exited process after its last reaction, falls asleep. */
export const SLEEP_AFTER_MS = 3 * 60_000
/** A second error within this window turns the error face grumpy. */
export const ANGRY_WINDOW_MS = 10 * 60_000
/** How long done / error / rested reactions hold before the steady state. */
export const DONE_MS = 6000
export const ERROR_MS = 10_000
export const RESTED_MS = 3000
/** The spinner redraws ~10x a second; this long without it means the agent stopped. */
export const BUSY_MS = 2500
/** The spinner said "thinking" this recently. */
export const THINK_MS = 1500
/** An error event counts only if its line reads like one ("Error: ...", "⎿ Failed ..."). */
const ERROR_LINE = /^[\W\d]*(?:error|fatal|failed|failure)\b/i

export interface StateInput {
  running: boolean
  activity: TabActivity
  /** The tab's latest agent event. */
  eventId?: string
  eventKind?: AgentEventKind
  eventAt?: number
  /** The latest event's text, to tell a real error line from prose that mentions one. */
  eventDetail?: string
  /** What the agent is doing, from its tool lines (null when unknown). */
  activityKind?: ActivityKind | null
  /**
   * The agent's own busy indicator (see agentPulse), for agents known to show
   * one. With it, busy / thinking / turn end come from the spinner instead of
   * the prompt; an empty pulse means it has not been busy yet.
   */
  pulse?: { busyAt?: number; thinkingAt?: number; endAt?: number }
  now: number
}

/** Per-session history the rules need; owned by one pane, never shared. */
export interface StateMemory {
  state?: CharacterState
  since: number
  workingSince?: number
  lastWorkAt?: number
  errors: number[]
  seenErrorId?: string
  stoppedAt?: number
  idleSince?: number
  waitingSince?: number
  restedUntil?: number
}

export function createStateMemory(now: number): StateMemory {
  return { since: now, errors: [] }
}

export interface Resolved {
  state: CharacterState
  /** A long work streak: the working pose with a tired face. */
  tired: boolean
}

function errorState(memory: StateMemory, now: number): CharacterState {
  return memory.errors.filter((at) => now - at < ANGRY_WINDOW_MS).length >= 2 ? 'angry' : 'error'
}

function noteError(memory: StateMemory, id: string, at: number): void {
  if (memory.seenErrorId === id) return
  memory.seenErrorId = id
  memory.errors = [...memory.errors.filter((time) => at - time < ANGRY_WINDOW_MS), at]
}

function base(input: StateInput, memory: StateMemory): Resolved {
  const { now } = input
  const recent = (ms: number): boolean => input.eventAt !== undefined && now - input.eventAt < ms

  if (!input.running) {
    memory.stoppedAt ??= now
    if (input.activity === 'error') {
      noteError(memory, `exit:${memory.stoppedAt}`, memory.stoppedAt)
      return { state: now - memory.stoppedAt < ERROR_MS ? errorState(memory, now) : 'sleeping', tired: false }
    }
    return { state: now - memory.stoppedAt < DONE_MS ? 'done' : 'sleeping', tired: false }
  }
  memory.stoppedAt = undefined

  const pulse = input.pulse
  const pulsed = pulse !== undefined
  const since = (at: number | undefined, ms: number): boolean => at !== undefined && now - at < ms
  const busy = pulsed ? since(pulse?.busyAt, BUSY_MS) : input.activity === 'running' || input.activity === 'unread'

  const realError = input.eventDetail === undefined || ERROR_LINE.test(input.eventDetail)
  if (input.eventKind === 'error' && input.eventId && input.eventAt !== undefined && recent(ERROR_MS) && realError) {
    noteError(memory, input.eventId, input.eventAt)
    return { state: errorState(memory, now), tired: false }
  }

  if (!busy) {
    memory.workingSince = memory.lastWorkAt !== undefined && now - memory.lastWorkAt > WORK_GAP_MS ? undefined : memory.workingSince
    // An approval or question asked after the agent last moved.
    const asking = (input.eventKind === 'approval' || input.eventKind === 'question') &&
      (!pulsed || (input.eventAt ?? 0) >= (pulse?.busyAt ?? 0) - 1000)
    if (asking) {
      memory.idleSince = undefined
      memory.waitingSince ??= now
      return { state: now - memory.waitingSince >= WAIT_TIRED_MS ? 'tired' : 'waiting', tired: false }
    }
    memory.waitingSince = undefined
    const finished = pulsed ? since(pulse?.endAt, DONE_MS) : input.eventKind === 'completed' && recent(DONE_MS)
    if (finished) return { state: 'done', tired: false }
    memory.idleSince ??= now
    return { state: now - memory.idleSince >= SLEEP_AFTER_MS ? 'sleeping' : 'idle', tired: false }
  }

  // Busy: the agent is at work.
  memory.idleSince = undefined
  memory.waitingSince = undefined
  if (memory.state === 'sleeping') memory.restedUntil = now + RESTED_MS
  if (memory.restedUntil !== undefined && now < memory.restedUntil) return { state: 'rested', tired: false }
  memory.restedUntil = undefined
  if (memory.workingSince === undefined || memory.lastWorkAt === undefined || now - memory.lastWorkAt > WORK_GAP_MS) memory.workingSince = now
  memory.lastWorkAt = now
  const kind = input.activityKind
  // With a spinner, "thinking" is what it says; between thoughts the agent is
  // acting or writing its answer. Without one, no known tool means thinking.
  const thinking = kind === 'think' || kind === 'plan' || (pulsed ? since(pulse?.thinkingAt, THINK_MS) : !kind)
  return { state: thinking ? 'thinking' : 'working', tired: now - memory.workingSince >= TIRED_AFTER_MS }
}

/** The character state right now. Call it every frame; it updates `memory`. */
export function resolveCharacterState(input: StateInput, memory: StateMemory): Resolved {
  const resolved = base(input, memory)
  if (resolved.state !== memory.state) {
    memory.state = resolved.state
    memory.since = input.now
  }
  return resolved
}

export const STATE_LABELS: Record<CharacterState, string> = {
  working: 'Working',
  thinking: 'Thinking',
  waiting: 'Needs you',
  tired: 'Tired',
  angry: 'Grumpy',
  sleeping: 'Sleeping',
  rested: 'Rested',
  done: 'Done',
  error: 'Error',
  idle: 'Idle'
}

export const STATE_LINES: Record<CharacterState, string> = {
  working: 'On it.',
  thinking: 'Weighing the options.',
  waiting: 'Waiting for your go-ahead.',
  tired: 'Still waiting on you...',
  angry: 'This error again?!',
  sleeping: 'zzz...',
  rested: 'Rested, back to it.',
  done: 'All done!',
  error: 'Something went wrong.',
  idle: 'Ready for the next task.'
}

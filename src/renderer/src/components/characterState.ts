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

export interface StateInput {
  running: boolean
  activity: TabActivity
  /** The tab's latest agent event. */
  eventId?: string
  eventKind?: AgentEventKind
  eventAt?: number
  /** What the agent is doing, from its tool lines (null when unknown). */
  activityKind?: ActivityKind | null
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

  if (input.eventKind === 'error' && input.eventId && input.eventAt !== undefined && recent(ERROR_MS)) {
    noteError(memory, input.eventId, input.eventAt)
    return { state: errorState(memory, now), tired: false }
  }

  if (input.activity === 'waiting' || input.activity === 'completed') {
    memory.workingSince = memory.lastWorkAt !== undefined && now - memory.lastWorkAt > WORK_GAP_MS ? undefined : memory.workingSince
    if (input.eventKind === 'approval' || input.eventKind === 'question') {
      memory.idleSince = undefined
      memory.waitingSince ??= now
      return { state: now - memory.waitingSince >= WAIT_TIRED_MS ? 'tired' : 'waiting', tired: false }
    }
    memory.waitingSince = undefined
    if (input.eventKind === 'completed' && recent(DONE_MS)) return { state: 'done', tired: false }
    memory.idleSince ??= now
    return { state: now - memory.idleSince >= SLEEP_AFTER_MS ? 'sleeping' : 'idle', tired: false }
  }

  // Running (or unread output in a background tab): the agent is at work.
  memory.idleSince = undefined
  memory.waitingSince = undefined
  if (memory.state === 'sleeping') memory.restedUntil = now + RESTED_MS
  if (memory.restedUntil !== undefined && now < memory.restedUntil) return { state: 'rested', tired: false }
  memory.restedUntil = undefined
  if (memory.workingSince === undefined || memory.lastWorkAt === undefined || now - memory.lastWorkAt > WORK_GAP_MS) memory.workingSince = now
  memory.lastWorkAt = now
  const kind = input.activityKind
  const thinking = !kind || kind === 'think' || kind === 'plan'
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

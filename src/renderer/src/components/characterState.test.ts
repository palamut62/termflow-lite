import { describe, expect, it } from 'vitest'
import { faceTargets, keyPose, workPose, yawnAmount } from './characterEngine'
import {
  DONE_MS,
  RESTED_MS,
  SLEEP_AFTER_MS,
  TIRED_AFTER_MS,
  WAIT_TIRED_MS,
  createStateMemory,
  resolveCharacterState,
  type StateInput
} from './characterState'

const T0 = 1_000_000
const working = (now: number, extra: Partial<StateInput> = {}): StateInput => ({ running: true, activity: 'running', activityKind: 'edit', now, ...extra })

describe('resolveCharacterState: task states', () => {
  it('works while editing, thinks without a tool line or while planning', () => {
    const memory = createStateMemory(T0)
    expect(resolveCharacterState(working(T0), memory)).toEqual({ state: 'working', tired: false })
    expect(resolveCharacterState(working(T0 + 1, { activityKind: null }), memory).state).toBe('thinking')
    expect(resolveCharacterState(working(T0 + 2, { activityKind: 'plan' }), memory).state).toBe('thinking')
  })

  it('waits on approval, celebrates a finish, otherwise idles', () => {
    const memory = createStateMemory(T0)
    expect(resolveCharacterState({ running: true, activity: 'waiting', eventKind: 'approval', eventAt: T0, now: T0 }, memory).state).toBe('waiting')
    expect(resolveCharacterState({ running: true, activity: 'waiting', eventKind: 'completed', eventAt: T0, now: T0 + 1000 }, memory).state).toBe('done')
    expect(resolveCharacterState({ running: true, activity: 'waiting', eventKind: 'completed', eventAt: T0, now: T0 + DONE_MS + 1 }, memory).state).toBe('idle')
  })

  it('shows a recent error event, then turns grumpy on a second one', () => {
    const memory = createStateMemory(T0)
    expect(resolveCharacterState(working(T0, { eventId: 'a', eventKind: 'error', eventAt: T0 }), memory).state).toBe('error')
    // The same event read again on later frames does not count twice.
    expect(resolveCharacterState(working(T0 + 100, { eventId: 'a', eventKind: 'error', eventAt: T0 }), memory).state).toBe('error')
    expect(resolveCharacterState(working(T0 + 60_000, { eventId: 'b', eventKind: 'error', eventAt: T0 + 60_000 }), memory).state).toBe('angry')
  })

  it('an exited process is done for a moment, then sleeps', () => {
    const memory = createStateMemory(T0)
    expect(resolveCharacterState({ running: false, activity: 'completed', now: T0 }, memory).state).toBe('done')
    expect(resolveCharacterState({ running: false, activity: 'completed', now: T0 + DONE_MS + 1 }, memory).state).toBe('sleeping')
  })
})

describe('resolveCharacterState: time rules', () => {
  it('a long work streak keeps working with a tired face', () => {
    const memory = createStateMemory(T0)
    let resolved = resolveCharacterState(working(T0), memory)
    for (let now = T0; now <= T0 + TIRED_AFTER_MS; now += 60_000) resolved = resolveCharacterState(working(now), memory)
    expect(resolved).toEqual({ state: 'working', tired: true })
  })

  it('a long break resets the streak', () => {
    const memory = createStateMemory(T0)
    for (let now = T0; now <= T0 + TIRED_AFTER_MS; now += 60_000) resolveCharacterState(working(now), memory)
    expect(resolveCharacterState(working(T0 + TIRED_AFTER_MS + 10 * 60_000), memory).tired).toBe(false)
  })

  it('waiting long on approval gets tired and stays tired', () => {
    const memory = createStateMemory(T0)
    const wait = (now: number): StateInput => ({ running: true, activity: 'waiting', eventKind: 'approval', eventAt: T0, now })
    resolveCharacterState(wait(T0), memory)
    expect(resolveCharacterState(wait(T0 + WAIT_TIRED_MS), memory).state).toBe('tired')
    expect(resolveCharacterState(wait(T0 + WAIT_TIRED_MS + 50), memory).state).toBe('tired')
  })

  it('falls asleep when idle, wakes up rested, then works', () => {
    const memory = createStateMemory(T0)
    const idle = (now: number): StateInput => ({ running: true, activity: 'waiting', now })
    resolveCharacterState(idle(T0), memory)
    expect(resolveCharacterState(idle(T0 + SLEEP_AFTER_MS), memory).state).toBe('sleeping')
    const wake = T0 + SLEEP_AFTER_MS + 1000
    expect(resolveCharacterState(working(wake), memory).state).toBe('rested')
    expect(resolveCharacterState(working(wake + RESTED_MS + 1), memory).state).toBe('working')
  })
})

describe('character motion', () => {
  it('types, pauses and reads in a 5.2 s loop', () => {
    expect(workPose(1).typing).toBe(true)
    expect(workPose(2).typing).toBe(false)
    expect(workPose(4.5)).toMatchObject({ typing: false, reading: true })
  })

  it('keeps each hand on its own half of the keyboard', () => {
    for (let t = 0; t < 3; t += 0.07) {
      expect(keyPose(t, -1).col).toBeLessThan(5)
      expect(keyPose(t, 1).col).toBeGreaterThanOrEqual(6)
    }
  })

  it('a tired worker has heavier lids and yawns now and then', () => {
    expect(faceTargets('working', 1, true).open).toBeLessThan(faceTargets('working', 1).open)
    expect(yawnAmount(1)).toBe(0)
    expect(yawnAmount(6.8)).toBeGreaterThan(0.9)
  })

  it('every state has its own face', () => {
    const faces = (['working', 'thinking', 'waiting', 'tired', 'angry', 'sleeping', 'rested', 'done', 'error', 'idle'] as const)
      .map((state) => JSON.stringify(faceTargets(state, 0)))
    // idle and rested share eyes but rested smiles; sleeping is shut.
    expect(new Set(faces).size).toBeGreaterThanOrEqual(9)
  })
})

describe('resolveCharacterState: agents with a busy spinner', () => {
  const at = (now: number, pulse: StateInput['pulse'], extra: Partial<StateInput> = {}): StateInput =>
    // The prompt heuristic says "running" the whole time; the spinner decides.
    ({ running: true, activity: 'running', activityKind: null, pulse, now, ...extra })

  it('works while the spinner turns, thinks when it says so', () => {
    const memory = createStateMemory(T0)
    expect(resolveCharacterState(at(T0, { busyAt: T0 }), memory).state).toBe('working')
    expect(resolveCharacterState(at(T0 + 100, { busyAt: T0 + 100, thinkingAt: T0 + 100 }), memory).state).toBe('thinking')
  })

  it('a finished turn is done, then idle, even though redraws keep coming', () => {
    const memory = createStateMemory(T0)
    const pulse = { busyAt: T0, endAt: T0 + 500 }
    expect(resolveCharacterState(at(T0 + 3000, pulse), memory).state).toBe('done')
    expect(resolveCharacterState(at(T0 + 500 + DONE_MS + 1, pulse), memory).state).toBe('idle')
  })

  it('needs you when an approval comes after the spinner stops', () => {
    const memory = createStateMemory(T0)
    const pulse = { busyAt: T0 }
    expect(resolveCharacterState(at(T0 + 3000, pulse, { eventKind: 'approval', eventAt: T0 + 2800 }), memory).state).toBe('waiting')
    // An old approval from before the last bit of work does not count.
    const later = createStateMemory(T0)
    expect(resolveCharacterState(at(T0 + 20_000, { busyAt: T0 + 15_000 }, { eventKind: 'approval', eventAt: T0 }), later).state).toBe('idle')
  })

  it('prose that mentions an error is no error', () => {
    const memory = createStateMemory(T0)
    const pulse = { busyAt: T0 }
    expect(resolveCharacterState(at(T0, pulse, { eventId: 'e', eventKind: 'error', eventAt: T0, eventDetail: 'I fixed the error handling in upload.ts' }), memory).state).toBe('working')
    expect(resolveCharacterState(at(T0, pulse, { eventId: 'f', eventKind: 'error', eventAt: T0, eventDetail: '⎿ Error: Cannot find module' }), memory).state).toBe('error')
  })
})

describe('resolveCharacterState: a spinner agent before its first turn', () => {
  it('is idle while the TUI redraws, not thinking', () => {
    const memory = createStateMemory(T0)
    expect(resolveCharacterState({ running: true, activity: 'running', activityKind: null, pulse: {}, now: T0 }, memory).state).toBe('idle')
  })
})

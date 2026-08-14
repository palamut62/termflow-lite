import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PtyCore } from './PtyCore'

interface FakePty {
  pid: number
  writes: string[]
  resizes: [number, number][]
  emitData: (value: string) => void
  emitExit: (value: { exitCode: number }) => void
  onData: (cb: (value: string) => void) => void
  onExit: (cb: (value: { exitCode: number }) => void) => void
  write: (value: string) => void
  resize: (cols: number, rows: number) => void
  kill: () => void
}

const registry: FakePty[] = []

vi.mock('@lydell/node-pty', () => ({
  spawn: () => {
    let dataCb: ((value: string) => void) | null = null
    let exitCb: ((value: { exitCode: number }) => void) | null = null
    const fake: FakePty = {
      pid: 5000 + registry.length,
      writes: [],
      resizes: [],
      emitData: (value) => dataCb?.(value),
      emitExit: (value) => exitCb?.(value),
      onData: (cb) => { dataCb = cb },
      onExit: (cb) => { exitCb = cb },
      write: (value) => fake.writes.push(value),
      resize: (cols, rows) => fake.resizes.push([cols, rows]),
      kill: () => undefined
    }
    registry.push(fake)
    return fake
  }
}))

vi.mock('./ShellDiscovery', () => ({
  resolveShell: () => ({ shell: 'cmd.exe', args: [], cwd: 'C:\\', env: {} })
}))

const input = { kind: 'cmd' as const, cols: 120, rows: 30 }

describe('PtyCore lifecycle', () => {
  beforeEach(() => { registry.length = 0 })

  it('creates, writes, resizes and emits exit events', () => {
    const events: unknown[] = []
    const core = new PtyCore((event) => events.push(event))
    expect(core.create('t1', input)).toEqual({ pid: 5000 })
    core.write('t1', 'echo hi\r')
    core.resize('t1', 80, 24)
    registry[0].emitExit({ exitCode: 0 })
    expect(registry[0].writes).toEqual(['echo hi\r'])
    expect(registry[0].resizes).toEqual([[80, 24]])
    expect(events.some((event) => (event as { kind: string }).kind === 'exit')).toBe(true)
  })

  it('runs a saved command after the shell starts', () => {
    vi.useFakeTimers()
    try {
      const core = new PtyCore(() => undefined)
      core.create('t1', { ...input, launchCommand: 'claude update' })
      expect(registry[0].writes).toEqual([])
      vi.advanceTimersByTime(400)
      expect(registry[0].writes).toEqual(['claude update\r'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts an agent before sending the saved prompt', () => {
    vi.useFakeTimers()
    try {
      const core = new PtyCore(() => undefined)
      core.create('t1', { ...input, startupCommand: 'claude', launchCommand: 'review this repo' })
      vi.advanceTimersByTime(400)
      expect(registry[0].writes).toEqual(['claude\r'])
      vi.advanceTimersByTime(2499)
      expect(registry[0].writes).toEqual(['claude\r'])
      vi.advanceTimersByTime(1)
      expect(registry[0].writes).toEqual(['claude\r', 'review this repo\r'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps a bounded scrollback buffer', () => {
    const core = new PtyCore(() => undefined)
    core.setScrollback(2)
    core.create('t1', input)
    registry[0].emitData('one\ntwo\nthree\n')
    expect(core.getBuffer('t1')).toBe('two\nthree\n')
  })

  it('batches data output at the active cadence', () => {
    vi.useFakeTimers()
    try {
      const events: unknown[] = []
      const core = new PtyCore((event) => events.push(event))
      core.create('t1', input)
      registry[0].emitData('hello')
      expect(events.filter((e) => (e as { kind: string }).kind === 'data')).toHaveLength(0)
      vi.advanceTimersByTime(20) // past the 16ms active interval
      const datas = events.filter((e) => (e as { kind: string }).kind === 'data')
      expect(datas).toHaveLength(1)
      expect((datas[0] as { data: string }).data).toBe('hello')
      core.kill('t1')
    } finally {
      vi.useRealTimers()
    }
  })

  it('tracks OSC 7 cwd changes and skips no-op resizes', () => {
    const events: unknown[] = []
    const core = new PtyCore((event) => events.push(event))
    core.create('t1', input)
    registry[0].emitData('\x1b]7;file://host/C:/Users/test\x07')
    expect(events.some((e) => (e as { kind: string }).kind === 'cwd')).toBe(true)
    core.resize('t1', 120, 30) // identical to spawn size — no rewrap
    expect(registry[0].resizes).toEqual([])
  })

  it('restarts and removes terminal processes', () => {
    const core = new PtyCore(() => undefined)
    core.create('t1', input)
    expect(core.restart('t1')).toEqual({ pid: 5001 })
    expect(core.pids()).toEqual([{ id: 't1', pid: 5001 }])
    core.kill('t1')
    expect(core.pids()).toEqual([])
  })
})

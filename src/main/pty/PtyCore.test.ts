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

vi.mock('./shells', () => ({ resolveShell: () => ({ shell: 'cmd.exe', args: [], cwd: 'C:\\', env: {} }) }))

const input = { workspaceId: 'w', name: 'test', kind: 'cmd' as const }

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

  it('keeps a bounded scrollback buffer and reports totals', () => {
    const core = new PtyCore(() => undefined)
    core.setScrollback(2)
    core.create('t1', input)
    registry[0].emitData('one\ntwo\nthree\n')
    const info = core.getBufferInfo('t1')
    expect(info.data).toBe('two\nthree\n')
    expect(info.total).toBe(14)
  })

  // Startup-command timing: full-screen TUIs (claude/codex) must never draw
  // their first frame at one size and then be rewrapped by ConPTY.
  it('types the startup command immediately when the caller already measured the pane', () => {
    const core = new PtyCore(() => undefined)
    core.create('t1', { ...input, kind: 'claude', startupCommand: 'claude', cols: 100, rows: 40 })
    expect(registry[0].writes).toEqual(['claude\r'])
    // The PTY already spawned at the final size, so the client's first resize
    // report is a no-op and no rewrap happens.
    core.resize('t1', 100, 40)
    expect(registry[0].resizes).toEqual([])
  })

  it('waits for the first size report when the pane could not be measured', () => {
    const core = new PtyCore(() => undefined)
    core.create('t1', { ...input, kind: 'claude', startupCommand: 'claude' })
    expect(registry[0].writes).toEqual([])
    core.resize('t1', 90, 30)
    expect(registry[0].resizes).toEqual([[90, 30]])
    expect(registry[0].writes).toEqual(['claude\r'])
    core.kill('t1')
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

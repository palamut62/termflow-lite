import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../shared/types'

// Fake pty registry: each spawn() pushes a controllable fake process so the
// test can drive output (`emit`) and inspect what was written back to it.
interface FakePty {
  pid: number
  writes: string[]
  emit: (data: string) => void
  _exit: ((e: { exitCode: number }) => void) | null
  resizes: [number, number][]
}
const registry: FakePty[] = []

vi.mock('@lydell/node-pty', () => ({
  spawn: () => {
    const p: FakePty & { onData: (cb: (d: string) => void) => void; onExit: (cb: (e: { exitCode: number }) => void) => void; write: (d: string) => void; resize: (cols: number, rows: number) => void; kill: () => void } = {
      pid: 1000 + registry.length,
      writes: [],
      emit: () => {},
      _exit: null,
      onData(cb) { p.emit = cb },
      onExit(cb) { p._exit = cb },
      write(d: string) { p.writes.push(d) },
      resizes: [],
      resize(cols: number, rows: number) { p.resizes.push([cols, rows]) },
      kill() {}
    }
    registry.push(p)
    return p
  }
}))

vi.mock('./shells', () => ({
  resolveShell: () => ({ shell: 'sh', args: [], cwd: '.', env: {} })
}))

// Import after mocks are registered.
import { PtyManager } from './PtyManager'

const baseInput = { workspaceId: 'w', name: 'T', kind: 'cmd' as const }

let sent: { ch: string; payload: unknown }[]
let mgr: PtyManager

beforeEach(() => {
  registry.length = 0
  sent = []
  mgr = new PtyManager(() => ({ send: (ch: string, payload: unknown) => sent.push({ ch, payload }) }) as never)
})

afterEach(() => {
  vi.clearAllTimers()
})

describe('PtyManager terminal sizing', () => {
  it('starts a TUI only after the renderer supplies its real dimensions', () => {
    vi.useFakeTimers()
    mgr.create('A', { ...baseInput, kind: 'claude', startupCommand: 'claude' })

    vi.advanceTimersByTime(350)
    expect(registry[0].writes).toEqual([])

    mgr.resize('A', 54, 28)
    expect(registry[0].resizes).toEqual([[54, 28]])
    expect(registry[0].writes).toEqual(['claude\r'])

    mgr.resize('A', 90, 40)
    expect(registry[0].writes).toEqual(['claude\r'])
  })

  it('uses a fallback for a startup command that is never mounted', () => {
    vi.useFakeTimers()
    mgr.create('A', { ...baseInput, kind: 'codex', startupCommand: 'codex' })

    vi.advanceTimersByTime(5000)
    expect(registry[0].writes).toEqual(['codex\r'])
  })
})

describe('PtyManager recording limits', () => {
  it('records output while active and stops on the duration cap', () => {
    mgr.create('A', baseInput)
    mgr.startRecording('A')
    registry[0].emit('one')
    expect(mgr.getRecording('A').length).toBe(1)

    // Force the elapsed time past the 30-minute cap.
    const managed = (mgr as unknown as { terminals: Map<string, { recordingStart: number }> }).terminals.get('A')!
    managed.recordingStart = Date.now() - 31 * 60 * 1000
    registry[0].emit('two')

    expect(sent.some((s) => s.ch === IPC.REC_LIMIT && (s.payload as { reason: string }).reason === 'duration')).toBe(true)
    // Recording stopped: the over-limit chunk was not appended.
    expect(mgr.getRecording('A').length).toBe(1)
  })

  it('stops on the size cap', () => {
    mgr.create('A', baseInput)
    mgr.startRecording('A')
    const managed = (mgr as unknown as { terminals: Map<string, { recordedBytes: number }> }).terminals.get('A')!
    managed.recordedBytes = 50 * 1024 * 1024 // at the 50MB cap
    registry[0].emit('overflow')

    expect(sent.some((s) => s.ch === IPC.REC_LIMIT && (s.payload as { reason: string }).reason === 'size')).toBe(true)
  })
})

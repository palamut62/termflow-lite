import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from './appStore'
import { reportTerminalSize } from '../terminalStartup'

/**
 * Optimistic terminal startup: the pane must be on screen BEFORE the PTY spawn
 * round trip completes, and a failed spawn must land the session/window in
 * `error` without ever blocking the UI.
 */

interface Deferred {
  promise: Promise<{ pid: number }>
  resolve: (value: { pid: number }) => void
  reject: (reason: unknown) => void
}

function deferred(): Deferred {
  let resolve!: (v: { pid: number }) => void
  let reject!: (r: unknown) => void
  const promise = new Promise<{ pid: number }>((res, rej) => {
    resolve = res
    reject = rej
  })
  promise.catch(() => undefined) // the slice attaches its handler asynchronously
  return { promise, resolve, reject }
}

const create = vi.fn()
const upsert = vi.fn(() => Promise.resolve())

beforeEach(() => {
  create.mockReset()
  upsert.mockReset()
  upsert.mockImplementation(() => Promise.resolve())
  ;(globalThis as unknown as { window: unknown }).window = globalThis
  ;(globalThis as Record<string, unknown>).termflow = {
    pty: { create, kill: vi.fn(), resize: vi.fn(), write: vi.fn(), setMode: vi.fn() },
    terminals: { upsert, remove: vi.fn(() => Promise.resolve()) },
    layout: { save: vi.fn(() => Promise.resolve()) }
  }
  useAppStore.setState({
    activeWorkspaceId: 'w1',
    workspaces: [{ id: 'w1', name: 'WS', path: 'C:/tmp' } as never],
    nodes: [],
    activeNodeId: null,
    terminals: {}
  })
})

describe('addTerminal optimistic render', () => {
  it('shows the pane before pty.create resolves', async () => {
    const pending = deferred()
    create.mockReturnValue(pending.promise)

    const running = useAppStore.getState().addTerminal('cmd', { forceNewWindow: true })
    // Synchronously after the call the window + terminal already exist.
    const early = useAppStore.getState()
    expect(early.nodes).toHaveLength(1)
    const termId = early.nodes[0].terminalId!
    expect(early.terminals[termId].status).toBe('starting')
    expect(create).not.toHaveBeenCalled() // still waiting for the pane measurement

    reportTerminalSize(termId, 100, 40)
    await Promise.resolve()
    pending.resolve({ pid: 4321 })
    await running

    const after = useAppStore.getState()
    expect(after.terminals[termId].status).toBe('running')
    expect(after.terminals[termId].pid).toBe(4321)
    // The measured size is handed to the spawn so ConPTY never needs a rewrap.
    expect(create.mock.calls[0][1]).toMatchObject({ cols: 100, rows: 40 })
  })

  it('marks the session and its window as error when pty.create rejects', async () => {
    create.mockRejectedValue(new Error('spawn failed'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await useAppStore.getState().addTerminal('cmd', { forceNewWindow: true })

    const st = useAppStore.getState()
    const termId = st.nodes[0].terminalId!
    expect(st.terminals[termId].status).toBe('error')
    expect(st.nodes[0].status).toBe('error')
    errorSpy.mockRestore()
  })

  it('does not await the terminals.upsert persistence round trip', async () => {
    create.mockResolvedValue({ pid: 7 })
    let settleUpsert!: () => void
    upsert.mockImplementation(() => new Promise<void>((res) => { settleUpsert = res }))

    await useAppStore.getState().addTerminal('cmd', { forceNewWindow: true })

    // addTerminal resolved while the persistence call is still pending.
    const st = useAppStore.getState()
    expect(st.terminals[st.nodes[0].terminalId!].status).toBe('running')
    expect(upsert).toHaveBeenCalledTimes(1)
    settleUpsert()
  })

  it('keeps the app alive when persistence rejects', async () => {
    create.mockResolvedValue({ pid: 9 })
    upsert.mockRejectedValue(new Error('disk full'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await useAppStore.getState().addTerminal('cmd', { forceNewWindow: true })
    await Promise.resolve()

    const st = useAppStore.getState()
    expect(st.terminals[st.nodes[0].terminalId!].status).toBe('running')
    errorSpy.mockRestore()
  })
})

describe('splitNode optimistic render', () => {
  it('adds the split pane before the PTY exists and reports errors', async () => {
    create.mockResolvedValue({ pid: 1 })
    await useAppStore.getState().addTerminal('cmd', { forceNewWindow: true })
    const nodeId = useAppStore.getState().nodes[0].id

    const pending = deferred()
    create.mockReturnValue(pending.promise)
    const splitting = useAppStore.getState().splitNode(nodeId, 'horizontal')

    const midNode = useAppStore.getState().nodes[0]
    const leaves = midNode.panes && midNode.panes.type === 'split' ? 2 : 1
    expect(leaves).toBe(2) // pane visible before the spawn resolves
    const newTermId = midNode.activePaneId!
    expect(useAppStore.getState().terminals[newTermId].status).toBe('starting')

    reportTerminalSize(newTermId, 80, 24)
    pending.reject(new Error('nope'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await splitting
    expect(useAppStore.getState().terminals[newTermId].status).toBe('error')
    expect(useAppStore.getState().nodes[0].status).toBe('error')
    errorSpy.mockRestore()
  })
})

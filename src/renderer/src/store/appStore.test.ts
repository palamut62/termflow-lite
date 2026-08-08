import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from './appStore'
import { getLeafTerminalIds, countLeaves } from '../paneUtils'

// These tests exercise pure, window-free state transitions across the split
// slices. Actions that call persist() are safe here because persist() short-
// circuits when there is no active workspace.
const reset = (): void =>
  useAppStore.setState({
    activeWorkspaceId: null,
    nodes: [],
    activeNodeId: null,
    broadcastEnabled: false,
    broadcastGroup: [],
    recordingLimitWarning: null
  })

beforeEach(reset)

describe('window slice', () => {
  it('renames a window', () => {
    useAppStore.setState({ nodes: [{ id: 'n1', title: 'One' } as never] })
    useAppStore.getState().renameNode('n1', 'Renamed')
    expect(useAppStore.getState().nodes[0].title).toBe('Renamed')
  })

  it('selects and clears the active window, clearing its error marker', () => {
    useAppStore.setState({ nodes: [{ id: 'n1', status: 'error' } as never] })
    useAppStore.getState().setActiveNode('n1')
    expect(useAppStore.getState().activeNodeId).toBe('n1')
    expect(useAppStore.getState().nodes[0].status).toBe('idle')
    useAppStore.getState().setActiveNode(null)
    expect(useAppStore.getState().activeNodeId).toBeNull()
  })

  it('reorders windows in the tab strip', () => {
    useAppStore.setState({
      nodes: [{ id: 'a' } as never, { id: 'b' } as never, { id: 'c' } as never]
    })
    useAppStore.getState().moveNode('c', 0)
    expect(useAppStore.getState().nodes.map((n) => n.id)).toEqual(['c', 'a', 'b'])
    useAppStore.getState().moveNode('c', 99) // clamped to the last slot
    expect(useAppStore.getState().nodes.map((n) => n.id)).toEqual(['a', 'b', 'c'])
  })

  it('patches a window without touching the others', () => {
    useAppStore.setState({ nodes: [{ id: 'n1', title: 'One' } as never, { id: 'n2', title: 'Two' } as never] })
    useAppStore.getState().updateNode('n2', { status: 'stopped' })
    expect(useAppStore.getState().nodes[1].status).toBe('stopped')
    expect(useAppStore.getState().nodes[0].status).toBeUndefined()
  })
})

describe('terminal slice', () => {
  it('toggles broadcast and manages the broadcast group', () => {
    const s = useAppStore.getState()
    s.toggleBroadcast()
    expect(useAppStore.getState().broadcastEnabled).toBe(true)

    s.addToBroadcastGroup('t1')
    s.addToBroadcastGroup('t1') // idempotent
    expect(useAppStore.getState().broadcastGroup).toEqual(['t1'])

    s.removeFromBroadcastGroup('t1')
    expect(useAppStore.getState().broadcastGroup).toEqual([])
  })

  it('dismisses recording warnings', () => {
    useAppStore.setState({
      recordingLimitWarning: { terminalId: 't', reason: 'size' }
    })
    useAppStore.getState().dismissRecordingLimitWarning()
    expect(useAppStore.getState().recordingLimitWarning).toBeNull()
  })

  it('tiles every window of the workspace into a single window', () => {
    useAppStore.setState({
      activeWorkspaceId: 'w1',
      terminals: {
        t1: { id: 't1', name: 'One' } as never,
        t2: { id: 't2', name: 'Two' } as never,
        t3: { id: 't3', name: 'Three' } as never
      },
      nodes: [
        { id: 'n1', workspaceId: 'w1', title: 'One', terminalId: 't1', activePaneId: 't1', panes: { type: 'leaf', terminalId: 't1', title: 'One' } } as never,
        { id: 'n2', workspaceId: 'w1', title: 'Two', terminalId: 't2', activePaneId: 't2', panes: { type: 'split', dir: 'vertical', ratio: 0.5, a: { type: 'leaf', terminalId: 't2', title: 'Two' }, b: { type: 'leaf', terminalId: 't3', title: 'Three' } } } as never
      ],
      activeNodeId: 'n2',
      zoomedPaneId: 't2',
      copyModePaneId: 't2'
    })
    useAppStore.getState().tileAllWindows()
    const s = useAppStore.getState()
    expect(s.nodes.map((n) => n.id)).toEqual(['n1'])
    expect(s.activeNodeId).toBe('n1')
    expect(getLeafTerminalIds(s.nodes[0].panes!)).toEqual(['t1', 't2', 't3'])
    expect(countLeaves(s.nodes[0].panes!)).toBe(3)
    // The previously active pane survives and stays selected.
    expect(s.nodes[0].activePaneId).toBe('t2')
    expect(s.zoomedPaneId).toBeNull()
    expect(s.copyModePaneId).toBeNull()
  })

  it('closes every terminal of the workspace, including extra panes', async () => {
    // closeNode() on a split window only closes the *active* pane, so the old
    // "loop closeNode over every node" implementation left panes 3 and 4 alive.
    const killed: string[] = []
    const removed: string[] = []
    ;(globalThis as never as { window: unknown }).window = {
      termflow: {
        pty: { kill: (id: string) => killed.push(id) },
        terminals: { remove: async (id: string) => void removed.push(id) }
      }
    }
    useAppStore.setState({
      activeWorkspaceId: 'w1',
      terminals: {
        t1: { id: 't1' } as never,
        t2: { id: 't2' } as never,
        t3: { id: 't3' } as never,
        other: { id: 'other' } as never
      },
      gitStatus: { t1: {} as never },
      nodes: [
        { id: 'n1', workspaceId: 'w1', terminalId: 't1', panes: { type: 'leaf', terminalId: 't1', title: 'One' } } as never,
        { id: 'n2', workspaceId: 'w1', terminalId: 't2', activePaneId: 't2', panes: { type: 'split', dir: 'vertical', ratio: 0.5, a: { type: 'leaf', terminalId: 't2', title: 'Two' }, b: { type: 'leaf', terminalId: 't3', title: 'Three' } } } as never,
        { id: 'n9', workspaceId: 'w2', terminalId: 'other' } as never
      ],
      activeNodeId: 'n2'
    })

    await useAppStore.getState().closeAllNodes()

    const s = useAppStore.getState()
    expect(killed.sort()).toEqual(['t1', 't2', 't3'])
    expect(removed.sort()).toEqual(['t1', 't2', 't3'])
    expect(Object.keys(s.terminals)).toEqual(['other']) // no stale-snapshot revival
    expect(s.gitStatus.t1).toBeUndefined()
    // Other workspaces are untouched, and the active window falls back to one
    // that still exists.
    expect(s.nodes.map((n) => n.id)).toEqual(['n9'])
    expect(s.activeNodeId).toBe('n9')
  })

  it('does nothing when the workspace has a single window', () => {
    useAppStore.setState({
      activeWorkspaceId: 'w1',
      nodes: [{ id: 'n1', workspaceId: 'w1', title: 'One', terminalId: 't1' } as never],
      activeNodeId: 'n1'
    })
    useAppStore.getState().tileAllWindows()
    expect(useAppStore.getState().nodes.map((n) => n.id)).toEqual(['n1'])
  })
})

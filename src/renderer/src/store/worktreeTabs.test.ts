import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type PersistedSession, type ShellInfo, type TabWorktree } from '../../../shared/types'
import { useSettingsStore } from './settingsStore'
import { useTerminalStore } from './terminalStore'

/**
 * Tab-level behaviour of per-agent worktree isolation. The git side is covered
 * by src/main/worktree*.test.ts; here only the store contract matters.
 */

const SHELLS: ShellInfo[] = [{ id: 'bash', name: 'Bash', kind: 'custom', command: '/bin/bash', args: [] }]

const WT: TabWorktree = {
  repoRoot: '/repo',
  path: '/repo-worktrees/tf-agent-1',
  branch: 'tf/agent-1',
  createdByApp: true
}

beforeEach(() => {
  vi.stubGlobal('window', { termflow: { pty: { kill: vi.fn() } } })
  useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, confirmBeforeClose: false }, shells: SHELLS })
  useTerminalStore.setState({
    tabs: [], activeTabId: null, pendingCloseTabId: null, pendingWorktreeCleanup: null,
    splitDirection: null, splitTabIds: null, splitRatio: 0.5, paneTree: null,
    broadcastInput: false, workspaceCwd: undefined
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('addTab with a worktree', () => {
  it('runs the tab in the checkout and records its metadata', () => {
    const id = useTerminalStore.getState().addTab('bash', true, undefined, undefined, undefined, WT)
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === id)!
    expect(tab.cwd).toBe(WT.path)
    expect(tab.launchCwd).toBe(WT.path)
    expect(tab.worktree).toEqual(WT)
  })

  it('does not leak the checkout into workspaceCwd', () => {
    useTerminalStore.setState({ workspaceCwd: '/repo' })
    useTerminalStore.getState().addTab('bash', true, undefined, undefined, undefined, WT)
    expect(useTerminalStore.getState().workspaceCwd).toBe('/repo')

    // A later plain tab still inherits the repository, not the worktree.
    const plain = useTerminalStore.getState().addTab('bash')
    expect(useTerminalStore.getState().tabs.find((t) => t.id === plain)!.cwd).toBe('/repo')
  })

  it('wins over an explicit cwd argument', () => {
    const id = useTerminalStore.getState().addTab('bash', true, '/elsewhere', undefined, undefined, WT)
    expect(useTerminalStore.getState().tabs.find((t) => t.id === id)!.cwd).toBe(WT.path)
  })
})

describe('closeTab worktree cleanup', () => {
  it('queues cleanup when the last tab using the checkout closes', () => {
    const id = useTerminalStore.getState().addTab('bash', true, undefined, undefined, undefined, WT)
    useTerminalStore.getState().closeTab(id)
    expect(useTerminalStore.getState().pendingWorktreeCleanup).toEqual(WT)
  })

  it('stays quiet while another tab still uses the same checkout', () => {
    const first = useTerminalStore.getState().addTab('bash', true, undefined, undefined, undefined, WT)
    useTerminalStore.getState().addTab('bash', true, undefined, undefined, undefined, WT)
    useTerminalStore.getState().closeTab(first)
    expect(useTerminalStore.getState().pendingWorktreeCleanup).toBeNull()
  })

  it('never offers cleanup for a checkout TermFlow did not create', () => {
    const external: TabWorktree = { ...WT, createdByApp: false }
    const id = useTerminalStore.getState().addTab('bash', true, undefined, undefined, undefined, external)
    useTerminalStore.getState().closeTab(id)
    expect(useTerminalStore.getState().pendingWorktreeCleanup).toBeNull()
  })

  it('stays quiet for ordinary tabs', () => {
    const id = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().closeTab(id)
    expect(useTerminalStore.getState().pendingWorktreeCleanup).toBeNull()
  })

  it('is dismissable', () => {
    const id = useTerminalStore.getState().addTab('bash', true, undefined, undefined, undefined, WT)
    useTerminalStore.getState().closeTab(id)
    useTerminalStore.getState().dismissWorktreeCleanup()
    expect(useTerminalStore.getState().pendingWorktreeCleanup).toBeNull()
  })
})

describe('hydrateSession with worktrees', () => {
  const session = (): PersistedSession => ({
    version: 1,
    tabs: [
      { id: 'a', title: 'Agent', profileId: 'bash', cwd: WT.path, worktree: WT },
      { id: 'b', title: 'Shell', profileId: 'bash', cwd: '/old' }
    ],
    activeTabId: 'a',
    paneTree: null,
    splitDirection: null,
    splitRatio: 0.5
  })

  it('restores the checkout and pins the tab to it', () => {
    useTerminalStore.getState().hydrateSession(session())
    const tab = useTerminalStore.getState().tabs.find((t) => t.id === 'a')!
    expect(tab.worktree).toEqual(WT)
    expect(tab.cwd).toBe(WT.path)
  })

  it('keeps a worktree tab in place when a startup directory is forced', () => {
    useTerminalStore.getState().hydrateSession(session(), '/startup', true)
    const tabs = useTerminalStore.getState().tabs
    expect(tabs.find((t) => t.id === 'a')!.cwd).toBe(WT.path)
    // A normal tab still follows the override.
    expect(tabs.find((t) => t.id === 'b')!.cwd).toBe('/startup')
  })
})

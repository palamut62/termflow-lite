import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type ShellInfo } from '../../../shared/types'
import { useSettingsStore } from './settingsStore'
import { broadcastTargetIds, useTerminalStore } from './terminalStore'

/**
 * Renderer store tests run in the plain node vitest environment — the
 * terminalStore's closeTab touches window.termflow.pty.kill, so it is stubbed
 * here. Kapatma onayı artık uygulama içi bir modal (pendingCloseTabId) ile
 * yürür; native window.confirm kullanılmaz. The settings store is imported for
 * real (its module init has no DOM side effects) and seeded per test via
 * setState.
 */

const SHELLS: ShellInfo[] = [
  { id: 'bash', name: 'Bash', kind: 'custom', command: '/bin/bash', args: [] },
  { id: 'sh', name: 'Shell', kind: 'custom', command: '/bin/sh', args: [] }
]

const killMock = vi.fn()

beforeEach(() => {
  killMock.mockReset()
  vi.stubGlobal('window', {
    termflow: { pty: { kill: killMock } }
  })
  useSettingsStore.setState({
    settings: { ...DEFAULT_SETTINGS, confirmBeforeClose: true },
    shells: SHELLS
  })
  useTerminalStore.setState({ tabs: [], activeTabId: null, pendingCloseTabId: null, splitDirection: null, splitTabIds: null, splitRatio: 0.5, paneTree: null, broadcastInput: false, workspaceCwd: undefined })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('addTab', () => {
  it('appends a tab, activates it and titles it with the profile name', () => {
    const id = useTerminalStore.getState().addTab('bash')
    const st = useTerminalStore.getState()
    expect(st.tabs).toHaveLength(1)
    expect(st.activeTabId).toBe(id)
    expect(st.tabs[0].title).toBe('Bash') // shell name
    expect(st.tabs[0].profileId).toBe('bash')
  })

  it('keeps an explicit launch directory separate from live cwd updates', () => {
    const id = useTerminalStore.getState().addTab('bash', true, '/work/project')
    useTerminalStore.getState().setTabCwd(id, '/work/project/subdir')
    const tab = useTerminalStore.getState().tabs.find((item) => item.id === id)
    expect(tab?.launchCwd).toBe('/work/project')
    expect(tab?.cwd).toBe('/work/project/subdir')
  })

  it('uses the shared custom startup directory for shells and agents', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, startupDirectory: 'custom', customStartupDirectory: 'C:\\default-workspace' }
    })
    useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().addTab('claude')
    expect(useTerminalStore.getState().tabs.map((tab) => tab.launchCwd)).toEqual([
      'C:\\default-workspace',
      'C:\\default-workspace'
    ])
  })

  it('prefers an Explorer launch path over the configured startup directory', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, startupDirectory: 'custom', customStartupDirectory: 'C:\\default-workspace' }
    })
    useTerminalStore.getState().addTab('bash', true, 'C:\\opened-folder')
    useTerminalStore.getState().addTab('codex')
    expect(useTerminalStore.getState().tabs.map((tab) => tab.launchCwd)).toEqual([
      'C:\\opened-folder',
      'C:\\opened-folder'
    ])
  })

  it('uses the last directory when that startup option is selected', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, startupDirectory: 'last', lastCwd: 'C:\\recent-project' }
    })
    useTerminalStore.getState().addTab('provider:deepseek')
    expect(useTerminalStore.getState().tabs[0].launchCwd).toBe('C:\\recent-project')
  })

  it('uses the custom profile name when the profile is user-defined', () => {
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS, profiles: [{ id: 'dev', name: 'Dev Box', command: 'tmux' }] }
    })
    const id = useTerminalStore.getState().addTab('dev')
    expect(useTerminalStore.getState().tabs[0].title).toBe('Dev Box')
    expect(useTerminalStore.getState().tabs[0].id).toBe(id)
  })

  it('uses the built-in agent name for agent tabs', () => {
    useTerminalStore.getState().addTab('claude')
    expect(useTerminalStore.getState().tabs[0].title).toBe('Claude Code')
  })

  it('keeps a saved command on the new tab for one-time launch', () => {
    const id = useTerminalStore.getState().addTab('bash', true, undefined, 'npm run dev')
    const tab = useTerminalStore.getState().tabs.find((item) => item.id === id)
    expect(tab?.launchCommand).toBe('npm run dev')
  })

  it('opens a resumed agent session with its id and original directory', () => {
    const id = useTerminalStore.getState().resumeAgentSession('codex', { agent: 'codex', id: 'session-42' }, 'C:\\repo')
    const tab = useTerminalStore.getState().tabs[0]
    expect(tab.id).toBe(id)
    expect(tab.profileId).toBe('codex')
    expect(tab.launchCwd).toBe('C:\\repo')
    expect(tab.resumeSession).toEqual({ agent: 'codex', id: 'session-42' })
  })

  it('uses the provider name for provider tabs', () => {
    useTerminalStore.getState().addTab('provider:deepseek')
    expect(useTerminalStore.getState().tabs[0].title).toBe('DeepSeek')
  })

  it('keeps the current active tab when activate=false', () => {
    const first = useTerminalStore.getState().addTab('bash')
    const second = useTerminalStore.getState().addTab('sh', false)
    const st = useTerminalStore.getState()
    expect(st.activeTabId).toBe(first)
    expect(st.tabs[1].id).toBe(second)
  })
})

describe('closeTab', () => {
  it('moves the active state to the neighbour when the active tab closes', () => {
    const t1 = useTerminalStore.getState().addTab('bash')
    const t2 = useTerminalStore.getState().addTab('sh')
    useTerminalStore.getState().setActiveTab(t1)
    useTerminalStore.getState().closeTab(t1)
    const st = useTerminalStore.getState()
    expect(st.tabs.map((t) => t.id)).toEqual([t2])
    expect(st.activeTabId).toBe(t2)
  })

  it('opens a fresh default-profile tab when the last tab is closed', () => {
    const id = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().closeTab(id)
    const st = useTerminalStore.getState()
    expect(st.tabs).toHaveLength(1)
    expect(st.activeTabId).toBe(st.tabs[0].id)
    // defaultProfileId 'powershell' is not installed -> first by priority: bash
    expect(st.tabs[0].profileId).toBe('bash')
  })

  it('requestCloseTab defers to the confirm modal when confirmBeforeClose is set', () => {
    const t1 = useTerminalStore.getState().addTab('bash')
    const t2 = useTerminalStore.getState().addTab('sh')
    useTerminalStore.getState().requestCloseTab(t1)
    expect(useTerminalStore.getState().pendingCloseTabId).toBe(t1)
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([t1, t2])
    expect(killMock).not.toHaveBeenCalled()
  })

  it('cancelCloseTab aborts the pending close', () => {
    const t1 = useTerminalStore.getState().addTab('bash')
    const t2 = useTerminalStore.getState().addTab('sh')
    useTerminalStore.getState().requestCloseTab(t1)
    useTerminalStore.getState().cancelCloseTab()
    expect(useTerminalStore.getState().pendingCloseTabId).toBeNull()
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([t1, t2])
    expect(killMock).not.toHaveBeenCalled()
  })

  it('confirmCloseTab closes the pending tab', () => {
    const t1 = useTerminalStore.getState().addTab('bash')
    const t2 = useTerminalStore.getState().addTab('sh')
    useTerminalStore.getState().requestCloseTab(t1)
    useTerminalStore.getState().confirmCloseTab()
    expect(useTerminalStore.getState().pendingCloseTabId).toBeNull()
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([t2])
    expect(killMock).toHaveBeenCalledWith(t1)
  })

  it('requestCloseTab closes directly when confirmBeforeClose is off', () => {
    useSettingsStore.setState({ settings: { ...DEFAULT_SETTINGS, confirmBeforeClose: false } })
    const t1 = useTerminalStore.getState().addTab('bash')
    const t2 = useTerminalStore.getState().addTab('sh')
    useTerminalStore.getState().requestCloseTab(t1)
    expect(useTerminalStore.getState().pendingCloseTabId).toBeNull()
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([t2])
    expect(killMock).toHaveBeenCalledWith(t1)
  })

  it('requestCloseTab is a no-op for an unknown id', () => {
    useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().requestCloseTab('nope')
    expect(useTerminalStore.getState().pendingCloseTabId).toBeNull()
    expect(killMock).not.toHaveBeenCalled()
  })

  it('is a no-op for an unknown id', () => {
    const t1 = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().closeTab('nope')
    expect(useTerminalStore.getState().tabs).toHaveLength(1)
    expect(killMock).not.toHaveBeenCalled()
    expect(useTerminalStore.getState().activeTabId).toBe(t1)
  })
})

describe('broadcastTargetIds', () => {
  it('writes only to its own terminal when broadcast is off', () => {
    expect(broadcastTargetIds('a', ['a', 'b'], false)).toEqual(['a'])
  })

  it('writes only to its own terminal when there is no split', () => {
    expect(broadcastTargetIds('a', null, true)).toEqual(['a'])
    expect(broadcastTargetIds('a', ['a'], true)).toEqual(['a'])
  })

  it('writes to every split pane when broadcast is on', () => {
    expect(broadcastTargetIds('a', ['a', 'b', 'c'], true)).toEqual(['a', 'b', 'c'])
  })

  it('ignores panes the tab does not belong to', () => {
    expect(broadcastTargetIds('z', ['a', 'b'], true)).toEqual(['z'])
  })

  it('toggleBroadcastInput flips the session-only flag', () => {
    useTerminalStore.getState().toggleBroadcastInput()
    expect(useTerminalStore.getState().broadcastInput).toBe(true)
    useTerminalStore.getState().toggleBroadcastInput()
    expect(useTerminalStore.getState().broadcastInput).toBe(false)
  })
})

describe('hydrateSession', () => {
  const session = {
    version: 1 as const,
    tabs: [
      { id: 'a', title: 'Bash', profileId: 'bash', cwd: '/work' },
      { id: 'b', title: 'Shell', profileId: 'sh' }
    ],
    activeTabId: 'b',
    paneTree: { type: 'split', dir: 'vertical', ratio: 0.5, a: { type: 'leaf', terminalId: 'a' }, b: { type: 'leaf', terminalId: 'b' } },
    splitDirection: 'vertical' as const,
    splitRatio: 0.5
  }

  it('restores tabs, active tab and the pane layout', () => {
    expect(useTerminalStore.getState().hydrateSession(session)).toBe(true)
    const st = useTerminalStore.getState()
    expect(st.tabs.map((t) => t.id)).toEqual(['a', 'b'])
    expect(st.activeTabId).toBe('b')
    expect(st.splitTabIds).toEqual(['a', 'b'])
    expect(st.splitDirection).toBe('vertical')
    // cwd, PTY'nin o klasörde açılması için launchCwd olarak da verilir
    expect(st.tabs[0]).toMatchObject({ cwd: '/work', launchCwd: '/work' })
  })

  it('restarts restored shells and agents in the configured startup directory', () => {
    expect(useTerminalStore.getState().hydrateSession(session, 'C:\\default-workspace')).toBe(true)
    const st = useTerminalStore.getState()
    expect(st.tabs.map((tab) => tab.launchCwd)).toEqual([
      'C:\\default-workspace',
      'C:\\default-workspace'
    ])
    expect(st.workspaceCwd).toBe('C:\\default-workspace')
  })

  it('lets the PTY resolve Home when Home is the configured startup directory', () => {
    expect(useTerminalStore.getState().hydrateSession(session, undefined, true)).toBe(true)
    expect(useTerminalStore.getState().tabs.map((tab) => tab.launchCwd)).toEqual([undefined, undefined])
    expect(useTerminalStore.getState().workspaceCwd).toBeUndefined()
  })

  it('rejects a paneTree that references unknown terminals', () => {
    const ok = useTerminalStore.getState().hydrateSession({
      ...session,
      paneTree: { type: 'split', dir: 'vertical', ratio: 0.5, a: { type: 'leaf', terminalId: 'a' }, b: { type: 'leaf', terminalId: 'ghost' } }
    })
    expect(ok).toBe(true)
    const st = useTerminalStore.getState()
    expect(st.paneTree).toBeNull()
    expect(st.splitTabIds).toBeNull()
    expect(st.splitDirection).toBeNull()
    expect(st.tabs).toHaveLength(2)
  })

  it('refuses an empty session', () => {
    expect(useTerminalStore.getState().hydrateSession({ ...session, tabs: [] })).toBe(false)
    expect(useTerminalStore.getState().tabs).toEqual([])
  })
})

describe('renameTab / moveTab / setTabCwd', () => {
  it('creates and closes a two-pane split while keeping both tabs alive', () => {
    const first = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().splitActive('vertical')
    const split = useTerminalStore.getState()
    expect(split.tabs).toHaveLength(2)
    expect(split.splitTabIds?.[0]).toBe(first)
    expect(split.splitDirection).toBe('vertical')
    useTerminalStore.getState().setSplitDirection('horizontal')
    expect(useTerminalStore.getState().splitDirection).toBe('horizontal')
    useTerminalStore.getState().setSplitRatio(0.95)
    expect(useTerminalStore.getState().splitRatio).toBe(0.85)
    useTerminalStore.getState().closeSplit()
    expect(useTerminalStore.getState().splitTabIds).toBeNull()
  })

  it('tracks process activity and clears unread output on selection', () => {
    const first = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().addTab('sh')
    useTerminalStore.getState().setTabActivity(first, 'unread')
    expect(useTerminalStore.getState().tabs[0].activity).toBe('unread')
    useTerminalStore.getState().setActiveTab(first)
    expect(useTerminalStore.getState().tabs[0].activity).toBe('running')
    useTerminalStore.getState().setTabActivity(first, 'error')
    expect(useTerminalStore.getState().tabs[0]).toMatchObject({ activity: 'error', running: false })
  })

  it('renames a tab in place', () => {
    const id = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().renameTab(id, 'My Shell')
    expect(useTerminalStore.getState().tabs[0].title).toBe('My Shell')
  })

  it('moveTab clamps to the valid range', () => {
    const a = useTerminalStore.getState().addTab('bash')
    const b = useTerminalStore.getState().addTab('sh')
    const c = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().moveTab(a, 99) // past the end
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([b, c, a])
    useTerminalStore.getState().moveTab(c, -5) // before the start
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([c, b, a])
  })

  it('moveTab ignores unknown ids', () => {
    const a = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().moveTab('nope', 0)
    expect(useTerminalStore.getState().tabs.map((t) => t.id)).toEqual([a])
  })

  it('setTabCwd updates the tab cwd', () => {
    const id = useTerminalStore.getState().addTab('bash')
    useTerminalStore.getState().setTabCwd(id, '/home/dev/project')
    expect(useTerminalStore.getState().tabs[0].cwd).toBe('/home/dev/project')
  })

  it('changes only the selected tab working directory', () => {
    const first = useTerminalStore.getState().addTab('powershell', true, 'C:\\first')
    const second = useTerminalStore.getState().addTab('cmd', true, 'C:\\second')
    useTerminalStore.getState().setTabWorkingDirectory(first, 'C:\\changed')
    const tabs = useTerminalStore.getState().tabs
    expect(tabs.find((tab) => tab.id === first)).toMatchObject({ cwd: 'C:\\changed', launchCwd: 'C:\\changed' })
    expect(tabs.find((tab) => tab.id === second)).toMatchObject({ cwd: 'C:\\second', launchCwd: 'C:\\second' })
  })
})

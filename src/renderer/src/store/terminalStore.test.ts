import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS, type ShellInfo } from '../../../shared/types'
import { useSettingsStore } from './settingsStore'
import { useTerminalStore } from './terminalStore'

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
  useTerminalStore.setState({ tabs: [], activeTabId: null, pendingCloseTabId: null })
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

describe('renameTab / moveTab / setTabCwd', () => {
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
})

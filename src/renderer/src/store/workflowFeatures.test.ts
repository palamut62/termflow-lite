import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/types'
import { useSettingsStore } from './settingsStore'
import { useTerminalStore } from './terminalStore'
import { useSavedCommandStore, selectDueCommands, normalizeStoredCommands } from './savedCommandStore'
import { openWorkspace, useWorkspaceStore } from './workspaceStore'
import { exportBackup, parseBackup } from '../settings/backupData'
import { paneTerminalIds } from '../paneUtils'
import { useHandoverStore } from './handoverStore'

beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn() })
  vi.stubGlobal('window', { termflow: { pty: { kill: vi.fn() } } })
  useSettingsStore.setState({ settings: structuredClone(DEFAULT_SETTINGS), shells: [] })
  useTerminalStore.setState({ tabs: [], activeTabId: null, paneTree: null, splitTabIds: null, workspaceCwd: undefined })
  useWorkspaceStore.setState({ workspaces: [] }); useSavedCommandStore.setState({ commands: [] })
})

describe('workspaces and session continuity', () => {
  it('restores distinct folders and pinned permission mode', () => {
    useTerminalStore.getState().hydrateSession({ version: 1, tabs: [
      { id: 'a', title: 'A', profileId: 'cmd', cwd: 'C:\\a', permissionMode: 'safe' },
      { id: 'b', title: 'B', profileId: 'cmd', cwd: 'C:\\b' }
    ], activeTabId: 'a', paneTree: null, splitDirection: null, splitRatio: 0.5 })
    expect(useTerminalStore.getState().tabs.map(t => t.launchCwd)).toEqual(['C:\\a', 'C:\\b'])
    expect(useTerminalStore.getState().tabs[0].permissionMode).toBe('safe')
  })
  it('places resumed sessions in the visible split tree', () => {
    useTerminalStore.getState().addTab('cmd'); useTerminalStore.getState().splitActive('vertical')
    const id = useTerminalStore.getState().resumeAgentSession('codex', { agent: 'codex', id: 'resume-test' })
    expect(paneTerminalIds(useTerminalStore.getState().paneTree!)).toContain(id)
  })
  it('opens saved panes with fresh IDs while preserving existing tabs', () => {
    const original = useTerminalStore.getState().addTab('cmd', true, 'C:\\project')
    useTerminalStore.getState().splitActive('vertical')
    useWorkspaceStore.getState().save('Project')
    const workspace = useWorkspaceStore.getState().workspaces[0]
    openWorkspace(workspace)
    const state = useTerminalStore.getState()
    expect(state.tabs).toHaveLength(4)
    expect(state.tabs.some(t => t.id === original)).toBe(true)
    expect(paneTerminalIds(state.paneTree!)).not.toContain(original)
  })
})

describe('scheduled task lifecycle', () => {
  it('blocks overlapping and paused jobs, and stores actual completion', () => {
    const store = useSavedCommandStore.getState()
    store.add('Job', 'echo hello', 'cmd', { kind: 'interval', minutes: 1 })
    const id = useSavedCommandStore.getState().commands[0].id
    store.configure(id, 'C:\\project', true); store.startRun(id, 'tab', 100)
    expect(selectDueCommands(useSavedCommandStore.getState().commands, 100000)).toHaveLength(0)
    store.finishRun('tab', 7, 2500)
    expect(useSavedCommandStore.getState().commands[0].results?.[0]).toMatchObject({ exitCode: 7, durationMs: 2500 })
    expect(selectDueCommands(useSavedCommandStore.getState().commands, 100000)).toHaveLength(1)
    store.configure(id, 'C:\\project', false)
    expect(selectDueCommands(useSavedCommandStore.getState().commands, 100000)).toHaveLength(0)
  })
  it('marks an in-flight job interrupted after reloading', () => {
    const result = normalizeStoredCommands([{ id: 'job', name: 'Job', command: 'echo hi', activeTabId: 'gone', cwd: 'C:\\a' }], 1000)
    expect(result.commands[0].activeTabId).toBeUndefined()
    expect(result.commands[0].results?.[0].message).toContain('Interrupted')
  })
})

describe('backup and handover', () => {
  it('round-trips configuration while removing environment secrets and pausing imported jobs', () => {
    const settings = structuredClone(DEFAULT_SETTINGS)
    settings.profiles.push({ id: 'a', name: 'A', command: 'cmd', env: { TOKEN: 'synthetic-value' } })
    const text = exportBackup(settings, [{ id: 'job', name: 'Job', profileId: 'cmd', command: 'echo hi', enabled: true }], [])
    expect(text).not.toContain('synthetic-value')
    const imported = parseBackup(text)
    expect(imported.settings.profiles[0].command).toBe('cmd')
    expect(imported.commands[0].enabled).toBe(false)
  })
  it('rejects invalid backup versions and malformed profiles before applying', () => {
    expect(() => parseBackup('{"version":2}')).toThrow()
    const data = JSON.parse(exportBackup(DEFAULT_SETTINGS, [], []))
    data.settings.profiles = [null]
    expect(() => parseBackup(JSON.stringify(data))).toThrow('Invalid profiles')
  })
  it('does not release a handover prompt until the user approves it', async () => {
    const store = useHandoverStore.getState()
    const promise = store.review({ source: 'Claude', target: 'Codex', prompt: 'Original' })
    expect(useHandoverStore.getState().pending?.prompt).toBe('Original')
    store.finish('Edited context')
    expect(await promise).toBe('Edited context')
    const canceled = store.review({ source: 'Claude', target: 'Codex', prompt: 'Original' })
    store.finish(null); expect(await canceled).toBeNull()
  })
})

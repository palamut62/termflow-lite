import { describe, expect, it } from 'vitest'
import type { TabActivity, TerminalTab } from '../../shared/types'
import { NO_FOLDER_LABEL, buildRailGroups, groupAttention, groupPathFor, pathLabel } from './sessionRail'

function tab(id: string, overrides: Partial<TerminalTab> = {}): TerminalTab {
  return {
    id,
    title: id,
    profileId: 'bash',
    running: true,
    activity: 'running',
    startedAt: 0,
    ...overrides
  }
}

describe('pathLabel', () => {
  it('returns the last segment for both separators', () => {
    expect(pathLabel('C:\\projects\\my-app')).toBe('my-app')
    expect(pathLabel('/home/u/my-app')).toBe('my-app')
  })

  it('ignores trailing separators', () => {
    expect(pathLabel('/home/u/my-app/')).toBe('my-app')
    expect(pathLabel('C:\\projects\\my-app\\')).toBe('my-app')
  })

  it('falls back for empty input and keeps drive roots readable', () => {
    expect(pathLabel('')).toBe(NO_FOLDER_LABEL)
    expect(pathLabel(undefined as unknown as string)).toBe(NO_FOLDER_LABEL)
    expect(pathLabel('C:')).toBe('C:')
  })
})

describe('groupPathFor', () => {
  it('attributes a worktree tab to its repository, not its checkout', () => {
    const worktree = { repoRoot: '/repo', path: '/wt/agent-1', branch: 'tf/agent-1', createdByApp: true }
    expect(groupPathFor(tab('a', { worktree, cwd: '/wt/agent-1' }))).toBe('/repo')
  })

  it('prefers launchCwd so a cd inside the shell does not move the tab', () => {
    expect(groupPathFor(tab('a', { launchCwd: '/repo', cwd: '/repo/src/deep' }))).toBe('/repo')
  })

  it('resolves a plain cwd to its repository root when known', () => {
    const roots = new Map([['/repo/packages/web', '/repo']])
    expect(groupPathFor(tab('a', { launchCwd: '/repo/packages/web' }), roots)).toBe('/repo')
  })

  it('groups by the raw path when no repository is known', () => {
    expect(groupPathFor(tab('a', { launchCwd: '/tmp' }))).toBe('/tmp')
    expect(groupPathFor(tab('a'))).toBe('')
  })
})

describe('buildRailGroups', () => {
  it('collects sessions per repository and marks the active one', () => {
    const worktree = { repoRoot: '/repo', path: '/wt/a1', branch: 'tf/a1', createdByApp: true }
    const groups = buildRailGroups(
      [
        tab('one', { launchCwd: '/repo', title: 'Claude' }),
        tab('two', { worktree, title: 'Codex' }),
        tab('three', { launchCwd: '/other', title: 'Bash' })
      ],
      'two'
    )

    expect(groups.map((g) => g.label)).toEqual(['repo', 'other'])
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['one', 'two'])
    expect(groups[0].sessions[1]).toMatchObject({ branch: 'tf/a1', active: true })
    expect(groups[0].sessions[0].active).toBe(false)
    expect(groups[1].sessions).toHaveLength(1)
  })

  it('keeps group order stable by first appearance', () => {
    const groups = buildRailGroups(
      [tab('a', { launchCwd: '/z' }), tab('b', { launchCwd: '/a' }), tab('c', { launchCwd: '/z' })],
      null
    )
    expect(groups.map((g) => g.path)).toEqual(['/z', '/a'])
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['a', 'c'])
  })

  it('groups pathless tabs together under a single fallback entry', () => {
    const groups = buildRailGroups([tab('a'), tab('b')], null)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe(NO_FOLDER_LABEL)
  })

  it('returns nothing for an empty tab list', () => {
    expect(buildRailGroups([], null)).toEqual([])
  })
})

describe('groupAttention', () => {
  const withActivities = (...activities: TabActivity[]): ReturnType<typeof buildRailGroups>[number] =>
    buildRailGroups(activities.map((activity, i) => tab(`t${i}`, { activity, launchCwd: '/repo' })), null)[0]

  it('reports the most urgent activity', () => {
    expect(groupAttention(withActivities('running', 'waiting', 'error'))).toBe('error')
    expect(groupAttention(withActivities('running', 'unread', 'waiting'))).toBe('waiting')
    expect(groupAttention(withActivities('completed', 'unread'))).toBe('unread')
  })

  it('is null when nothing needs attention', () => {
    expect(groupAttention(withActivities('running', 'completed'))).toBeNull()
  })
})

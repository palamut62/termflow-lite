import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type TerminalTab } from '../../shared/types'
import { agentProfileOptions, findSessionForTab } from './agentHandover'

const tab: TerminalTab = {
  id: 'tab', title: 'DeepSeek', profileId: 'provider:deepseek', running: true,
  activity: 'running', startedAt: 10_000, cwd: 'C:\\repo'
}

describe('agent handover selection', () => {
  it('offers command profiles and providers across native agent CLIs', () => {
    const options = agentProfileOptions(DEFAULT_SETTINGS)
    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'claude', agent: 'claude' }),
      expect.objectContaining({ id: 'codex', agent: 'codex' }),
      expect.objectContaining({ id: 'provider:deepseek', agent: 'claude' })
    ]))
  })

  it('prefers the session owned by the active provider in the same folder', () => {
    const session = findSessionForTab(tab, 'claude', [
      { agent: 'claude', id: 'plain', title: 'Plain', cwd: 'C:\\repo', createdAt: 10_100, updatedAt: 11_000, profileId: 'claude' },
      { agent: 'claude', id: 'deepseek', title: 'DeepSeek', cwd: 'C:\\repo', createdAt: 10_200, updatedAt: 12_000, profileId: 'provider:deepseek' }
    ])
    expect(session).toMatchObject({ agent: 'claude', id: 'deepseek' })
  })

  it('uses an explicit resumed session before scanning nearby sessions', () => {
    const resumed = { ...tab, resumeSession: { agent: 'claude' as const, id: 'original' } }
    expect(findSessionForTab(resumed, 'claude', [])).toEqual({ agent: 'claude', id: 'original' })
  })

  it('does not attach a much newer session from the same folder', () => {
    expect(findSessionForTab(tab, 'claude', [
      { agent: 'claude', id: 'later', title: 'Later', cwd: 'C:\\repo', createdAt: 200_000, updatedAt: 200_000, profileId: 'provider:deepseek' }
    ])).toBeUndefined()
  })
})

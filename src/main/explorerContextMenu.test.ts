import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/types'
import { buildExplorerMenuEntries } from './explorerContextMenu'

describe('buildExplorerMenuEntries', () => {
  it('includes default, installed shells, command profiles and providers', () => {
    const entries = buildExplorerMenuEntries(DEFAULT_SETTINGS, [{ id: 'cmd', name: 'Command Prompt', kind: 'cmd', command: 'cmd.exe', args: [] }])
    expect(entries.map((entry) => entry.profileId)).toEqual(expect.arrayContaining([undefined, 'cmd', 'claude', 'codex', 'provider:deepseek']))
  })
})

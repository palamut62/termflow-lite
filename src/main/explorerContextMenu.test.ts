import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/types'
import { buildExplorerMenuEntries, parseRegistryChildNames } from './explorerContextMenu'

describe('buildExplorerMenuEntries', () => {
  it('includes default, installed shells, command profiles and providers', () => {
    const entries = buildExplorerMenuEntries(DEFAULT_SETTINGS, [{ id: 'cmd', name: 'Command Prompt', kind: 'cmd', command: 'cmd.exe', args: [] }])
    expect(entries.map((entry) => entry.profileId)).toEqual(expect.arrayContaining([undefined, 'cmd', 'claude', 'codex', 'provider:deepseek']))
    expect(entries.find((entry) => entry.profileId === 'claude')?.icon).toBe('claude')
    expect(entries.find((entry) => entry.profileId === 'cmd')?.icon).toBe('cmd.exe')
  })

  it('parses direct registry children from expanded HKCU output', () => {
    const stdout = [
      'HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\TermFlowLite\\shell',
      'HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\TermFlowLite\\shell\\000-default',
      'HKEY_CURRENT_USER\\Software\\Classes\\Directory\\shell\\TermFlowLite\\shell\\stale-profile'
    ].join('\r\n')
    expect(parseRegistryChildNames(stdout)).toEqual(['000-default', 'stale-profile'])
  })
})

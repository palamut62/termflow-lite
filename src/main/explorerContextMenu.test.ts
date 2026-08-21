import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type ShellInfo } from '../shared/types'
import { buildExplorerMenuEntries, explorerMenuSignature, parseRegistryChildNames } from './explorerContextMenu'

describe('explorerMenuSignature', () => {
  const shells: ShellInfo[] = [{ id: 'cmd', name: 'Command Prompt', kind: 'cmd', command: 'cmd.exe', args: [] }]

  it('changes only when menu-affecting data changes', () => {
    const base = explorerMenuSignature(DEFAULT_SETTINGS, shells)
    // Sık güncellenen ama menüyü etkilemeyen ayarlar imzayı değiştirmez:
    // her SETTINGS_SET'te registry yeniden yazılmasın.
    expect(explorerMenuSignature({ ...DEFAULT_SETTINGS, lastCwd: 'C:\\elsewhere', themeId: 'abyss' }, shells)).toBe(base)
    expect(explorerMenuSignature({ ...DEFAULT_SETTINGS, profiles: [{ id: 'x', name: 'X', command: 'x' }] }, shells)).not.toBe(base)
    expect(explorerMenuSignature({ ...DEFAULT_SETTINGS, providerProfiles: [] }, shells)).not.toBe(base)
    expect(explorerMenuSignature(DEFAULT_SETTINGS, [])).not.toBe(base)
  })
})

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

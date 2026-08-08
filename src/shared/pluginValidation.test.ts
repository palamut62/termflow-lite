import { describe, expect, it } from 'vitest'
import { pluginMatchesWorkspace, validatePluginManifest } from './pluginValidation'

describe('plugin manifest validation', () => {
  it('normalizes a v2 manifest and supplies terminal permission', () => {
    const plugin = validatePluginManifest({ schemaVersion: 2, id: 'Acme.Node', name: 'Node Tools', version: '1.2.0', commands: [{ id: 'test', title: 'Test', command: 'npm test' }] })
    expect(plugin.id).toBe('acme.node')
    expect(plugin.permissions).toEqual(['terminal:execute'])
  })

  it('rejects duplicate commands and invalid versions', () => {
    expect(() => validatePluginManifest({ schemaVersion: 2, id: 'acme.node', name: 'Node', version: 'latest', commands: [{ id: 'test', title: 'A', command: 'a' }, { id: 'test', title: 'B', command: 'b' }] })).toThrow()
  })

  it('matches workspace activation events', () => {
    const plugin = validatePluginManifest({ schemaVersion: 2, id: 'acme.node', name: 'Node', version: '1.0.0', activationEvents: ['workspaceContains:package.json'], commands: [{ id: 'test', title: 'Test', command: 'npm test' }] })
    expect(pluginMatchesWorkspace(plugin, new Set(['package.json']))).toBe(true)
    expect(pluginMatchesWorkspace(plugin, new Set(['cargo.toml']))).toBe(false)
  })
})

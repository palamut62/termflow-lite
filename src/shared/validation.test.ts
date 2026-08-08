import { describe, expect, it } from 'vitest'
import { isValidSshProfile, validateManifest, validateWorkspaceExport } from './validation'

describe('validateManifest', () => {
  it('accepts a bounded developer manifest', () => {
    const result = validateManifest({ tasks: [{ name: 'Test', command: 'npm test', shell: 'cmd' }], env: [{ key: 'API_KEY', masked: true }] })
    expect(result.errors).toEqual([])
    expect(result.data?.tasks?.[0].name).toBe('Test')
  })

  it('rejects invalid shells and environment keys', () => {
    const result = validateManifest({ tasks: [{ name: 'Bad', command: 'x', shell: 'unknown' }], env: [{ key: 'BAD KEY' }] })
    expect(result.data).toBeNull()
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe('validateWorkspaceExport', () => {
  it('rejects unsupported exports', () => {
    expect(validateWorkspaceExport({ schemaVersion: 2 }).data).toBeNull()
  })

  it('accepts the current schema', () => {
    const result = validateWorkspaceExport({ schemaVersion: 1, exportedAt: new Date().toISOString(), workspace: { name: 'Demo' }, nodes: [], terminals: [] })
    expect(result.errors).toEqual([])
  })

  it('accepts legacy exports that still carry canvas geometry', () => {
    const result = validateWorkspaceExport({
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      workspace: { name: 'Legacy', defaultLayoutMode: 'grid' },
      nodes: [{ id: 'n1', title: 'One', status: 'running', nodeType: 'terminal', position: { x: 1, y: 2 }, size: { width: 300, height: 200 }, zIndex: 3, isMinimized: false, isMaximized: false, showInfo: false }],
      terminals: [],
      viewport: { zoom: 1, x: 0, y: 0 }
    })
    expect(result.errors).toEqual([])
  })
})

describe('isValidSshProfile', () => {
  it('accepts normal targets and rejects shell metacharacters', () => {
    expect(isValidSshProfile({ host: 'dev.example.com', user: 'umut', port: 22 })).toBe(true)
    expect(isValidSshProfile({ host: 'host & whoami', user: 'umut', port: 22 })).toBe(false)
    expect(isValidSshProfile({ host: 'host', user: 'umut', port: 70000 })).toBe(false)
  })
})

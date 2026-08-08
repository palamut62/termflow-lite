import { afterEach, describe, expect, it } from 'vitest'
import { resolveShell, __resetPathCacheForTests, refreshPathCache } from './shells'

describe('PATH resolution never blocks the main process', () => {
  it('returns immediately on a cold cache and keeps the inherited PATH', () => {
    __resetPathCacheForTests()
    const started = Date.now()
    const resolved = resolveShell({ workspaceId: 'w', name: 'CMD', kind: 'cmd' })
    // A synchronous `reg query` pair costs ~200ms; this path must be instant.
    expect(Date.now() - started).toBeLessThan(30)
    const pathKey = Object.keys(resolved.env).find((k) => k.toLowerCase() === 'path')
    expect(pathKey).toBeDefined()
    expect(resolved.env[pathKey!]).toBeTruthy()
  })

  it('populates the cache in the background and reuses it', async () => {
    __resetPathCacheForTests()
    await refreshPathCache()
    const started = Date.now()
    resolveShell({ workspaceId: 'w', name: 'CMD', kind: 'cmd' })
    expect(Date.now() - started).toBeLessThan(30)
  })
})

describe('resolveShell provider isolation', () => {
  const originalAnthropicBaseUrl = process.env.ANTHROPIC_BASE_URL

  afterEach(() => {
    if (originalAnthropicBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL
    else process.env.ANTHROPIC_BASE_URL = originalAnthropicBaseUrl
  })

  it('removes inherited provider routing from standalone agents', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://provider.example'

    const resolved = resolveShell({
      workspaceId: 'workspace',
      name: 'Claude Code',
      kind: 'claude',
      cleanProviderEnv: true,
      startupCommand: 'claude'
    })

    expect(resolved.env.ANTHROPIC_BASE_URL).toBeUndefined()
  })

  it('keeps explicit provider routing for provider-backed terminals', () => {
    const resolved = resolveShell({
      workspaceId: 'workspace',
      name: 'DeepSeek',
      kind: 'custom',
      cleanProviderEnv: false,
      env: { ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic' },
      startupCommand: 'claude'
    })

    expect(resolved.env.ANTHROPIC_BASE_URL).toBe('https://api.deepseek.com/anthropic')
  })
})

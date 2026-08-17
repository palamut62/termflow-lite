import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type CreateTerminalInput } from '../../shared/types'
import { applyProviderSecret } from './TerminalManager'

describe('applyProviderSecret', () => {
  it('injects the stored key only under the selected provider CLI variable', () => {
    const input: CreateTerminalInput = { kind: 'cmd', cols: 80, rows: 24, cwd: 'C:\\work', env: { ANTHROPIC_MODEL: 'deepseek-v4-flash' } }
    const result = applyProviderSecret(input, 'provider:deepseek', DEFAULT_SETTINGS, (id) =>
      id === 'deepseek' ? 'stored-deepseek-key' : undefined)

    expect(result.env).toEqual({
      ANTHROPIC_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_AUTH_TOKEN: 'stored-deepseek-key'
    })
    expect(result.secretEnvNames).toEqual(['ANTHROPIC_AUTH_TOKEN'])
    expect(input.env).not.toHaveProperty('ANTHROPIC_AUTH_TOKEN')
  })

  it('does not inject credentials into non-provider terminals', () => {
    const input: CreateTerminalInput = { kind: 'cmd', cols: 80, rows: 24, cwd: 'C:\\work' }
    expect(applyProviderSecret(input, 'cmd', DEFAULT_SETTINGS, () => 'secret')).toBe(input)
  })
})

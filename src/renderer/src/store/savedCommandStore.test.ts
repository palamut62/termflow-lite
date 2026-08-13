import { describe, expect, it } from 'vitest'
import { normalizeSavedCommand } from './savedCommandStore'

describe('normalizeSavedCommand', () => {
  it('trims the name and command', () => {
    expect(normalizeSavedCommand(' Claude update ', ' claude update ')).toEqual({
      name: 'Claude update',
      command: 'claude update'
    })
  })

  it('uses the command as the name when the name is empty', () => {
    expect(normalizeSavedCommand('', 'npm run dev')).toEqual({ name: 'npm run dev', command: 'npm run dev' })
  })

  it('rejects an empty command', () => {
    expect(normalizeSavedCommand('Empty', '   ')).toBeNull()
  })
})

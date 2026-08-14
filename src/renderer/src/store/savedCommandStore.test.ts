import { describe, expect, it } from 'vitest'
import { normalizeSavedCommand } from './savedCommandStore'

describe('normalizeSavedCommand', () => {
  it('trims the name and command', () => {
    expect(normalizeSavedCommand(' Claude update ', ' claude update ', ' cmd ')).toEqual({
      name: 'Claude update',
      command: 'claude update',
      profileId: 'cmd'
    })
  })

  it('uses the command as the name when the name is empty', () => {
    expect(normalizeSavedCommand('', 'npm run dev', 'powershell')).toEqual({ name: 'npm run dev', command: 'npm run dev', profileId: 'powershell' })
  })

  it('rejects an empty command', () => {
    expect(normalizeSavedCommand('Empty', '   ', 'cmd')).toBeNull()
  })

  it('requires a target profile', () => {
    expect(normalizeSavedCommand('Update', 'claude update', '')).toBeNull()
  })
})

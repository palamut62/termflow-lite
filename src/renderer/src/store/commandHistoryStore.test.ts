import { describe, expect, it } from 'vitest'
import { redactCommand } from './commandHistoryStore'

describe('redactCommand', () => {
  it('masks common inline secrets', () => {
    expect(redactCommand('curl api_key=my-key token="abc def" password=hello')).toBe('curl api_key=*** token=*** password=***')
  })

  it('keeps ordinary commands unchanged', () => {
    expect(redactCommand('npm run dev')).toBe('npm run dev')
  })
})

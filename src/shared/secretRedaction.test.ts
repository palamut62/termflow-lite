import { describe, expect, it } from 'vitest'
import { findApiKeys, redactApiKeys, TerminalSecretRedactor } from './secretRedaction'

describe('API key redaction', () => {
  it('recognizes common provider keys and labeled custom keys', () => {
    const openAi = `sk-proj-${'A1b2'.repeat(8)}`
    const custom = 'customKey1234567890abcdef'
    expect(findApiKeys(`OPENAI_API_KEY=${openAi} api-key: ${custom}`)).toEqual([openAi, custom])
  })

  it('recognizes a pasted bare opaque credential but ignores normal commands', () => {
    expect(findApiKeys('Abcd1234efgh5678ijkl9012')).toEqual(['Abcd1234efgh5678ijkl9012'])
    expect(findApiKeys('npm run build')).toEqual([])
  })

  it('masks the UI copy without changing unrelated text', () => {
    const key = `sk-or-v1-${'a1'.repeat(16)}`
    expect(redactApiKeys(`export API_KEY=${key}`)).toBe('export API_KEY=************')
  })

  it('redacts a registered input when the PTY echoes it later', () => {
    const key = `ghp_${'A1'.repeat(20)}`
    const redactor = new TerminalSecretRedactor()
    redactor.registerInput(key)
    expect(redactor.redact(`prompt> ${key}\r\n`)).toBe('prompt> ************\r\n')
  })
})

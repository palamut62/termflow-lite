import { describe, expect, it } from 'vitest'
import { findSuggestion } from './inlineSuggest'

describe('findSuggestion', () => {
  const history = ['git status', 'git commit -m "fix"', 'npm run build', 'echo a\nb']

  it('returns the most recent command that extends the prefix', () => {
    expect(findSuggestion('git c', history)).toBe('git commit -m "fix"')
    expect(findSuggestion('npm', history)).toBe('npm run build')
  })

  it('needs at least two characters and a longer match', () => {
    expect(findSuggestion('g', history)).toBeNull()
    expect(findSuggestion('git status', history)).toBeNull()
    expect(findSuggestion('cargo', history)).toBeNull()
  })

  it('never suggests multi-line commands', () => {
    expect(findSuggestion('echo', history)).toBeNull()
  })
})

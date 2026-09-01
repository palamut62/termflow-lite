import { describe, expect, it } from 'vitest'
import { extractPathCandidates } from './pathLinks'

describe('extractPathCandidates', () => {
  it('extracts a nested relative path with correct 1-based columns', () => {
    const text = '✓ win-unpacked/resources/server/index.js mevcut'
    expect(extractPathCandidates(text)).toEqual([
      { value: 'win-unpacked/resources/server/index.js', start: 3, end: 40 }
    ])
  })

  it('extracts a bare file name with an extension', () => {
    expect(extractPathCandidates('✓ app-update.yml mevcut')).toEqual([
      { value: 'app-update.yml', start: 3, end: 16 }
    ])
  })

  it('skips URLs — they belong to the WebLinksAddon', () => {
    expect(extractPathCandidates('pull https://github.com/palamut62/mauscrew-releases')).toEqual([])
  })

  it('skips plain numbers and sizes like "109,7" and "MB"', () => {
    expect(extractPathCandidates('109,7 MB (sessiz kurulum)')).toEqual([])
  })

  it('skips @-containing tokens (emails / scp-style)', () => {
    const result = extractPathCandidates('git clone git@github.com:palamut62/repo.git')
    expect(result.some((c) => c.value.includes('@') || c.value.includes('github'))).toBe(false)
  })

  it('skips leading flag-like tokens', () => {
    expect(extractPathCandidates('--flag ./src/main/index.ts')).toEqual([
      { value: './src/main/index.ts', start: 8, end: 26 }
    ])
  })

  it('strips trailing delimiters like ) and ,', () => {
    expect(extractPathCandidates('(src/main/index.ts)')).toEqual([
      { value: 'src/main/index.ts', start: 2, end: 18 }
    ])
  })

  it('keeps Windows drive paths in a single candidate', () => {
    const text = 'C:\\Users\\umuti\\foo bar.txt dosyası'
    const result = extractPathCandidates(text)
    expect(result).toContainEqual({ value: 'C:\\Users\\umuti\\foo bar.txt', start: 1, end: 26 })
  })

  it('keeps a quoted relative path with spaces in one candidate', () => {
    const text = "open 'folder/my file.txt' now"
    expect(extractPathCandidates(text)).toContainEqual({ value: 'folder/my file.txt', start: 7, end: 24 })
  })

  it('treats dotfiles and parent traversal as path-like', () => {
    expect(extractPathCandidates('.gitignore')).toEqual([{ value: '.gitignore', start: 1, end: 10 }])
    expect(extractPathCandidates('..')).toEqual([{ value: '..', start: 1, end: 2 }])
  })
})

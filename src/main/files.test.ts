import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { isHiddenName, listDirectory, sortEntries } from './files'

const root = mkdtempSync(join(tmpdir(), 'tf-files-'))
mkdirSync(join(root, 'src'))
mkdirSync(join(root, 'node_modules'))
mkdirSync(join(root, '.git'))
for (const name of ['file10.txt', 'file2.txt', 'README.md', '.env']) writeFileSync(join(root, name), 'x')
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('listDirectory', () => {
  it('lists folders first in natural order and hides dotfiles and heavy folders', async () => {
    const listing = await listDirectory(root, false)
    expect(listing?.entries.map((e) => e.name)).toEqual(['src', 'file2.txt', 'file10.txt', 'README.md'])
    expect(listing?.hidden).toBe(3)
    expect(listing?.truncated).toBe(false)
  })

  it('shows everything when asked', async () => {
    const listing = await listDirectory(root, true)
    expect(listing?.entries.map((e) => e.name)).toEqual(['.git', 'node_modules', 'src', '.env', 'file2.txt', 'file10.txt', 'README.md'])
  })

  it('refuses relative or missing folders', async () => {
    expect(await listDirectory('relative/path', false)).toBeNull()
    expect(await listDirectory(join(root, 'missing'), false)).toBeNull()
  })
})

describe('helpers', () => {
  it('knows hidden names and sorts', () => {
    expect(isHiddenName('.github')).toBe(true)
    expect(isHiddenName('node_modules')).toBe(true)
    expect(isHiddenName('src')).toBe(false)
    expect(sortEntries([{ name: 'b', path: 'b', isDirectory: false }, { name: 'a', path: 'a', isDirectory: true }]).map((e) => e.name)).toEqual(['a', 'b'])
  })
})

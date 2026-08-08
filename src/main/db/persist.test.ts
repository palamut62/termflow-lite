import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const harness = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: { getPath: (key: string) => (key === 'home' ? harness.userData : harness.userData) }
}))

import {
  initDatabase,
  createSnippet,
  listSnippets,
  flushPersist,
  __drainPersistForTests,
  __resumePersistForTests
} from './database'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('async persistence', () => {
  beforeEach(() => {
    harness.userData = mkdtempSync(join(tmpdir(), 'tf-db-'))
    initDatabase()
    __resumePersistForTests()
  })

  it('writes the store asynchronously, atomically and without pretty-print padding', async () => {
    createSnippet({ name: 'a', content: 'echo a', scope: 'global' } as never)
    await wait(700)
    await __drainPersistForTests()

    const file = join(harness.userData, 'termflow.json')
    const raw = readFileSync(file, 'utf-8')
    expect(raw).not.toContain('\n  ') // compact JSON: no 2-space indentation
    expect(JSON.parse(raw).snippets).toHaveLength(1)
    // The temp file is renamed away, never left behind.
    expect(existsSync(file + '.tmp')).toBe(false)
  })

  it('serializes concurrent writes so no two persists interleave', async () => {
    for (let i = 0; i < 25; i++) createSnippet({ name: `s${i}`, content: 'x', scope: 'global' } as never)
    await wait(700)
    await __drainPersistForTests()
    // A burst of mutations coalesces into a debounced write, and every queued
    // write completes in order — the file must still be valid JSON with the
    // final state, never a half-written mix of two snapshots.
    const parsed = JSON.parse(readFileSync(join(harness.userData, 'termflow.json'), 'utf-8'))
    expect(parsed.snippets).toHaveLength(listSnippets().length)
  })

  it('flushPersist writes synchronously on shutdown and wins over queued writes', async () => {
    createSnippet({ name: 'last', content: 'echo last', scope: 'global' } as never)
    flushPersist() // shutdown path: must be on disk the moment it returns
    const parsed = JSON.parse(readFileSync(join(harness.userData, 'termflow.json'), 'utf-8'))
    expect(parsed.snippets.map((s: { name: string }) => s.name)).toContain('last')
    // Any write still queued must abandon itself instead of racing the flush.
    await __drainPersistForTests()
    const after = JSON.parse(readFileSync(join(harness.userData, 'termflow.json'), 'utf-8'))
    expect(after.snippets.map((s: { name: string }) => s.name)).toContain('last')
  })
})

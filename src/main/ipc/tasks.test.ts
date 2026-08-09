import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readProjectTasks } from './tasks'

describe('readProjectTasks', () => {
  it('rejects relative paths', () => {
    expect(readProjectTasks('relative/project')).toEqual([])
  })

  it('discovers package.json scripts', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'termflow-tasks-'))
    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } }))
      expect(readProjectTasks(cwd)).toEqual([
        { id: 'npm:dev', label: 'npm: dev', command: 'npm run dev', source: 'package.json' },
        { id: 'npm:test', label: 'npm: test', command: 'npm run test', source: 'package.json' }
      ])
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

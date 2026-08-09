import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { detectProject } from './project'

describe('detectProject', () => {
  it('detects manifests and suggests matching tasks', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'termflow-project-'))
    try {
      writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
      writeFileSync(join(cwd, 'pyproject.toml'), '[project]\nname="demo"')
      writeFileSync(join(cwd, 'compose.yml'), 'services: {}')
      mkdirSync(join(cwd, '.git'))
      const result = detectProject(cwd)
      expect(result?.technologies).toEqual(['Node.js', 'Python', 'Docker', 'Git'])
      expect(result?.tasks.map((item) => item.command)).toContain('npm run dev')
      expect(result?.tasks.map((item) => item.command)).toContain('python -m pytest')
      expect(result?.tasks.map((item) => item.command)).toContain('docker compose up')
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })
})

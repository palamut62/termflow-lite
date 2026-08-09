import { describe, expect, it } from 'vitest'
import { parseGitStatus } from './git'

describe('parseGitStatus', () => {
  it('reads branch and changed file count', () => {
    expect(parseGitStatus('## feature/status...origin/feature/status\n M src/a.ts\n?? src/b.ts\n')).toEqual({
      branch: 'feature/status',
      changedFiles: 2
    })
  })

  it('handles a clean detached head', () => {
    expect(parseGitStatus('## HEAD (no branch)\n')).toEqual({ branch: 'HEAD', changedFiles: 0 })
  })

  it('reads an unborn branch', () => {
    expect(parseGitStatus('## No commits yet on main\n?? first.txt\n')).toEqual({ branch: 'main', changedFiles: 1 })
  })
})

import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { jsonlMetadata } from './agentSessions'

const dirs: string[] = []
afterEach(async () => Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))))

async function fixture(name: string, lines: unknown[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'termflow-sessions-'))
  dirs.push(dir)
  const file = join(dir, name)
  await writeFile(file, lines.map((line) => JSON.stringify(line)).join('\n'), 'utf8')
  return file
}

describe('agent session metadata', () => {
  it('reads Claude id, cwd and first user prompt', async () => {
    const file = await fixture('claude-id.jsonl', [
      { type: 'mode', sessionId: 'claude-id' },
      { type: 'user', sessionId: 'claude-id', cwd: 'C:\\work', message: { role: 'user', content: 'Fix the build' } }
    ])
    await expect(jsonlMetadata(file, 'claude')).resolves.toEqual({ id: 'claude-id', cwd: 'C:\\work', title: 'Fix the build' })
  })

  it('reads Codex session metadata and user message', async () => {
    const file = await fixture('rollout.jsonl', [
      { type: 'session_meta', payload: { id: 'codex-id', cwd: 'C:\\repo' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Add tests' }] } }
    ])
    await expect(jsonlMetadata(file, 'codex')).resolves.toEqual({ id: 'codex-id', cwd: 'C:\\repo', title: 'Add tests' })
  })
})

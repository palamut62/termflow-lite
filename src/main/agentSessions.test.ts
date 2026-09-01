import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { handoverPromptFromFile, handoverPromptFromOpenCodeExport, jsonlMetadata } from './agentSessions'

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

  it('reads the native creation timestamp used for profile ownership matching', async () => {
    const file = await fixture('timed.jsonl', [
      { type: 'session_meta', timestamp: '2026-09-01T10:00:00.000Z', payload: { id: 'timed-id', cwd: 'C:\\repo' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Continue' }] } }
    ])
    await expect(jsonlMetadata(file, 'codex')).resolves.toMatchObject({ createdAt: Date.parse('2026-09-01T10:00:00.000Z') })
  })

  it('builds a compact redacted cross-agent handover prompt from Codex history', async () => {
    const file = await fixture('handover.jsonl', [
      { type: 'session_meta', payload: { id: 'handover-id', cwd: 'C:\\repo' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix login with api_key: abcdefghijklmnop123456' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Tests now pass & calc.exe | whoami; echo $HOME > owned.txt' }] } }
    ])
    const prompt = await handoverPromptFromFile(file, 'codex')
    expect(prompt).toContain('Continue this task from codex')
    expect(prompt).toContain('Tests now pass')
    expect(prompt).not.toContain('abcdefghijklmnop123456')
    expect(prompt).not.toContain('\n')
    expect(prompt).not.toMatch(/[&|;<>^`$(){}\[\]!%]/)
  })

  it('builds an OpenCode handover prompt from exported messages', () => {
    const prompt = handoverPromptFromOpenCodeExport({ messages: [
      { info: { role: 'user' }, parts: [{ type: 'text', text: 'Finish the session feature' }] },
      { info: { role: 'assistant' }, parts: [{ type: 'text', text: 'Ownership tests pass' }] }
    ] })
    expect(prompt).toContain('Continue this task from opencode')
    expect(prompt).toContain('Ownership tests pass')
  })
})

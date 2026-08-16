import { describe, expect, it } from 'vitest'
import { agentKindForCommand, applyAgentPermission, parseAgentOutput } from './agentEvents'

describe('agent permission adapters', () => {
  it('detects supported CLI agents without matching unrelated words', () => {
    expect(agentKindForCommand('codex --model gpt')).toBe('codex')
    expect(agentKindForCommand('C:\\tools\\claude.cmd --resume abc')).toBe('claude')
    expect(agentKindForCommand('echo codex')).toBeNull()
  })

  it('replaces legacy bypass flags with the pinned policy', () => {
    expect(applyAgentPermission('codex --dangerously-bypass-approvals-and-sandbox', 'workspace'))
      .toBe('codex --sandbox workspace-write --ask-for-approval on-request')
    expect(applyAgentPermission('claude --dangerously-skip-permissions', 'safe'))
      .toBe('claude --permission-mode plan')
    expect(applyAgentPermission('opencode --auto', 'workspace')).toContain('modes are unavailable')
  })
})

describe('agent output adapters', () => {
  it('maps approval, test, edit and completion signals without retaining secrets', () => {
    const events = parseAgentOutput('codex', [
      'Approval required for command',
      'Running npm test',
      'Editing src/main.ts',
      'Done sk-super-secret-value'
    ].join('\n'))
    expect(events.map((event) => event.kind)).toEqual(['approval', 'tool', 'tool', 'completed'])
    expect(JSON.stringify(events)).not.toContain('sk-super-secret-value')
    expect(JSON.stringify(events)).toContain('************')
  })
})

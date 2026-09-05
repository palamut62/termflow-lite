import { describe, expect, it } from 'vitest'
import { TerminalSecretRedactor } from '../../shared/secretRedaction'
import { splitCommandLine, formatArguments } from '../../shared/commandLine'
import { applyAgentPermission, parseAgentOutput } from '../../shared/agentEvents'
import { profileToInput } from './profileResolver'
import { DEFAULT_SETTINGS } from '../../shared/types'

describe('review security regressions', () => {
  it('enforces safe mode on direct executable profiles, including equals-form flags', () => {
    const settings = { ...DEFAULT_SETTINGS, profiles: [{ id: 'direct', name: 'Direct', command: 'codex', fullPermissions: true, args: ['--sandbox=danger-full-access'] }] }
    const input = profileToInput('direct', settings, [], { cols: 80, rows: 24, permissionMode: 'safe' })
    expect(input.args).toEqual(['--sandbox', 'read-only', '--ask-for-approval', 'never'])
    expect(applyAgentPermission('codex --sandbox=danger-full-access --full-auto', 'safe')).not.toContain('danger-full-access')
    expect(splitCommandLine(applyAgentPermission('codex --yolo -s danger-full-access -a never -- "review --yolo"', 'safe'))).toEqual(['codex', '--sandbox', 'read-only', '--ask-for-approval', 'never', '--', 'review --yolo'])
  })
  it('redacts a registered key at every possible chunk boundary', () => {
    const key = 'synthetic-review-credential-12345'
    for (let boundary = 1; boundary < key.length; boundary++) {
      const redactor = new TerminalSecretRedactor(); redactor.register(key)
      const text = redactor.redact('before ' + key.slice(0, boundary)) + redactor.redact(key.slice(boundary) + ' after') + redactor.finish()
      expect(text).toBe('before ************ after')
    }
  })
  it('does not leak a partial credential on process exit', () => {
    const r = new TerminalSecretRedactor(); r.register('synthetic-review-credential-12345')
    expect(r.redact('synthetic-review-')).toBe('')
    expect(r.finish()).toBe('************')
  })
  it('preserves quoted Windows argument paths across editing', () => {
    const args = ['--file', 'C:\\Project Files\\file.txt', 'C:\\Project Files\\', 'two words', 'a\\"b', '']
    expect(splitCommandLine(formatArguments(args))).toEqual(args)
    expect(() => splitCommandLine('"unfinished')).toThrow()
  })
  it('does not classify passed required checks as an approval request', () => {
    expect(parseAgentOutput('codex', 'All required checks passed').some(e => e.kind === 'approval')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { activityLine, agentPulse, currentActivity, forgetActivity, noteAgentOutput, parseActivity, readPulse, type AgentPulse } from './agentActivity'

describe('parseActivity — Claude Code tool lines', () => {
  it('reads, edits, writes', () => {
    expect(parseActivity('⏺ Read(src/renderer/src/App.tsx)')).toMatchObject({ kind: 'read', target: 'App.tsx' })
    expect(parseActivity('● Update(src/main/widget.ts)')).toMatchObject({ kind: 'edit', target: 'widget.ts' })
    expect(parseActivity('⏺ Edit(C:\\work\\app\\index.ts)')).toMatchObject({ kind: 'edit', target: 'index.ts' })
    expect(parseActivity('⏺ Write(docs/notes.md)')).toMatchObject({ kind: 'write', target: 'notes.md' })
  })

  it('tells tests apart from other commands', () => {
    expect(parseActivity('⏺ Bash(npm test)')).toMatchObject({ kind: 'test', target: 'npm test' })
    expect(parseActivity('⏺ Bash(npx vitest run src)')).toMatchObject({ kind: 'test' })
    expect(parseActivity('⏺ Bash(git status --short)')).toMatchObject({ kind: 'run', target: 'git status --short' })
  })

  it('searches, browses, plans and delegates', () => {
    expect(parseActivity('⏺ Grep(pattern: "useWidgetStore", path: "src")')).toMatchObject({ kind: 'search', target: 'useWidgetStore' })
    expect(parseActivity('⏺ Glob(**/*.tsx)')).toMatchObject({ kind: 'search' })
    expect(parseActivity('⏺ WebFetch(https://www.electronjs.org/docs/latest)')).toMatchObject({ kind: 'web', target: 'electronjs.org' })
    expect(parseActivity('⏺ Update Todos')).toMatchObject({ kind: 'plan' })
    expect(parseActivity('⏺ Task(Explore the repo)')).toMatchObject({ kind: 'delegate' })
  })

  it('works through ANSI colors and keeps the last action of a chunk', () => {
    const chunk = '\x1b[32m⏺\x1b[39m \x1b[1mRead\x1b[22m(a.ts)\r\n  ⎿  Read 40 lines\r\n⏺ Bash(npm test)\r\n'
    expect(parseActivity(chunk)).toMatchObject({ kind: 'test', target: 'npm test' })
  })

  it('ignores prose and unknown bullets', () => {
    expect(parseActivity('⏺ I will now look at the widget code.')).toBeNull()
    expect(parseActivity('Just some build output\nDone in 2.3s')).toBeNull()
  })
})

describe('parseActivity — Codex lines', () => {
  it('reads its action bullets and sub-steps', () => {
    expect(parseActivity('• Ran npm test')).toMatchObject({ kind: 'test' })
    expect(parseActivity('• Ran git diff --stat')).toMatchObject({ kind: 'run', target: 'git diff --stat' })
    expect(parseActivity('• Edited src/app.ts (+3 -1)')).toMatchObject({ kind: 'edit', target: 'app.ts' })
    expect(parseActivity('• Updated Plan')).toMatchObject({ kind: 'plan' })
    expect(parseActivity('• Explored\n  └ Read TerminalView.tsx')).toMatchObject({ kind: 'read', target: 'TerminalView.tsx' })
    expect(parseActivity('  └ Search companion')).toMatchObject({ kind: 'search', target: 'companion' })
  })
})

describe('per-tab activity', () => {
  it('remembers the latest action and lets it go stale', () => {
    forgetActivity('t1')
    noteAgentOutput('t1', '⏺ Read(a.ts)', 1_000)
    noteAgentOutput('t1', 'some unrelated output', 2_000)
    expect(currentActivity('t1', 3_000)).toMatchObject({ kind: 'read', target: 'a.ts' })
    expect(currentActivity('t1', 60_000)).toBeNull()
  })
})

describe('activityLine', () => {
  it('mostly states the fact, sometimes a quip', () => {
    const activity = { kind: 'edit' as const, target: 'app.ts', at: 0 }
    expect(activityLine(activity, 0)).toBe('Editing app.ts')
    expect(activityLine(activity, 45)).toBe('Editing app.ts')
    expect(activityLine(activity, 90)).not.toBe('Editing app.ts')
    expect(activityLine(null, 0)).toBe('Thinking...')
  })

  it('announces a new action plainly first, quips only later', () => {
    const activity = { kind: 'run' as const, target: 'git status', at: 10_000 }
    expect(activityLine(activity, 90, 11_000)).toBe('Running git status')
    expect(activityLine(activity, 90, 20_000)).not.toBe('Running git status')
  })

  it('keeps lines short', () => {
    const long = parseActivity('⏺ Bash(npm run build && npm run package:verify -- --very-long-flag)')!
    expect(activityLine(long, 0).length).toBeLessThanOrEqual(36)
  })
})

// Chunks recorded from a real Claude Code 2.x session in TermFlow: spaces are
// cursor-forward moves (ESC[1C) and rows are cursor jumps (ESC[r;cH).
const E = '\x1b'
const READING_FILE = `${E}[38;2;225;139;107m${E}[32;3HActioning…${E}[10C4${E}[19;1H●${E}[m${E}[1CReading${E}[1CAppData\\Local\\Temp\\note.txt${E}[38;2;153;153;153m\r\n  ⎿  note.txt`
const READING_SUMMARY = `${E}[17;1H●${E}[m${E}[1CReading${E}[1Cis${E}[1Cread-only,${E}[1Callowed${E}[19;1H ${E}[m${E}[1CReading${E}[1m${E}[1C1${E}[22m${E}[1Cfile…`

describe('parseActivity — Claude Code 2.x redraws', () => {
  it('reads tool lines drawn with cursor moves', () => {
    expect(parseActivity(READING_FILE)).toMatchObject({ kind: 'read', target: 'note.txt' })
    expect(parseActivity(READING_SUMMARY)).toMatchObject({ kind: 'read', target: '' })
  })

  it('ignores the echoed prompt and prose', () => {
    expect(parseActivity('❯ Read the file C:\\work\\note.txt and tell me its first word.')).toBeNull()
    expect(parseActivity(`●${E}[1CReading${E}[1Cis${E}[1Cread-only`)).toBeNull()
  })
})

describe('readPulse', () => {
  it('sees the busy spinner, thinking and the end of a turn', () => {
    const pulse: AgentPulse = {}
    readPulse(pulse, `${E}[32;3H✻ Sautéing…`, 1)
    expect(pulse).toEqual({ busyAt: 1 })
    readPulse(pulse, `${E}[32;1H✶`, 2)
    expect(pulse.busyAt).toBe(2)
    readPulse(pulse, `✽ thinking`, 3)
    expect(pulse.thinkingAt).toBe(3)
    readPulse(pulse, `✻ Cooked for 8s · done 10:09 ❯`, 4)
    expect(pulse.endAt).toBe(4)
    readPulse(pulse, `• Working (3s • esc to interrupt)`, 5)
    expect(pulse.busyAt).toBe(5)
  })

  it('does not take idle redraws for work', () => {
    const pulse: AgentPulse = {}
    for (const chunk of ['ctx 8% | $0.00', '5s 5% (sifir: 13:50) | 7g 11% | $0.26', '❯ ', 'Opus 5.5 | $0.00']) readPulse(pulse, chunk, 1)
    expect(pulse).toEqual({})
  })

  it('is kept per tab', () => {
    noteAgentOutput('pulse-a', '✻ Sautéing…', 10)
    expect(agentPulse('pulse-a')?.busyAt).toBe(10)
    expect(agentPulse('pulse-b')).toBeUndefined()
    forgetActivity('pulse-a')
    expect(agentPulse('pulse-a')).toBeUndefined()
  })
})

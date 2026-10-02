import { describe, expect, it } from 'vitest'
import { activityLine, currentActivity, forgetActivity, noteAgentOutput, parseActivity } from './agentActivity'

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

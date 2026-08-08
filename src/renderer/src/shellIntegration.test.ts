import { describe, expect, it } from 'vitest'
import {
  DEFAULT_COMMAND_LIMIT,
  OSC_SEMANTIC_PROMPT,
  OSC_VSCODE,
  ShellIntegrationTracker,
  decodeVsCodeValue,
  parsePayload,
  readLastCommandOutput,
  registerCommandOutputReader,
  commandBlocksOf,
  getCommandBlocks,
  getCommandOutput,
  onCommandBlocksChanged,
  notifyCommandBlocksChanged,
  type CommandOutputReader
} from './shellIntegration'

/** Deterministic clock: every read advances by 10ms. */
function fakeClock(step = 10): () => number {
  let t = 1000
  return () => {
    const value = t
    t += step
    return value
  }
}

function tracker(step = 10, limit?: number): ShellIntegrationTracker {
  return new ShellIntegrationTracker({ now: fakeClock(step), limit })
}

describe('parsePayload', () => {
  it('splits letter and arguments', () => {
    expect(parsePayload('D;127')).toEqual({ letter: 'D', args: ['127'] })
    expect(parsePayload('A')).toEqual({ letter: 'A', args: [] })
  })

  it('uppercases the letter and trims it', () => {
    expect(parsePayload(' d ;0')?.letter).toBe('D')
  })

  it('rejects payloads without a single-letter command', () => {
    expect(parsePayload('')).toBeNull()
    expect(parsePayload(';;;')).toBeNull()
    expect(parsePayload('AB;1')).toBeNull()
    expect(parsePayload('12;1')).toBeNull()
    expect(parsePayload(undefined as unknown as string)).toBeNull()
  })
})

describe('decodeVsCodeValue', () => {
  it('returns plain text unchanged', () => {
    expect(decodeVsCodeValue('git status')).toBe('git status')
  })

  it('decodes hex escapes and backslashes', () => {
    expect(decodeVsCodeValue('a\\x3bb')).toBe('a;b')
    expect(decodeVsCodeValue('C:\\\\src')).toBe('C:\\src')
    expect(decodeVsCodeValue('a\\x0Ab')).toBe('a\nb')
  })

  it('decodes \\n and \\r shorthands', () => {
    expect(decodeVsCodeValue('a\\nb\\rc')).toBe('a\nb\rc')
  })

  it('keeps truncated or unknown escapes verbatim', () => {
    expect(decodeVsCodeValue('a\\x')).toBe('a\\x')
    expect(decodeVsCodeValue('a\\xZZ')).toBe('a\\xZZ')
    expect(decodeVsCodeValue('a\\q')).toBe('a\\q')
    expect(decodeVsCodeValue('trailing\\')).toBe('trailing\\')
  })
})

describe('ShellIntegrationTracker lifecycle', () => {
  it('records a full A/B/C/D cycle', () => {
    const t = tracker()
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'A', 5)?.type).toBe('promptStart')
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'B', 5)).toBeNull()
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'C', 6)?.type).toBe('commandStart')
    const done = t.handle(OSC_SEMANTIC_PROMPT, 'D;0', 12)
    expect(done?.type).toBe('commandFinish')
    const record = done!.record
    expect(record.promptLine).toBe(5)
    expect(record.inputLine).toBe(5)
    expect(record.startLine).toBe(6)
    expect(record.endLine).toBe(12)
    expect(record.exitCode).toBe(0)
    expect(record.running).toBe(false)
    expect(record.durationMs).toBe(10)
    expect(t.commands).toHaveLength(1)
    expect(t.current).toBeNull()
  })

  it('marks the command running between C and D', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 1)
    expect(t.current?.running).toBe(true)
    t.handle(OSC_SEMANTIC_PROMPT, 'D;1', 4)
    expect(t.current).toBeNull()
    expect(t.commands[0].running).toBe(false)
  })

  it('captures a non-zero exit code', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 1)
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'D;127', 2)!.record.exitCode).toBe(127)
  })

  it('leaves the exit code undefined when D carries none', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 1)
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'D', 2)!.record.exitCode).toBeUndefined()
  })

  it('ignores a non-numeric exit code', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 1)
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'D;oops', 2)!.record.exitCode).toBeUndefined()
  })

  it('drops an empty prompt (A then D with no C)', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'D;0', 1)).toBeNull()
    expect(t.commands).toHaveLength(0)
  })

  it('synthesises a record when C arrives without A', () => {
    const t = tracker()
    const started = t.handle(OSC_SEMANTIC_PROMPT, 'C', 3)
    expect(started?.type).toBe('commandStart')
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'D;0', 5)?.record.startLine).toBe(3)
  })

  it('ignores a stray D with nothing open', () => {
    const t = tracker()
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'D;0', 9)).toBeNull()
    expect(t.commands).toHaveLength(0)
  })

  it('closes an abandoned command when a new prompt starts', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 1)
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 8) // no D: shell reset
    expect(t.commands).toHaveLength(2)
    expect(t.commands[0].running).toBe(false)
    expect(t.commands[0].endLine).toBe(8)
    expect(t.commands[0].exitCode).toBeUndefined()
  })

  it('reports the last finished command', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 1)
    t.handle(OSC_SEMANTIC_PROMPT, 'D;0', 2)
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 3)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 4)
    expect(t.lastFinished()?.id).toBe(1)
    t.handle(OSC_SEMANTIC_PROMPT, 'D;2', 6)
    expect(t.lastFinished()?.exitCode).toBe(2)
  })

  it('returns null from lastFinished with no history', () => {
    expect(tracker().lastFinished()).toBeNull()
  })

  it('reset clears history and the open record', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', 1)
    t.reset()
    expect(t.commands).toHaveLength(0)
    expect(t.current).toBeNull()
  })
})

describe('ShellIntegrationTracker OSC 633 extras', () => {
  it('accepts the VS Code A/B/C/D superset', () => {
    const t = tracker()
    t.handle(OSC_VSCODE, 'A', 0)
    t.handle(OSC_VSCODE, 'C', 1)
    expect(t.handle(OSC_VSCODE, 'D;3', 4)?.record.exitCode).toBe(3)
  })

  it('stores the command line from E and decodes it', () => {
    const t = tracker()
    t.handle(OSC_VSCODE, 'A', 0)
    t.handle(OSC_VSCODE, 'E;echo a\\x3b b', 0)
    t.handle(OSC_VSCODE, 'C', 1)
    expect(t.handle(OSC_VSCODE, 'D;0', 2)?.record.commandText).toBe('echo a; b')
  })

  it('ignores E and P on plain OSC 133', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', 0)
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'E;ls', 0)).toBeNull()
    expect(t.current?.commandText).toBeUndefined()
  })

  it('stores the cwd from P;Cwd=', () => {
    const t = tracker()
    t.handle(OSC_VSCODE, 'A', 0)
    t.handle(OSC_VSCODE, 'P;Cwd=C:\\\\src', 0)
    expect(t.current?.cwd).toBe('C:\\src')
  })

  it('ignores malformed P payloads', () => {
    const t = tracker()
    t.handle(OSC_VSCODE, 'A', 0)
    expect(t.handle(OSC_VSCODE, 'P;=novalue', 0)).toBeNull()
    expect(t.handle(OSC_VSCODE, 'P', 0)).toBeNull()
    expect(t.current?.cwd).toBeUndefined()
  })

  it('ignores unrelated OSC codes and unknown letters', () => {
    const t = tracker()
    expect(t.handle(7, 'A', 0)).toBeNull()
    expect(t.handle(OSC_SEMANTIC_PROMPT, 'Z;1', 0)).toBeNull()
    expect(t.commands).toHaveLength(0)
  })

  it('survives garbage payloads without throwing', () => {
    const t = tracker()
    for (const junk of ['', ';', '\u0000', 'D;;;', 'A;;;;', '133;A']) {
      expect(() => t.handle(OSC_SEMANTIC_PROMPT, junk, 0)).not.toThrow()
    }
  })

  it('clamps invalid line numbers to zero', () => {
    const t = tracker()
    t.handle(OSC_SEMANTIC_PROMPT, 'A', Number.NaN)
    t.handle(OSC_SEMANTIC_PROMPT, 'C', -5)
    const rec = t.handle(OSC_SEMANTIC_PROMPT, 'D;0', -1)!.record
    expect(rec.promptLine).toBe(0)
    expect(rec.startLine).toBe(0)
    expect(rec.endLine).toBe(0)
  })
})

describe('ShellIntegrationTracker history bound', () => {
  it('keeps only the newest `limit` commands', () => {
    const t = tracker(1, 3)
    for (let i = 0; i < 10; i++) {
      t.handle(OSC_SEMANTIC_PROMPT, 'A', i)
      t.handle(OSC_SEMANTIC_PROMPT, 'C', i)
      t.handle(OSC_SEMANTIC_PROMPT, 'D;0', i)
    }
    expect(t.commands).toHaveLength(3)
    expect(t.commands[t.commands.length - 1].id).toBe(10)
  })

  it('falls back to the default limit for invalid values', () => {
    const t = new ShellIntegrationTracker({ limit: 0 })
    for (let i = 0; i < DEFAULT_COMMAND_LIMIT + 5; i++) {
      t.handle(OSC_SEMANTIC_PROMPT, 'A', i)
      t.handle(OSC_SEMANTIC_PROMPT, 'C', i)
      t.handle(OSC_SEMANTIC_PROMPT, 'D;0', i)
    }
    expect(t.commands).toHaveLength(DEFAULT_COMMAND_LIMIT)
  })
})

// Fill the parts of the reader a test does not care about.
function makeReader(partial: Partial<CommandOutputReader>): CommandOutputReader {
  return {
    lastOutput: () => null,
    blocks: () => [],
    outputFor: () => null,
    scrollToBlock: () => undefined,
    ...partial
  }
}

describe('command output reader registry', () => {
  it('registers, reads and unregisters', () => {
    const off = registerCommandOutputReader('t1', makeReader({ lastOutput: () => 'hello' }))
    expect(readLastCommandOutput('t1')).toBe('hello')
    off()
    expect(readLastCommandOutput('t1')).toBeNull()
  })

  it('returns null for unknown terminals and swallows reader errors', () => {
    expect(readLastCommandOutput('nope')).toBeNull()
    const off = registerCommandOutputReader('t2', makeReader({
      lastOutput: () => {
        throw new Error('boom')
      }
    }))
    expect(readLastCommandOutput('t2')).toBeNull()
    off()
  })
})

describe('command blocks view model', () => {
  function trackerWith(commands: Array<{ text?: string; exit?: number }>): ShellIntegrationTracker {
    const t = new ShellIntegrationTracker({ now: () => 1000 })
    commands.forEach((c, i) => {
      const line = i * 3
      t.handle(OSC_SEMANTIC_PROMPT, 'A', line)
      if (c.text !== undefined) t.handle(OSC_VSCODE, `E;${c.text}`, line)
      t.handle(OSC_SEMANTIC_PROMPT, 'C', line + 1)
      t.handle(OSC_SEMANTIC_PROMPT, `D;${c.exit ?? 0}`, line + 2)
    })
    return t
  }

  it('lists only commands whose text is known, newest first', () => {
    const t = trackerWith([{ text: 'git status', exit: 0 }, { text: 'ls', exit: 2 }])
    const blocks = commandBlocksOf(t.commands)
    expect(blocks.map((b) => b.command)).toEqual(['ls', 'git status'])
    expect(blocks[0].exitCode).toBe(2)
  })

  it('drops commands the shell never named', () => {
    const t = trackerWith([{ exit: 0 }, { text: 'echo hi', exit: 0 }])
    expect(commandBlocksOf(t.commands).map((b) => b.command)).toEqual(['echo hi'])
  })

  it('carries id, running flag and duration onto the block', () => {
    const t = trackerWith([{ text: 'sleep 1', exit: 0 }])
    const [block] = commandBlocksOf(t.commands)
    expect(block.id).toBeGreaterThan(0)
    expect(block.running).toBe(false)
    expect(block.durationMs).toBe(0)
  })

  it('registry accessors read the active reader', () => {
    const blocks = [{ id: 1, command: 'ls', startedAt: 0, running: false }]
    const off = registerCommandOutputReader('tb', makeReader({
      blocks: () => blocks,
      outputFor: (id) => (id === 1 ? 'out' : null),
      scrollToBlock: () => undefined
    }))
    expect(getCommandBlocks('tb')).toBe(blocks)
    expect(getCommandOutput('tb', 1)).toBe('out')
    expect(getCommandOutput('tb', 9)).toBeNull()
    off()
    expect(getCommandBlocks('tb')).toEqual([])
  })

  it('accessors swallow reader errors', () => {
    const off = registerCommandOutputReader('te', makeReader({
      blocks: () => { throw new Error('x') },
      outputFor: () => { throw new Error('x') }
    }))
    expect(getCommandBlocks('te')).toEqual([])
    expect(getCommandOutput('te', 1)).toBeNull()
    off()
  })

  it('notifies only the subscribed terminal and stops after unsubscribe', () => {
    let a = 0
    let b = 0
    const offA = onCommandBlocksChanged('ta', () => { a += 1 })
    onCommandBlocksChanged('tbb', () => { b += 1 })
    notifyCommandBlocksChanged('ta')
    expect(a).toBe(1)
    expect(b).toBe(0)
    offA()
    notifyCommandBlocksChanged('ta')
    expect(a).toBe(1)
  })
})

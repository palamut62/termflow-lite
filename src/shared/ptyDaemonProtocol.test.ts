import { describe, expect, it } from 'vitest'
import {
  DAEMON_PROTOCOL_VERSION,
  FrameSplitter,
  daemonPipePath,
  encodeFrame,
  parseClientFrame,
  parseServerFrame,
  timingSafeEqualString,
  validateCreateInput,
  type ClientFrame,
  type ServerFrame
} from './ptyDaemonProtocol'

const TOKEN = 'a'.repeat(64)

const clientFrame = (msg: ClientFrame['msg'], rid = 1, token = TOKEN): string =>
  encodeFrame({ v: DAEMON_PROTOCOL_VERSION, token, rid, msg }).trim()

describe('FrameSplitter', () => {
  it('splits newline-delimited frames across chunk boundaries', () => {
    const splitter = new FrameSplitter()
    expect(splitter.push('{"a":1}\n{"b":').lines).toEqual(['{"a":1}'])
    expect(splitter.push('2}\n').lines).toEqual(['{"b":2}'])
  })

  it('ignores blank lines', () => {
    const splitter = new FrameSplitter()
    expect(splitter.push('\n\n{"a":1}\n').lines).toEqual(['{"a":1}'])
  })

  it('reports overflow and stays poisoned', () => {
    const splitter = new FrameSplitter(8)
    const result = splitter.push('x'.repeat(20) + '\n')
    expect(result.overflow).toBe(true)
    expect(splitter.push('{"a":1}\n')).toEqual({ lines: [], overflow: true })
  })

  it('reports overflow for an unterminated oversized frame', () => {
    const splitter = new FrameSplitter(8)
    expect(splitter.push('y'.repeat(50)).overflow).toBe(true)
  })
})

describe('encodeFrame', () => {
  it('round-trips through the splitter', () => {
    const frame: ServerFrame = {
      v: DAEMON_PROTOCOL_VERSION,
      type: 'event',
      event: { kind: 'data', ptyId: 'A', data: 'hello\nworld' }
    }
    const splitter = new FrameSplitter()
    const { lines } = splitter.push(encodeFrame(frame))
    expect(lines).toHaveLength(1)
    const parsed = parseServerFrame(lines[0])
    expect(parsed).toEqual({ ok: true, value: frame })
  })
})

describe('timingSafeEqualString', () => {
  it('compares equal and unequal strings', () => {
    expect(timingSafeEqualString('abc', 'abc')).toBe(true)
    expect(timingSafeEqualString('abc', 'abd')).toBe(false)
    expect(timingSafeEqualString('abc', 'abcd')).toBe(false)
  })
})

describe('parseClientFrame authentication', () => {
  it('accepts a well-formed authenticated frame', () => {
    const parsed = parseClientFrame(clientFrame({ type: 'hello' }), TOKEN)
    expect(parsed.ok).toBe(true)
  })

  it('rejects a wrong token', () => {
    const parsed = parseClientFrame(clientFrame({ type: 'hello' }, 1, 'b'.repeat(64)), TOKEN)
    expect(parsed).toEqual({ ok: false, reason: 'auth' })
  })

  it('rejects a missing token', () => {
    const line = JSON.stringify({ v: DAEMON_PROTOCOL_VERSION, rid: 1, msg: { type: 'hello' } })
    expect(parseClientFrame(line, TOKEN)).toEqual({ ok: false, reason: 'auth' })
  })

  it('rejects a mismatched protocol version', () => {
    const line = JSON.stringify({ v: DAEMON_PROTOCOL_VERSION + 1, token: TOKEN, rid: 1, msg: { type: 'hello' } })
    expect(parseClientFrame(line, TOKEN)).toEqual({ ok: false, reason: 'version' })
  })

  it('rejects malformed JSON', () => {
    expect(parseClientFrame('{not json', TOKEN)).toEqual({ ok: false, reason: 'json' })
  })

  it('rejects unknown message types', () => {
    expect(parseClientFrame(clientFrame({ type: 'rm -rf' } as never), TOKEN)).toEqual({
      ok: false,
      reason: 'unknown-type'
    })
  })
})

describe('parseClientFrame request validation', () => {
  it('requires a ptyId for terminal-scoped messages', () => {
    expect(parseClientFrame(clientFrame({ type: 'write', data: 'x' } as never), TOKEN).ok).toBe(false)
  })

  it('rejects a non-string write payload', () => {
    expect(parseClientFrame(clientFrame({ type: 'write', ptyId: 'A', data: 42 } as never), TOKEN).ok).toBe(false)
  })

  it('truncates resize dimensions to integers', () => {
    const parsed = parseClientFrame(clientFrame({ type: 'resize', ptyId: 'A', cols: 80.7, rows: 24.9 }), TOKEN)
    expect(parsed.ok && parsed.value.msg).toEqual({ type: 'resize', ptyId: 'A', cols: 80, rows: 24 })
  })

  it('rejects an invalid render mode', () => {
    expect(parseClientFrame(clientFrame({ type: 'setMode', ptyId: 'A', mode: 'turbo' } as never), TOKEN).ok).toBe(false)
  })

  it('drops unknown config keys', () => {
    const parsed = parseClientFrame(clientFrame({ type: 'config', scrollback: 500, evil: 1 } as never), TOKEN)
    expect(parsed.ok && parsed.value.msg).toEqual({ type: 'config', scrollback: 500 })
  })
})

describe('validateCreateInput', () => {
  it('accepts a minimal input and strips unknown fields', () => {
    expect(validateCreateInput({ workspaceId: 'w', name: 'T', kind: 'cmd', hax: true })).toEqual({
      workspaceId: 'w',
      name: 'T',
      kind: 'cmd'
    })
  })

  it('keeps known optional fields', () => {
    expect(
      validateCreateInput({
        workspaceId: 'w',
        name: 'T',
        kind: 'claude',
        cwd: 'C:\\x',
        args: ['-a'],
        env: { A: '1' },
        cols: 80,
        rows: 24,
        startupCommand: 'claude',
        cleanProviderEnv: true
      })
    ).toEqual({
      workspaceId: 'w',
      name: 'T',
      kind: 'claude',
      cwd: 'C:\\x',
      args: ['-a'],
      env: { A: '1' },
      cols: 80,
      rows: 24,
      startupCommand: 'claude',
      cleanProviderEnv: true
    })
  })

  it('rejects an unknown shell kind', () => {
    expect(validateCreateInput({ workspaceId: 'w', name: 'T', kind: 'evil' })).toBeNull()
  })

  it('rejects a non-string env map', () => {
    expect(validateCreateInput({ workspaceId: 'w', name: 'T', kind: 'cmd', env: { A: 1 } })).toBeNull()
  })

  it('rejects non-objects', () => {
    expect(validateCreateInput(null)).toBeNull()
    expect(validateCreateInput(['cmd'])).toBeNull()
  })
})

describe('parseServerFrame', () => {
  it('parses ok and error replies', () => {
    const ok = parseServerFrame(JSON.stringify({ v: DAEMON_PROTOCOL_VERSION, type: 'reply', rid: 3, ok: true, result: { pid: 7 } }))
    expect(ok.ok && ok.value).toEqual({ v: DAEMON_PROTOCOL_VERSION, type: 'reply', rid: 3, ok: true, result: { pid: 7 } })

    const err = parseServerFrame(JSON.stringify({ v: DAEMON_PROTOCOL_VERSION, type: 'reply', rid: 4, ok: false }))
    expect(err.ok && err.value).toEqual({ v: DAEMON_PROTOCOL_VERSION, type: 'reply', rid: 4, ok: false, error: 'daemon error' })
  })

  it('rejects an event with a bad shape', () => {
    const line = JSON.stringify({ v: DAEMON_PROTOCOL_VERSION, type: 'event', event: { kind: 'data', ptyId: 'A' } })
    expect(parseServerFrame(line)).toEqual({ ok: false, reason: 'shape' })
  })

  it('rejects an unknown event kind', () => {
    const line = JSON.stringify({ v: DAEMON_PROTOCOL_VERSION, type: 'event', event: { kind: 'exec', ptyId: 'A' } })
    expect(parseServerFrame(line)).toEqual({ ok: false, reason: 'shape' })
  })

  it('rejects a version mismatch', () => {
    const line = JSON.stringify({ v: 999, type: 'reply', rid: 1, ok: true, result: null })
    expect(parseServerFrame(line)).toEqual({ ok: false, reason: 'version' })
  })
})

describe('daemonPipePath', () => {
  it('builds a local-only named pipe path', () => {
    expect(daemonPipePath('deadbeef')).toBe('\\\\.\\pipe\\termflow-daemon-deadbeef')
  })
})

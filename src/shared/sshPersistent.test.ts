import { describe, expect, it } from 'vitest'
import type { SshConnection } from './types'
import { DEFAULT_REMOTE_SESSION_NAME, buildSshArgs, remoteSessionName, validateSshConnection } from './sshArgs'

/**
 * Persistent remote sessions: the connection attaches to a tmux/screen session
 * on the remote host, so agents keep running when the link drops.
 */

function conn(overrides: Partial<SshConnection> = {}): SshConnection {
  return { id: 'c1', name: 'Server', host: 'example.com', ...overrides }
}

/** The remote command is always the last argument. */
function remoteOf(args: string[]): string {
  return args[args.length - 1]
}

describe('remoteSessionName', () => {
  it('falls back to the default for empty or unsafe names', () => {
    expect(remoteSessionName(conn())).toBe(DEFAULT_REMOTE_SESSION_NAME)
    expect(remoteSessionName(conn({ sessionName: '   ' }))).toBe(DEFAULT_REMOTE_SESSION_NAME)
    expect(remoteSessionName(conn({ sessionName: 'a.b:c' }))).toBe(DEFAULT_REMOTE_SESSION_NAME)
    expect(remoteSessionName(conn({ sessionName: 'rm -rf /' }))).toBe(DEFAULT_REMOTE_SESSION_NAME)
  })

  it('keeps a valid name', () => {
    expect(remoteSessionName(conn({ sessionName: 'agent_1-x' }))).toBe('agent_1-x')
  })
})

describe('validateSshConnection', () => {
  it('rejects a session name tmux would misread as a target', () => {
    expect(validateSshConnection(conn({ sessionName: 'a.b' })))
      .toBe('Session name may only contain letters, digits, dashes and underscores.')
    expect(validateSshConnection(conn({ sessionName: 'a:b' }))).toBeTruthy()
    expect(validateSshConnection(conn({ sessionName: 'a b' }))).toBeTruthy()
  })

  it('accepts a valid or absent session name', () => {
    expect(validateSshConnection(conn({ sessionName: 'agent_1-x' }))).toBeNull()
    expect(validateSshConnection(conn())).toBeNull()
  })
})

describe('buildSshArgs with a persistent session', () => {
  it('attaches to (or creates) a tmux session by default', () => {
    const args = buildSshArgs(conn({ persistentSession: true }))
    expect(remoteOf(args)).toBe('tmux new-session -A -s termflow')
    // A remote TTY is mandatory: tmux refuses to start without one.
    expect(args).toContain('-t')
    expect(args[args.length - 2]).toBe('example.com')
  })

  it('uses the configured session name', () => {
    expect(remoteOf(buildSshArgs(conn({ persistentSession: true, sessionName: 'build' }))))
      .toBe('tmux new-session -A -s build')
  })

  it('passes the remote directory to tmux rather than a cd', () => {
    expect(remoteOf(buildSshArgs(conn({ persistentSession: true, remoteCwd: '/srv/app' }))))
      .toBe("tmux new-session -A -s termflow -c '/srv/app'")
  })

  it('quotes a directory containing spaces and apostrophes', () => {
    expect(remoteOf(buildSshArgs(conn({ persistentSession: true, remoteCwd: "/srv/o'brien app" }))))
      .toBe("tmux new-session -A -s termflow -c '/srv/o'\\''brien app'")
  })

  it('runs the configured command inside the session', () => {
    expect(remoteOf(buildSshArgs(conn({ persistentSession: true, remoteCwd: '/srv/app', remoteCommand: 'claude' }))))
      .toBe("tmux new-session -A -s termflow -c '/srv/app' claude")
  })

  it('supports screen, which needs the cd around it', () => {
    expect(remoteOf(buildSshArgs(conn({ persistentSession: true, multiplexer: 'screen' }))))
      .toBe('screen -D -R termflow')
    expect(remoteOf(buildSshArgs(conn({ persistentSession: true, multiplexer: 'screen', remoteCwd: '/srv/app' }))))
      .toBe("cd '/srv/app' && screen -D -R termflow")
    expect(remoteOf(buildSshArgs(conn({ persistentSession: true, multiplexer: 'screen', remoteCommand: 'htop' }))))
      .toBe('screen -D -R termflow htop')
  })

  it('keeps the ordinary flags in front of the destination', () => {
    const args = buildSshArgs(conn({ persistentSession: true, port: 2200, forwardAgent: true, user: 'u' }))
    expect(args).toEqual(['-p', '2200', '-A', '-t', 'u@example.com', 'tmux new-session -A -s termflow'])
  })

  it('changes nothing when persistence is off', () => {
    expect(buildSshArgs(conn())).toEqual(['example.com'])
    expect(buildSshArgs(conn({ persistentSession: false, sessionName: 'x' }))).toEqual(['example.com'])
  })

  it('still refuses an unsafe host before building anything', () => {
    expect(() => buildSshArgs(conn({ host: 'a;rm -rf /', persistentSession: true }))).toThrow()
  })
})

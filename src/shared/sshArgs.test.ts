import { describe, expect, it } from 'vitest'
import type { SshConnection } from './types'
import { buildSshArgs, sshTarget, validateSshConnection } from './sshArgs'

function conn(overrides: Partial<SshConnection> = {}): SshConnection {
  return { id: 'c1', name: 'Server', host: 'example.com', ...overrides }
}

describe('buildSshArgs', () => {
  it('minimal bağlantı: yalnızca host', () => {
    expect(buildSshArgs(conn())).toEqual(['example.com'])
  })

  it('user@host üretir', () => {
    expect(buildSshArgs(conn({ user: 'deploy' }))).toEqual(['deploy@example.com'])
  })

  it('22 numaralı portu argümana çevirmez', () => {
    expect(buildSshArgs(conn({ port: 22 }))).toEqual(['example.com'])
    expect(buildSshArgs(conn({ port: 2222 }))).toEqual(['-p', '2222', 'example.com'])
  })

  it('identity, jump host ve agent forwarding', () => {
    expect(buildSshArgs(conn({ identityFile: '/home/u/.ssh/id_ed25519', jumpHost: 'u@bastion', forwardAgent: true })))
      .toEqual(['-i', '/home/u/.ssh/id_ed25519', '-J', 'u@bastion', '-A', 'example.com'])
  })

  it('forwardAgent kapalıyken -A eklenmez', () => {
    expect(buildSshArgs(conn({ forwardAgent: false }))).toEqual(['example.com'])
  })

  it('extraArgs boşluğa göre bölünür, boşlar atılır', () => {
    expect(buildSshArgs(conn({ extraArgs: '  -o  ServerAliveInterval=30 ' })))
      .toEqual(['-o', 'ServerAliveInterval=30', 'example.com'])
  })

  it('argüman sırası: -p, -i, -J, -A, extra, hedef, uzak komut', () => {
    expect(
      buildSshArgs(
        conn({ user: 'u', port: 2200, identityFile: '/k', jumpHost: 'b', forwardAgent: true, extraArgs: '-o X=1', remoteCommand: 'htop' })
      )
    ).toEqual(['-p', '2200', '-i', '/k', '-J', 'b', '-A', '-o', 'X=1', 'u@example.com', 'htop'])
  })

  it('remoteCwd tek başına login kabuğu açar', () => {
    expect(buildSshArgs(conn({ remoteCwd: '/srv/app' })))
      .toEqual(['example.com', "cd '/srv/app' && exec $SHELL -l"])
  })

  it('remoteCwd + remoteCommand birleştirilir', () => {
    expect(buildSshArgs(conn({ remoteCwd: '/srv/app', remoteCommand: 'npm run dev' })))
      .toEqual(['example.com', "cd '/srv/app' && npm run dev"])
  })

  it('boşluklu remoteCwd tırnaklanır', () => {
    expect(buildSshArgs(conn({ remoteCwd: '/srv/my app' })))
      .toEqual(['example.com', "cd '/srv/my app' && exec $SHELL -l"])
  })

  it('tek tırnak içeren remoteCwd POSIX kaçışıyla üretilir', () => {
    expect(buildSshArgs(conn({ remoteCwd: "/srv/o'brien" })))
      .toEqual(['example.com', "cd '/srv/o'\\''brien' && exec $SHELL -l"])
  })

  it('boşluklu remoteCwd + remoteCommand birlikte', () => {
    expect(buildSshArgs(conn({ remoteCwd: '/srv/my app', remoteCommand: 'npm run dev' })))
      .toEqual(['example.com', "cd '/srv/my app' && npm run dev"])
  })

  it('uzak komut yoksa hiç ek argüman eklenmez (interaktif kabuk)', () => {
    expect(buildSshArgs(conn())).toHaveLength(1)
  })

  it('geçersiz host reddedilir', () => {
    expect(() => buildSshArgs(conn({ host: 'example.com; rm -rf /' }))).toThrow()
    expect(() => buildSshArgs(conn({ host: 'a$(whoami)' }))).toThrow()
    expect(() => buildSshArgs(conn({ user: 'root|x' }))).toThrow()
  })
})

describe('validateSshConnection', () => {
  it('geçerli bağlantıda null döner', () => {
    expect(validateSshConnection(conn({ user: 'u', port: 22, remoteCwd: '/srv/my app' }))).toBeNull()
  })

  it('boş host reddedilir', () => {
    expect(validateSshConnection(conn({ host: '  ' }))).toBeTruthy()
  })

  it('port aralığı doğrulanır', () => {
    expect(validateSshConnection(conn({ port: 0 }))).toBeTruthy()
    expect(validateSshConnection(conn({ port: 70000 }))).toBeTruthy()
  })

  it('remoteCwd ve identityFile kabuk metakarakteri kabul etmez', () => {
    expect(validateSshConnection(conn({ remoteCwd: '/srv && rm -rf /' }))).toBeTruthy()
    expect(validateSshConnection(conn({ identityFile: '/k`id`' }))).toBeTruthy()
  })

  it('remoteCwd boşluk ve tek tırnağa izin verir (tırnaklanıyor)', () => {
    expect(validateSshConnection(conn({ remoteCwd: "/srv/my o'app" }))).toBeNull()
  })

  it('jump host doğrulanır', () => {
    expect(validateSshConnection(conn({ jumpHost: 'b;evil' }))).toBeTruthy()
  })
})

describe('sshTarget', () => {
  it('user@host / host', () => {
    expect(sshTarget(conn({ user: 'u' }))).toBe('u@example.com')
    expect(sshTarget(conn())).toBe('example.com')
  })
})

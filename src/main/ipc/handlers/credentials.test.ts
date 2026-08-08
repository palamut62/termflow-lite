import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { readFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * The vault's single hard rule: a decrypted secret never leaves the main
 * process over IPC.
 */

const harness = vi.hoisted(() => ({
  userData: '',
  encryptionAvailable: true,
  envVars: [] as Array<Record<string, unknown>>
}))

vi.mock('electron', () => ({
  app: { getPath: () => harness.userData },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  safeStorage: {
    isEncryptionAvailable: () => harness.encryptionAvailable,
    // Reversible stand-in for DPAPI so tests can prove the stored blob is not
    // the plaintext and that decryption still feeds the PTY env.
    encryptString: (value: string) => Buffer.from('enc:' + value, 'utf-8'),
    decryptString: (buf: Buffer) => {
      const text = buf.toString('utf-8')
      if (!text.startsWith('enc:')) throw new Error('bad ciphertext')
      return text.slice(4)
    }
  }
}))

vi.mock('../../db/database', () => ({
  listEnvVars: (workspaceId: string) => harness.envVars.filter((e) => e.workspaceId === workspaceId),
  getEnvVar: (id: string) => harness.envVars.find((e) => e.id === id),
  createEnvVar: (input: Record<string, unknown>) => ({ id: 'env1', ...input }),
  updateEnvVar: vi.fn(),
  deleteEnvVar: vi.fn()
}))

import {
  createEnvVar,
  deleteCredential,
  listCredentials,
  listEnvVarsMasked,
  saveCredential,
  updateEnvVar,
  vaultFile,
  workspaceEnv
} from './credentials'

const SECRET = 'sk-super-secret-value'

beforeEach(() => {
  harness.userData = mkdtempSync(join(tmpdir(), 'termflow-vault-'))
  harness.encryptionAvailable = true
  harness.envVars = []
})

afterEach(() => {
  rmSync(harness.userData, { recursive: true, force: true })
  vi.clearAllMocks()
})

const validInput = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  name: 'Anthropic key',
  provider: 'anthropic',
  envKey: 'ANTHROPIC_API_KEY',
  value: SECRET,
  workspaceId: 'ws1',
  ...over
})

describe('credential vault — secret containment', () => {
  it('never returns the secret from save', async () => {
    const meta = await saveCredential(validInput())
    expect(JSON.stringify(meta)).not.toContain(SECRET)
    expect(meta).not.toHaveProperty('encryptedValue')
    expect(meta).not.toHaveProperty('value')
    expect(meta.envKey).toBe('ANTHROPIC_API_KEY')
  })

  it('never returns the secret from list', async () => {
    await saveCredential(validInput())
    const items = await listCredentials('ws1')
    expect(items).toHaveLength(1)
    expect(JSON.stringify(items)).not.toContain(SECRET)
    expect(items[0]).not.toHaveProperty('encryptedValue')
  })

  it('stores the value encrypted on disk, not in plaintext', async () => {
    await saveCredential(validInput())
    const raw = await readFile(vaultFile(), 'utf-8')
    expect(raw).not.toContain(SECRET)
    expect(raw).toContain('encryptedValue')
  })

  it('scopes listing to the workspace and to global entries', async () => {
    await saveCredential(validInput({ envKey: 'A_KEY' }))
    await saveCredential(validInput({ envKey: 'B_KEY', workspaceId: 'ws2' }))
    await saveCredential(validInput({ envKey: 'C_KEY', workspaceId: null }))
    expect((await listCredentials('ws1')).map((c) => c.envKey).sort()).toEqual(['A_KEY', 'C_KEY'])
  })

  it('decrypts only for the in-process PTY env', async () => {
    await saveCredential(validInput())
    await expect(workspaceEnv('ws1')).resolves.toEqual({ ANTHROPIC_API_KEY: SECRET })
  })

  it('drops provider keys when cleanProviderEnv is set', async () => {
    await saveCredential(validInput())
    await expect(workspaceEnv('ws1', true)).resolves.toEqual({})
  })

  it('refuses to save when encryption is unavailable', async () => {
    harness.encryptionAvailable = false
    await expect(saveCredential(validInput())).rejects.toThrow(/unavailable/)
  })

  it('updates in place instead of duplicating', async () => {
    const first = await saveCredential(validInput())
    await saveCredential(validInput({ id: first.id, name: 'Renamed' }))
    const items = await listCredentials('ws1')
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Renamed')
  })

  it('deletes without throwing on unknown ids', async () => {
    await saveCredential(validInput())
    await deleteCredential('nope')
    expect(await listCredentials('ws1')).toHaveLength(1)
    await deleteCredential(null)
    await deleteCredential((await listCredentials('ws1'))[0].id)
    expect(await listCredentials('ws1')).toHaveLength(0)
  })

  it('returns an empty list when the vault file is corrupt', async () => {
    await expect(listCredentials('ws1')).resolves.toEqual([])
  })
})

describe('credential vault — input validation', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['array', []],
    ['string', 'oops'],
    ['missing name', validInput({ name: undefined })],
    ['blank name', validInput({ name: '   ' })],
    ['non-string name', validInput({ name: 42 })],
    ['missing value', validInput({ value: undefined })],
    ['non-string value', validInput({ value: { a: 1 } })],
    ['invalid env key', validInput({ envKey: '9BAD-KEY' })],
    ['env key with spaces', validInput({ envKey: 'MY KEY' })],
    ['env key with shell chars', validInput({ envKey: 'KEY;calc' })],
    ['prototype pollution env key', validInput({ envKey: '__proto__' })],
    ['overlong name', validInput({ name: 'n'.repeat(400) })],
    ['overlong value', validInput({ value: 'x'.repeat(9000) })]
  ])('rejects %s without writing the vault', async (_label, input) => {
    await expect(saveCredential(input)).rejects.toThrow(/invalid/i)
    expect(await listCredentials()).toEqual([])
  })
})

describe('env vars', () => {
  it('masks encrypted values before they reach the renderer', () => {
    harness.envVars = [
      { id: '1', workspaceId: 'ws1', key: 'SECRET_KEY', value: Buffer.from('enc:' + SECRET).toString('base64'), masked: true },
      { id: '2', workspaceId: 'ws1', key: 'PUBLIC_KEY', value: 'plain', masked: false }
    ]
    const listed = listEnvVarsMasked('ws1')
    expect(JSON.stringify(listed)).not.toContain(SECRET)
    expect(listed[0].value).toBe('••••••••')
    expect(listed[1].value).toBe('plain')
  })

  it('returns an empty list for a bad workspace id', () => {
    expect(listEnvVarsMasked(null)).toEqual([])
    expect(listEnvVarsMasked(42)).toEqual([])
  })

  it('encrypts masked values on create', () => {
    const created = createEnvVar({ workspaceId: 'ws1', key: 'TOKEN', value: SECRET, masked: true })
    expect(created.value).not.toContain(SECRET)
    expect(created.masked).toBe(true)
  })

  it.each([
    ['null input', null],
    ['array input', []],
    ['missing workspace', { key: 'A', value: 'b', masked: false }],
    ['invalid key', { workspaceId: 'ws1', key: '1BAD', value: 'b', masked: false }],
    ['prototype pollution key', { workspaceId: 'ws1', key: '__proto__', value: 'b', masked: false }],
    ['non-string value', { workspaceId: 'ws1', key: 'A', value: 5, masked: false }]
  ])('rejects %s on create', (_label, input) => {
    expect(() => createEnvVar(input)).toThrow(/invalid/i)
  })

  it.each([
    ['missing id', undefined],
    ['non-string id', 5],
    ['empty id', '']
  ])('rejects %s on update', (_label, id) => {
    expect(() => updateEnvVar(id, { value: 'x' })).toThrow(/invalid/i)
  })

  it('rejects an invalid key patch on update', () => {
    expect(() => updateEnvVar('1', { key: 'bad key' })).toThrow(/invalid/i)
    expect(() => updateEnvVar('1', null)).toThrow(/invalid/i)
  })

  it('never lets a poisoned store inject __proto__ into the PTY env', async () => {
    harness.envVars = [
      { id: '1', workspaceId: 'ws1', key: '__proto__', value: 'polluted', masked: false },
      { id: '2', workspaceId: 'ws1', key: 'GOOD', value: 'ok', masked: false }
    ]
    const env = await workspaceEnv('ws1')
    expect(env).toEqual({ GOOD: 'ok' })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(env)).toBe(Object.prototype)
  })

  it('skips masked entries whose ciphertext cannot be decrypted', async () => {
    harness.envVars = [{ id: '1', workspaceId: 'ws1', key: 'BROKEN', value: 'not-base64-enc', masked: true }]
    await expect(workspaceEnv('ws1')).resolves.toEqual({})
  })
})

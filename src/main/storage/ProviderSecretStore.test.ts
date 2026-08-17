import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').slice('encrypted:'.length)
  }
}))

import { ProviderSecretStore } from './ProviderSecretStore'

const directories: string[] = []

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('ProviderSecretStore', () => {
  it('stores only encrypted provider credentials and can delete them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'termflow-provider-secret-'))
    directories.push(directory)
    const file = join(directory, 'provider-secrets.json')
    const store = new ProviderSecretStore(file)

    store.set('deepseek', 'deepseek-secret-value')

    expect(store.has('deepseek')).toBe(true)
    expect(store.get('deepseek')).toBe('deepseek-secret-value')
    expect(readFileSync(file, 'utf8')).not.toContain('deepseek-secret-value')

    store.delete('deepseek')
    expect(store.has('deepseek')).toBe(false)
  })
})

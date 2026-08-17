import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import { safeStorage } from 'electron'

type StoredSecrets = Record<string, string>

/** Encrypts provider credentials with the operating system credential service. */
export class ProviderSecretStore {
  constructor(private readonly filePath: string) {}

  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable()
  }

  has(providerId: string): boolean {
    return Object.hasOwn(this.load(), providerId)
  }

  get(providerId: string): string | undefined {
    const encrypted = this.load()[providerId]
    if (!encrypted || !this.isAvailable()) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
    } catch {
      return undefined
    }
  }

  set(providerId: string, secret: string): void {
    if (!this.isAvailable()) throw new Error('Secure credential storage is unavailable')
    const next = this.load()
    next[providerId] = safeStorage.encryptString(secret).toString('base64')
    this.save(next)
  }

  delete(providerId: string): void {
    const next = this.load()
    if (!Object.hasOwn(next, providerId)) return
    delete next[providerId]
    this.save(next)
  }

  private load(): StoredSecrets {
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as StoredSecrets
        : {}
    } catch {
      return {}
    }
  }

  private save(secrets: StoredSecrets): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temp = `${this.filePath}.tmp`
    writeFileSync(temp, JSON.stringify(secrets, null, 2), { encoding: 'utf8', mode: 0o600 })
    renameSync(temp, this.filePath)
  }
}

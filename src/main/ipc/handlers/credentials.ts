import { app, ipcMain, safeStorage } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { IPC, type CredentialMeta, type EnvEntry } from '../../../shared/types'
import * as dbApi from '../../db/database'

/**
 * Credential vault + workspace env vars.
 *
 * Invariant: a decrypted secret NEVER crosses the IPC boundary. `VAULT_*`
 * returns metadata only, `ENV_LIST` returns a mask for encrypted entries.
 * Plaintext values exist solely inside `workspaceEnv()`, which feeds the PTY
 * spawn in the main process.
 */

export interface StoredCredential extends CredentialMeta {
  encryptedValue: string
}

const ENV_KEY_SHAPE = /^[A-Za-z_][A-Za-z0-9_]*$/
// `__proto__` is a syntactically valid env key but a prototype-pollution
// vector once it is used as an object key, so it is rejected outright.
const UNSAFE_ENV_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export const ENV_KEY_RE = {
  test: (key: unknown): key is string =>
    typeof key === 'string' && ENV_KEY_SHAPE.test(key) && !UNSAFE_ENV_KEYS.has(key)
}
const MAX_SECRET_LENGTH = 8192
const MAX_NAME_LENGTH = 200

export function vaultFile(): string {
  return join(app.getPath('userData'), 'credential-vault.json')
}

export async function readVault(): Promise<StoredCredential[]> {
  try {
    const parsed = JSON.parse(await readFile(vaultFile(), 'utf-8')) as StoredCredential[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function writeVault(items: StoredCredential[]): Promise<void> {
  await writeFile(vaultFile(), JSON.stringify(items, null, 2), 'utf-8')
}

/** Strip the encrypted blob so only metadata can reach the renderer. */
function toMeta(record: StoredCredential): CredentialMeta {
  const { encryptedValue: _secret, ...meta } = record
  return meta
}

export async function listCredentials(workspaceId?: unknown): Promise<CredentialMeta[]> {
  const scope = typeof workspaceId === 'string' && workspaceId ? workspaceId : undefined
  return (await readVault())
    .filter((item) => !scope || !item.workspaceId || item.workspaceId === scope)
    .map(toMeta)
}

export async function saveCredential(input: unknown): Promise<CredentialMeta> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable')
  const row = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null
  if (!row) throw new Error('Credential input is invalid')
  const str = (value: unknown): string => (typeof value === 'string' ? value : '')
  const name = str(row.name).trim()
  const provider = str(row.provider).trim()
  const envKey = str(row.envKey).trim()
  const value = str(row.value)
  const workspaceId = typeof row.workspaceId === 'string' && row.workspaceId.length <= 128 ? row.workspaceId : null
  if (
    !name || name.length > MAX_NAME_LENGTH ||
    provider.length > MAX_NAME_LENGTH ||
    envKey.length > 128 || !ENV_KEY_RE.test(envKey) ||
    !value || value.length > MAX_SECRET_LENGTH
  ) {
    throw new Error('Credential input is invalid')
  }
  const requestedId = typeof row.id === 'string' && row.id.length > 0 && row.id.length <= 128 ? row.id : undefined
  const items = await readVault()
  const id = requestedId || nanoid()
  const record: StoredCredential = {
    id,
    name,
    provider,
    envKey,
    workspaceId,
    updatedAt: new Date().toISOString(),
    encryptedValue: safeStorage.encryptString(value).toString('base64')
  }
  await writeVault([...items.filter((item) => item.id !== id), record])
  return toMeta(record)
}

export async function deleteCredential(id: unknown): Promise<void> {
  if (typeof id !== 'string' || !id) return
  await writeVault((await readVault()).filter((item) => item.id !== id))
}

const PROVIDER_ENV_PREFIXES = ['ANTHROPIC_', 'CLAUDE_CODE_', 'OPENAI_', 'OPENROUTER_', 'DEEPSEEK_', 'OLLAMA_']
export const isProviderEnvKey = (key: string): boolean =>
  PROVIDER_ENV_PREFIXES.some((prefix) => key.toUpperCase().startsWith(prefix))

/**
 * Build the plaintext env for a PTY spawn. Main-process only — the result must
 * never be returned over IPC. Keys are re-validated here so a poisoned store
 * cannot inject `__proto__` (or any other non-identifier) into the env object.
 */
export async function workspaceEnv(workspaceId: string, cleanProviderEnv = false): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const put = (key: string, value: string): void => {
    if (!ENV_KEY_RE.test(key)) return
    Object.defineProperty(out, key, { value, enumerable: true, writable: true, configurable: true })
  }
  for (const entry of dbApi.listEnvVars(workspaceId)) {
    if (cleanProviderEnv && isProviderEnvKey(entry.key)) continue
    if (entry.masked && safeStorage.isEncryptionAvailable()) {
      try {
        put(entry.key, safeStorage.decryptString(Buffer.from(entry.value, 'base64')))
      } catch {
        continue
      }
    } else if (!entry.masked) {
      put(entry.key, entry.value)
    }
  }
  if (safeStorage.isEncryptionAvailable()) {
    for (const credential of await readVault()) {
      if (credential.workspaceId && credential.workspaceId !== workspaceId) continue
      if (cleanProviderEnv && isProviderEnvKey(credential.envKey)) continue
      try {
        put(credential.envKey, safeStorage.decryptString(Buffer.from(credential.encryptedValue, 'base64')))
      } catch {
        /* ignore invalid credential */
      }
    }
  }
  return out
}

/** Encrypted values are replaced with a mask before leaving the main process. */
export function listEnvVarsMasked(workspaceId: unknown): EnvEntry[] {
  if (typeof workspaceId !== 'string' || !workspaceId) return []
  return dbApi.listEnvVars(workspaceId).map((v) => ({ ...v, value: v.masked ? '••••••••' : v.value }))
}

export function createEnvVar(input: unknown): EnvEntry {
  const row = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : null
  const workspaceId = typeof row?.workspaceId === 'string' ? row.workspaceId : ''
  const key = typeof row?.key === 'string' ? row.key.trim() : ''
  const value = row?.value
  if (
    !workspaceId || key.length > 128 || !ENV_KEY_RE.test(key) ||
    typeof value !== 'string' || value.length > MAX_SECRET_LENGTH
  ) {
    throw new Error('Environment variable is invalid')
  }
  const masked = row?.masked === true && safeStorage.isEncryptionAvailable()
  return dbApi.createEnvVar({
    workspaceId,
    key,
    value: masked ? safeStorage.encryptString(value).toString('base64') : value,
    masked
  })
}

export function updateEnvVar(id: unknown, patch: unknown): void {
  if (typeof id !== 'string' || !id) throw new Error('Environment variable is invalid')
  const row = patch && typeof patch === 'object' && !Array.isArray(patch) ? { ...(patch as Partial<EnvEntry>) } : null
  if (!row) throw new Error('Environment variable is invalid')
  if (row.key !== undefined && (typeof row.key !== 'string' || !ENV_KEY_RE.test(row.key))) {
    throw new Error('Environment variable is invalid')
  }
  if (row.value !== undefined && (typeof row.value !== 'string' || row.value.length > MAX_SECRET_LENGTH)) {
    throw new Error('Environment variable is invalid')
  }
  if (row.value && safeStorage.isEncryptionAvailable()) {
    const existing = dbApi.getEnvVar(id)
    if (existing?.masked) row.value = safeStorage.encryptString(row.value).toString('base64')
  }
  dbApi.updateEnvVar(id, row)
}

export function registerCredentialIpc(): void {
  ipcMain.handle(IPC.ENV_LIST, (_e, workspaceId: string) => listEnvVarsMasked(workspaceId))
  ipcMain.handle(IPC.ENV_CREATE, (_e, input: unknown) => createEnvVar(input))
  ipcMain.handle(IPC.ENV_UPDATE, (_e, id: string, patch: Partial<EnvEntry>) => updateEnvVar(id, patch))
  ipcMain.handle(IPC.ENV_DELETE, (_e, id: string) => dbApi.deleteEnvVar(id))

  ipcMain.handle(IPC.VAULT_LIST, (_e, workspaceId?: string) => listCredentials(workspaceId))
  ipcMain.handle(IPC.VAULT_SAVE, (_e, input: unknown) => saveCredential(input))
  ipcMain.handle(IPC.VAULT_DELETE, (_e, id: string) => deleteCredential(id))
}

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { ProviderSecretStore } from '../storage/ProviderSecretStore'

function validProviderId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
}

export function registerProviderSecretsIpc(store: ProviderSecretStore): void {
  ipcMain.handle(IPC.PROVIDER_SECRET_STATUS, (_event, providerId: unknown) =>
    validProviderId(providerId) && store.has(providerId))

  ipcMain.handle(IPC.PROVIDER_SECRET_SET, (_event, providerId: unknown, secret: unknown) => {
    if (!validProviderId(providerId) || typeof secret !== 'string' || !secret.trim() || secret.length > 8192) {
      throw new Error('Invalid provider credential')
    }
    store.set(providerId, secret.trim())
    return true
  })

  ipcMain.handle(IPC.PROVIDER_SECRET_DELETE, (_event, providerId: unknown) => {
    if (validProviderId(providerId)) store.delete(providerId)
  })
}

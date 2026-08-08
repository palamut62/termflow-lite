import { ipcMain } from 'electron'
import type { AppSettings } from '../../shared/types'
import { IPC } from '../../shared/ipc'
import type { SettingsStore } from '../storage/SettingsStore'

/** GET/SET settings. The renderer already holds the optimistic value, so no
 *  change broadcast is needed — the SETTINGS_SET response is authoritative. */
export function registerSettingsIpc(store: SettingsStore): void {
  ipcMain.handle(IPC.SETTINGS_GET, () => store.get())

  ipcMain.handle(IPC.SETTINGS_SET, (_event, patch: Partial<AppSettings>) => {
    if (!patch || typeof patch !== 'object') return store.get()
    return store.update(patch)
  })
}

import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { PersistedSession } from '../../shared/types'
import type { SessionStore } from '../storage/SessionStore'

/**
 * Oturum (sekme + split düzeni) kalıcılığı. Kaydetme fire-and-forget'tir:
 * store zaten debounce ettiği için renderer her store değişiminde çağırabilir.
 */
export function registerSessionIpc(store: SessionStore): void {
  ipcMain.handle(IPC.SESSION_GET, () => store.get())

  ipcMain.on(IPC.SESSION_SAVE, (_event, session: PersistedSession) => {
    if (!session || typeof session !== 'object') return
    store.save(session)
  })

  ipcMain.on(IPC.SESSION_CLEAR, () => store.clear())
}

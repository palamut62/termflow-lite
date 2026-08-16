import { ipcMain } from 'electron'
import { IPC } from '../../shared/ipc'
import type { AgentEvent } from '../../shared/types'
import type { AgentEventStore } from '../storage/AgentEventStore'

export function registerAgentEventsIpc(store: AgentEventStore): void {
  ipcMain.handle(IPC.AGENT_EVENTS_LIST, (_event, limit: unknown) =>
    store.list(typeof limit === 'number' ? limit : 500))
  ipcMain.on(IPC.AGENT_EVENTS_APPEND, (_event, value: unknown) => {
    if (!value || typeof value !== 'object') return
    store.append(value as AgentEvent)
  })
  ipcMain.on(IPC.AGENT_EVENTS_CLEAR, () => store.clear())
}

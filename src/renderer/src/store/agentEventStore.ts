import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { AgentEvent, AgentKind, AgentPermissionMode } from '../../../shared/types'
import type { ParsedAgentEvent } from '../../../shared/agentEvents'

interface AgentEventState {
  events: AgentEvent[]
  open: boolean
  loaded: boolean
  load(): Promise<void>
  show(): void
  hide(): void
  append(tabId: string, agent: AgentKind, permissionMode: AgentPermissionMode, event: ParsedAgentEvent): void
  clear(): void
}

export const useAgentEventStore = create<AgentEventState>()((set, get) => ({
  events: [],
  open: false,
  loaded: false,
  async load() {
    if (get().loaded) return
    const events = await window.termflow.agentEvents.list(1000)
    set({ events, loaded: true })
  },
  show() {
    set({ open: true })
    void get().load()
  },
  hide() { set({ open: false }) },
  append(tabId, agent, permissionMode, event) {
    const last = get().events.at(-1)
    if (last?.tabId === tabId && last.kind === event.kind && last.title === event.title
      && last.detail === event.detail && Date.now() - last.createdAt < 3000) return
    const item: AgentEvent = {
      id: nanoid(12), tabId, agent, permissionMode, createdAt: Date.now(), ...event
    }
    set((state) => ({ events: [...state.events.slice(-999), item] }))
    window.termflow.agentEvents.append(item)
  },
  clear() {
    window.termflow.agentEvents.clear()
    set({ events: [] })
  }
}))

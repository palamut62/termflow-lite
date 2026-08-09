import { create } from 'zustand'

interface AgentSessionUiState {
  open: boolean
  show(): void
  hide(): void
  toggle(): void
}

export const useAgentSessionStore = create<AgentSessionUiState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open }))
}))

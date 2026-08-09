import { create } from 'zustand'

interface TaskPaletteState {
  open: boolean
  show(): void
  hide(): void
  toggle(): void
}

export const useTaskPaletteStore = create<TaskPaletteState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open }))
}))

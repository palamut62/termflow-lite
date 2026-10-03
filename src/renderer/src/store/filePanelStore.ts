import { create } from 'zustand'

interface FilePanelState {
  open: boolean
  showHidden: boolean
  filter: string
  /** Expanded folders by absolute path; kept while the panel is closed. */
  expanded: Set<string>
  /** Bumped by Refresh so every open folder reads its listing again. */
  revision: number
  toggle(): void
  hide(): void
  setShowHidden(value: boolean): void
  setFilter(value: string): void
  toggleExpanded(path: string): void
  refresh(): void
}

export const useFilePanelStore = create<FilePanelState>()((set) => ({
  open: false,
  showHidden: false,
  filter: '',
  expanded: new Set(),
  revision: 0,
  toggle: () => set((s) => ({ open: !s.open, revision: s.revision + 1 })),
  hide: () => set({ open: false }),
  setShowHidden: (showHidden) => set((s) => ({ showHidden, revision: s.revision + 1 })),
  setFilter: (filter) => set({ filter }),
  toggleExpanded: (path) => set((s) => {
    const expanded = new Set(s.expanded)
    if (expanded.has(path)) expanded.delete(path)
    else expanded.add(path)
    return { expanded }
  }),
  refresh: () => set((s) => ({ revision: s.revision + 1 }))
}))

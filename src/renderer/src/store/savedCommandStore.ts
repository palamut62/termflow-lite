import { nanoid } from 'nanoid'
import { create } from 'zustand'

export interface SavedCommand {
  id: string
  name: string
  command: string
  profileId: string
}

const STORAGE_KEY = 'termflow.saved-commands.v1'

export function normalizeSavedCommand(name: string, command: string, profileId: string): Pick<SavedCommand, 'name' | 'command' | 'profileId'> | null {
  const normalizedCommand = command.trim()
  const normalizedProfileId = profileId.trim()
  if (!normalizedCommand || !normalizedProfileId) return null
  return { name: name.trim() || normalizedCommand, command: normalizedCommand, profileId: normalizedProfileId }
}

function loadCommands(): SavedCommand[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is Omit<SavedCommand, 'profileId'> & { profileId?: string } =>
      typeof item?.id === 'string' && typeof item?.name === 'string' && typeof item?.command === 'string')
      .map((item) => ({ ...item, profileId: typeof item.profileId === 'string' ? item.profileId : '' }))
  } catch {
    return []
  }
}

function persist(commands: SavedCommand[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(commands))
  } catch {
    // Commands remain available for this session when storage is unavailable.
  }
}

interface SavedCommandState {
  commands: SavedCommand[]
  open: boolean
  show(): void
  hide(): void
  toggle(): void
  add(name: string, command: string, profileId: string): boolean
  update(id: string, name: string, command: string, profileId: string): boolean
  remove(id: string): void
}

export const useSavedCommandStore = create<SavedCommandState>()((set, get) => ({
  commands: loadCommands(),
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
  add(name, command, profileId) {
    const normalized = normalizeSavedCommand(name, command, profileId)
    if (!normalized) return false
    const commands = [...get().commands, { id: nanoid(10), ...normalized }]
    persist(commands)
    set({ commands })
    return true
  },
  update(id, name, command, profileId) {
    const normalized = normalizeSavedCommand(name, command, profileId)
    if (!normalized) return false
    const commands = get().commands.map((item) => item.id === id ? { ...item, ...normalized } : item)
    persist(commands)
    set({ commands })
    return true
  },
  remove(id) {
    const commands = get().commands.filter((item) => item.id !== id)
    persist(commands)
    set({ commands })
  }
}))

import { create } from 'zustand'
import { nanoid } from 'nanoid'

export interface CommandHistoryEntry {
  id: string
  command: string
  cwd: string
  profileId: string
  profileName: string
  timestamp: number
}

const STORAGE_KEY = 'termflow.command-history.v1'
const MAX_ENTRIES = 500

export function redactCommand(command: string): string {
  return command.replace(/((?:api[_-]?key|token|password|passwd|secret)\s*[=:]\s*)([^\s"']+|"[^"]*"|'[^']*')/gi, '$1***')
}

function loadEntries(): CommandHistoryEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : []
  } catch {
    return []
  }
}

function persist(entries: CommandHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // History remains available for this session when storage is unavailable.
  }
}

interface CommandHistoryState {
  entries: CommandHistoryEntry[]
  open: boolean
  show(): void
  hide(): void
  toggle(): void
  add(entry: Omit<CommandHistoryEntry, 'id' | 'command' | 'timestamp'> & { command: string }): void
  remove(id: string): void
  clear(): void
}

export const useCommandHistoryStore = create<CommandHistoryState>()((set, get) => ({
  entries: loadEntries(),
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
  add(entry) {
    const command = redactCommand(entry.command.trim())
    if (!command) return
    const entries = [{ ...entry, command, id: nanoid(10), timestamp: Date.now() }, ...get().entries].slice(0, MAX_ENTRIES)
    persist(entries)
    set({ entries })
  },
  remove(id) {
    const entries = get().entries.filter((entry) => entry.id !== id)
    persist(entries)
    set({ entries })
  },
  clear() {
    persist([])
    set({ entries: [] })
  }
}))

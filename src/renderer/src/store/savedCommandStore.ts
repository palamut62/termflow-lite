import { nanoid } from 'nanoid'
import { create } from 'zustand'
import { isDue, normalizeSchedule, type CommandSchedule } from './commandSchedule'

export interface SavedCommand {
  id: string
  name: string
  command: string
  profileId: string
  schedule?: CommandSchedule
  scheduleAnchor?: number
  lastRunAt?: number
}

const STORAGE_KEY = 'termflow.saved-commands.v1'

export function normalizeSavedCommand(name: string, command: string, profileId: string): Pick<SavedCommand, 'name' | 'command' | 'profileId'> | null {
  const normalizedCommand = command.trim()
  const normalizedProfileId = profileId.trim()
  if (!normalizedCommand || !normalizedProfileId) return null
  return { name: name.trim() || normalizedCommand, command: normalizedCommand, profileId: normalizedProfileId }
}

export function normalizeStoredCommands(parsed: unknown, now: number): { commands: SavedCommand[]; changed: boolean } {
  if (!Array.isArray(parsed)) return { commands: [], changed: false }
  let changed = false
  const commands = parsed.filter((item): item is Record<string, unknown> =>
    typeof item?.id === 'string' && typeof item?.name === 'string' && typeof item?.command === 'string')
    .map((item) => {
      const command: SavedCommand = {
        id: item.id as string,
        name: item.name as string,
        command: item.command as string,
        profileId: typeof item.profileId === 'string' ? item.profileId : ''
      }
      const schedule = normalizeSchedule(item.schedule)
      if (schedule) {
        command.schedule = schedule
        if (typeof item.scheduleAnchor === 'number') command.scheduleAnchor = item.scheduleAnchor
        else {
          command.scheduleAnchor = now
          changed = true
        }
        if (typeof item.lastRunAt === 'number') command.lastRunAt = item.lastRunAt
      } else if (item.schedule !== undefined) {
        changed = true
      }
      return command
    })
  return { commands, changed }
}

export function selectDueCommands(commands: SavedCommand[], now: number): SavedCommand[] {
  return commands.filter((item) => item.schedule && isDue(item.schedule, item.lastRunAt ?? item.scheduleAnchor ?? now, now))
}

function loadCommands(): SavedCommand[] {
  try {
    const { commands, changed } = normalizeStoredCommands(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'), Date.now())
    if (changed) persist(commands)
    return commands
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
  add(name: string, command: string, profileId: string, schedule?: CommandSchedule | null): boolean
  update(id: string, name: string, command: string, profileId: string, schedule?: CommandSchedule | null): boolean
  remove(id: string): void
  markRan(id: string, at: number): void
}

function sameSchedule(a: CommandSchedule | undefined, b: CommandSchedule | undefined): boolean {
  if (!a || !b) return !a && !b
  return JSON.stringify(a) === JSON.stringify(b)
}

export const useSavedCommandStore = create<SavedCommandState>()((set, get) => ({
  commands: loadCommands(),
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((state) => ({ open: !state.open })),
  add(name, command, profileId, schedule) {
    const normalized = normalizeSavedCommand(name, command, profileId)
    if (!normalized) return false
    const nextSchedule = normalizeSchedule(schedule)
    const entry: SavedCommand = { id: nanoid(10), ...normalized }
    if (nextSchedule) {
      entry.schedule = nextSchedule
      entry.scheduleAnchor = Date.now()
    }
    const commands = [...get().commands, entry]
    persist(commands)
    set({ commands })
    return true
  },
  update(id, name, command, profileId, schedule) {
    const normalized = normalizeSavedCommand(name, command, profileId)
    if (!normalized) return false
    const nextSchedule = normalizeSchedule(schedule) ?? undefined
    const commands = get().commands.map((item) => {
      if (item.id !== id) return item
      const next: SavedCommand = { ...item, ...normalized }
      if (!nextSchedule) {
        delete next.schedule
        delete next.scheduleAnchor
        delete next.lastRunAt
        return next
      }
      next.schedule = nextSchedule
      if (!sameSchedule(item.schedule, nextSchedule)) {
        next.scheduleAnchor = Date.now()
        delete next.lastRunAt
      } else next.scheduleAnchor = item.scheduleAnchor ?? Date.now()
      return next
    })
    persist(commands)
    set({ commands })
    return true
  },
  remove(id) {
    const commands = get().commands.filter((item) => item.id !== id)
    persist(commands)
    set({ commands })
  },
  markRan(id, at) {
    const commands = get().commands.map((item) => item.id === id ? { ...item, lastRunAt: at } : item)
    persist(commands)
    set({ commands })
  }
}))

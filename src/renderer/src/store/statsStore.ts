import { create } from 'zustand'
import { emptyStats, parseStats, recordAgentSession, recordCommand, recordFinish, type UsageStats } from '../fun/stats'

const STORAGE_KEY = 'termflow.usage-stats.v1'
const WRITE_DEBOUNCE_MS = 2000

let writeTimer: ReturnType<typeof setTimeout> | null = null
function persist(stats: UsageStats): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
    } catch {
      // Depolama yoksa istatistikler bu oturumla sınırlı kalır.
    }
  }, WRITE_DEBOUNCE_MS)
}

interface StatsState {
  stats: UsageStats
  open: boolean
  show(): void
  hide(): void
  command(command: string, cwd: string): void
  finished(command: string, exitCode: number, durationMs: number): void
  agentSession(): void
  reset(): void
}

/** Wrapped ekranının veri kaynağı; yalnızca sayaçlar (bkz. fun/stats.ts). */
export const useStatsStore = create<StatsState>()((set, get) => {
  const apply = (next: UsageStats): void => {
    set({ stats: next })
    persist(next)
  }
  return {
    stats: parseStats(typeof localStorage === 'undefined' ? null : localStorage.getItem(STORAGE_KEY)),
    open: false,
    show: () => set({ open: true }),
    hide: () => set({ open: false }),
    command: (command, cwd) => apply(recordCommand(get().stats, command, cwd)),
    finished: (command, exitCode, durationMs) => apply(recordFinish(get().stats, command, exitCode, durationMs)),
    agentSession: () => apply(recordAgentSession(get().stats)),
    reset: () => apply(emptyStats())
  }
})

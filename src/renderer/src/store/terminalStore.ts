import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { TerminalTab } from '../../../shared/types'
import { resolveDefaultProfileId, useSettingsStore } from './settingsStore'

/**
 * Global per-tab stream listeners. App registers exactly ONE preload onData /
 * onExit listener and dispatches to these maps; TerminalView (re)registers its
 * handlers when it mounts. Kept outside the store so the data hot path never
 * triggers a re-render.
 */
export const dataHandlers = new Map<string, (data: string) => void>()
export const exitHandlers = new Map<string, (exitCode: number, durationMs: number) => void>()

function tabTitleFor(profileId: string): string {
  const st = useSettingsStore.getState()
  const profile = st.settings.profiles.find((p) => p.id === profileId)
  const shell = st.shells.find((s) => s.id === profileId)
  return profile?.name ?? shell?.name ?? 'Terminal'
}

function makeTab(profileId: string): TerminalTab {
  return { id: nanoid(10), title: tabTitleFor(profileId), profileId }
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  /** id nanoid(10); title = profile adı; aktif yapar. */
  addTab(profileId: string): string
  /** Aktifse komşuya geçer; son sekme kapanırsa default profile ile yenisi açılır. */
  closeTab(id: string): void
  setActiveTab(id: string): void
  renameTab(id: string, title: string): void
  /** Reorder (Faz 7'de sürükleme; store şimdi hazır). */
  moveTab(id: string, toIndex: number): void
  setTabCwd(id: string, cwd: string): void
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab(profileId) {
    const tab = makeTab(profileId)
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id }))
    return tab.id
  },

  closeTab(id) {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0) return

    // Tear the PTY down and drop the stream handlers for this tab.
    window.termflow.pty.kill(id)
    dataHandlers.delete(id)
    exitHandlers.delete(id)

    const next = tabs.filter((t) => t.id !== id)
    if (next.length === 0) {
      // Uygulama hiç boş kalmasın: default profile ile yeni tab aç.
      const { settings, shells } = useSettingsStore.getState()
      const tab = makeTab(resolveDefaultProfileId(settings, shells))
      set({ tabs: [tab], activeTabId: tab.id })
      return
    }

    let nextActive = activeTabId
    if (activeTabId === id) {
      nextActive = next[Math.min(idx, next.length - 1)]?.id ?? next[0].id
    }
    set({ tabs: next, activeTabId: nextActive })
  },

  setActiveTab(id) {
    if (!get().tabs.some((t) => t.id === id)) return
    set({ activeTabId: id })
  },

  renameTab(id, title) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, title } : t)) }))
  },

  moveTab(id, toIndex) {
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === id)
      if (from < 0) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      const clamped = Math.max(0, Math.min(toIndex, tabs.length))
      tabs.splice(clamped, 0, moved)
      return { tabs }
    })
  },

  setTabCwd(id, cwd) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, cwd } : t)) }))
  }
}))

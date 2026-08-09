import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { SearchAddon } from '@xterm/addon-search'
import type { TerminalTab } from '../../../shared/types'
import { mergeProfiles, providerFromProfileId } from '../../../shared/profiles'
import { resolveDefaultProfileId, useSettingsStore } from './settingsStore'

/**
 * Global per-tab stream listeners. App registers exactly ONE preload onData /
 * onExit listener and dispatches to these maps; TerminalView (re)registers its
 * handlers when it mounts. Kept outside the store so the data hot path never
 * triggers a re-render.
 */
export const dataHandlers = new Map<string, (data: string) => void>()
export const exitHandlers = new Map<string, (exitCode: number, durationMs: number) => void>()

/**
 * Per-tab SearchAddon instances (registered by TerminalView on mount, same
 * lifecycle as dataHandlers). The search bar UI (TerminalSearch) looks its
 * addon up here instead of threading refs through props.
 */
export const searchAddons = new Map<string, SearchAddon>()

function tabTitleFor(profileId: string): string {
  const st = useSettingsStore.getState()
  const profile = mergeProfiles(st.settings.profiles).find((p) => p.id === profileId)
  const shell = st.shells.find((s) => s.id === profileId)
  const provider = providerFromProfileId(st.settings, profileId)
  return profile?.name ?? provider?.name ?? shell?.name ?? 'Terminal'
}

function makeTab(profileId: string, cwd?: string): TerminalTab {
  return { id: nanoid(10), title: tabTitleFor(profileId), profileId, running: true, cwd, launchCwd: cwd }
}

interface TerminalState {
  tabs: TerminalTab[]
  activeTabId: string | null
  /** id nanoid(10); title = profile adı. activate=false ile arka planda açar (sonraki fazlar). */
  addTab(profileId: string, activate?: boolean, cwd?: string): string
  /** Onay bekleyen sekme (uygulama içi modal); null = onay istenmiyor. */
  pendingCloseTabId: string | null
  /** UI girişi: settings.confirmBeforeClose ise onay modalını açar, değilse direkt kapatır. */
  requestCloseTab(id: string): void
  /** Modaldaki "Close": bekleyen sekmeyi kapatır. */
  confirmCloseTab(): void
  /** Modaldaki "Cancel" / Escape / dışa tık. */
  cancelCloseTab(): void
  /** Onay sormadan kapatır; aktifse komşuya geçer, son sekme kapanırsa default profile ile yenisi açılır. */
  closeTab(id: string): void
  setActiveTab(id: string): void
  renameTab(id: string, title: string): void
  setTabRunning(id: string, running: boolean): void
  /** Reorder (Faz 7'de sürükleme; store şimdi hazır). */
  moveTab(id: string, toIndex: number): void
  setTabCwd(id: string, cwd: string): void
}

export const useTerminalStore = create<TerminalState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab(profileId, activate = true, cwd) {
    const tab = makeTab(profileId, cwd)
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: activate ? tab.id : s.activeTabId }))
    return tab.id
  },

  pendingCloseTabId: null,

  requestCloseTab(id) {
    if (!get().tabs.some((t) => t.id === id)) return
    // settings.confirmBeforeClose: in-app onay modalı (native confirm renderer'ı
    // bloke ettiği için kullanılmaz).
    if (useSettingsStore.getState().settings.confirmBeforeClose) {
      set({ pendingCloseTabId: id })
      return
    }
    get().closeTab(id)
  },

  confirmCloseTab() {
    const id = get().pendingCloseTabId
    set({ pendingCloseTabId: null })
    if (id) get().closeTab(id)
  },

  cancelCloseTab() {
    set({ pendingCloseTabId: null })
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

  setTabRunning(id, running) {
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, running } : t)) }))
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

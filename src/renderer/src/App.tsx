import { useEffect, useRef } from 'react'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { resolveDefaultProfileId, useSettingsStore } from './store/settingsStore'
import { dataHandlers, exitHandlers, useTerminalStore } from './store/terminalStore'
import { TabBar } from './tabs/TabBar'
import { TerminalView } from './terminal/TerminalView'
import { Settings } from './settings/Settings'
import { StatusBar } from './components/StatusBar'
import { CommandHistory } from './components/CommandHistory'
import { useCommandHistoryStore } from './store/commandHistoryStore'
import { TaskPalette } from './components/TaskPalette'
import { useTaskPaletteStore } from './store/taskPaletteStore'
import { AgentSessions } from './components/AgentSessions'
import { useAgentSessionStore } from './store/agentSessionStore'
import type { PaneNode } from './paneUtils'
import { matchShortcut } from './shortcuts'
import type { AppLaunchRequest } from '../../shared/ipc'
import { SavedCommands } from './components/SavedCommands'
import { useSavedCommandStore } from './store/savedCommandStore'

// StrictMode double-mounts effects in dev — the boot sequence must run once.
let bootStarted = false

export default function App(): React.JSX.Element {
  const loaded = useSettingsStore((s) => s.loaded)
  const tabHeight = useSettingsStore((s) => s.settings.tabHeight)
  const themeId = useSettingsStore((s) => s.settings.themeId)
  const settingsOpen = useSettingsStore((s) => s.settingsOpen)
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)
  const pendingCloseTabId = useTerminalStore((s) => s.pendingCloseTabId)
  const splitDirection = useTerminalStore((s) => s.splitDirection)
  const splitTabIds = useTerminalStore((s) => s.splitTabIds)
  const splitRatio = useTerminalStore((s) => s.splitRatio)
  const paneTree = useTerminalStore((s) => s.paneTree)
  const historyOpen = useCommandHistoryStore((s) => s.open)
  const taskPaletteOpen = useTaskPaletteStore((s) => s.open)
  const agentSessionsOpen = useAgentSessionStore((s) => s.open)
  const savedCommandsOpen = useSavedCommandStore((s) => s.open)

  // Boot: settings + shells yükle, sonra default profile ile ilk tab'ı aç.
  useEffect(() => {
    if (bootStarted) return
    bootStarted = true
    void (async () => {
      const st = useSettingsStore.getState()
      if (!st.loaded) await st.load()
      useSettingsStore.getState().applyTheme()
      const { settings, shells } = useSettingsStore.getState()
      const request = await window.termflow.appLaunch.request()
      // Oturum geri yükleme: kayıt varsa ilk tab'ı açmak yerine sekmeler +
      // pane düzeni geri gelir. Komut satırından gelen launch request her
      // zaman öncelikli — restore'dan SONRA ek sekme olarak açılır.
      let restored = false
      if (settings.restoreSession) {
        const session = await window.termflow.session.get()
        if (session) restored = useTerminalStore.getState().hydrateSession(session)
      }
      if (!restored || request) {
        useTerminalStore.getState().addTab(resolveLaunchProfile(request, settings, shells), true, request?.cwd)
      }
    })()
  }, [])

  // Sekme/split düzenini kalıcı hale getir (main zaten debounce ediyor).
  useEffect(() => useTerminalStore.subscribe((state) => {
    if (!useSettingsStore.getState().settings.restoreSession) return
    window.termflow.session.save({
      version: 1,
      tabs: state.tabs.map((tab) => ({ id: tab.id, title: tab.title, profileId: tab.profileId, cwd: tab.cwd || tab.launchCwd })),
      activeTabId: state.activeTabId,
      paneTree: state.paneTree,
      splitDirection: state.splitDirection,
      splitRatio: state.splitRatio,
      workspaceCwd: state.workspaceCwd
    })
  }), [])

  useEffect(() => window.termflow.appLaunch.onOpenPath((request) => {
    const { settings, shells } = useSettingsStore.getState()
    useTerminalStore.getState().addTab(resolveLaunchProfile(request, settings, shells), true, request.cwd)
  }), [])

  // Klavye kısayolları (PRD §39): CAPTURE fazında — xterm'in textarea'sından
  // önce çalışır. Sadece eşleşen kısayollarda preventDefault; xterm'e giden
  // diğer tuşlar etkilenmez.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Settings modal açıkken kısayollar sessize alınır — yoksa Ctrl+W gibi
      // bağlamalar ayarları düzenlerken tab kapatabilir (KeyboardSettings
      // kayıt modu zaten document capture'da yakalayıp yutar).
      if (useSettingsStore.getState().settingsOpen) return
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === '\\') {
        useTerminalStore.getState().splitActive(e.shiftKey ? 'horizontal' : 'vertical')
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.ctrlKey && e.altKey && splitTabIds) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') useTerminalStore.getState().focusSplitPane('first')
        else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') useTerminalStore.getState().focusSplitPane('second')
        else return
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'p') {
        useTaskPaletteStore.getState().toggle()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'h') {
        useCommandHistoryStore.getState().toggle()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key === 'Escape' && useCommandHistoryStore.getState().open) {
        useCommandHistoryStore.getState().hide()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key === 'Escape' && useSavedCommandStore.getState().open) {
        useSavedCommandStore.getState().hide()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      if (e.key === 'Escape' && useAgentSessionStore.getState().open) {
        useAgentSessionStore.getState().hide()
        e.preventDefault()
        e.stopPropagation()
        return
      }
      const action = matchShortcut(e, useSettingsStore.getState().settings.shortcuts)
      if (!action) return

      const termStore = useTerminalStore.getState()
      switch (action) {
        case 'new-tab': {
          const { settings, shells } = useSettingsStore.getState()
          termStore.addTab(resolveDefaultProfileId(settings, shells))
          break
        }
        case 'close-tab': {
          const id = termStore.activeTabId
          if (id) termStore.requestCloseTab(id)
          break
        }
        case 'next-tab':
        case 'prev-tab': {
          const { tabs, activeTabId } = termStore
          if (tabs.length === 0) break
          const idx = Math.max(0, tabs.findIndex((t) => t.id === activeTabId))
          const dir = action === 'next-tab' ? 1 : -1
          termStore.setActiveTab(tabs[(idx + dir + tabs.length) % tabs.length].id)
          break
        }
        case 'font-increase':
        case 'font-decrease': {
          const fontSize = useSettingsStore.getState().settings.fontSize
          const step = action === 'font-increase' ? 1 : -1
          void useSettingsStore.getState().update({
            fontSize: Math.max(8, Math.min(32, fontSize + step))
          })
          break
        }
        case 'font-reset':
          void useSettingsStore.getState().update({ fontSize: DEFAULT_SETTINGS.fontSize })
          break
        case 'search': {
          // Aktif tab'ın search bar'ını aç (TerminalView uiSearchTabId'yi dinler).
          const id = termStore.activeTabId
          if (id) useSettingsStore.getState().openSearch(id)
          break
        }
        case 'toggle-broadcast':
          termStore.toggleBroadcastInput()
          break
        case 'settings':
          useSettingsStore.getState().openSettings()
          break
        default:
          return
      }
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [splitTabIds])

  // PTY stream listeners: tek global onData/onExit/onCwd kaydı, per-tab
  // handler'lara dağıtım (TerminalView kendi handler'ını kaydeder).
  useEffect(() => {
    const unData = window.termflow.pty.onData(({ ptyId, data }) => dataHandlers.get(ptyId)?.(data))
    const unExit = window.termflow.pty.onExit(({ ptyId, exitCode, durationMs }) =>
      exitHandlers.get(ptyId)?.(exitCode, durationMs)
    )
    // cwd her prompt'ta gelebilir; son kullanılan dizini en fazla 2s'de 1 kez
    // persist et (PRD §38 — startupDirectory 'last' için settings.lastCwd).
    let lastCwdWrite = 0
    const unCwd = window.termflow.pty.onCwd(({ ptyId, cwd }) => {
      useTerminalStore.getState().setTabCwd(ptyId, cwd)
      const now = Date.now()
      if (now - lastCwdWrite >= 2000) {
        lastCwdWrite = now
        void useSettingsStore.getState().update({ lastCwd: cwd })
      }
    })
    return () => {
      unData()
      unExit()
      unCwd()
    }
  }, [])

  // NOT: Pencere boyutu persistency'sinin tek sahibi main process'tir
  // (BrowserWindow 'resize' -> settings.json); renderer boyut yazmaz.

  // Tema değişince CSS variable'ları yeniden uygula.
  useEffect(() => {
    if (loaded) useSettingsStore.getState().applyTheme()
  }, [themeId, loaded])

  return (
    <div className="app">
      <TabBar height={tabHeight} />
      <div className="terminal-area" style={{ '--split-percent': `${splitRatio * 100}%` } as React.CSSProperties}>
        {/* Tüm tab'lar mount kalır (mount = PTY create); aktif olmayanlar CSS ile
            gizlenir ama layout boyutunu korur, böylece arka plandaki process
            ölmez ve gizli terminal doğru cols/rows'a fit olmaya devam eder. */}
        {paneTree
          ? <PaneRenderer pane={paneTree} path={[]} activeTabId={activeTabId} />
          : tabs.map((tab) => <TerminalView key={tab.id} tabId={tab.id} active={tab.id === activeTabId} />)}
      </div>
      <StatusBar />
      {historyOpen && <CommandHistory />}
      {savedCommandsOpen && <SavedCommands />}
      {agentSessionsOpen && <AgentSessions />}
      {taskPaletteOpen && <TaskPalette />}
      {settingsOpen && <Settings />}
      {pendingCloseTabId && <CloseTabConfirm />}
    </div>
  )
}

function resolveLaunchProfile(request: AppLaunchRequest | null, settings: typeof DEFAULT_SETTINGS, shells: ReturnType<typeof useSettingsStore.getState>['shells']): string {
  if (!request?.profileId) return resolveDefaultProfileId(settings, shells)
  const available = shells.some((shell) => shell.id === request.profileId) ||
    settings.profiles.some((profile) => profile.id === request.profileId) ||
    settings.providerProfiles.some((provider) => `provider:${provider.id}` === request.profileId) ||
    ['claude', 'codex', 'opencode', 'ollama-serve'].includes(request.profileId)
  return available ? request.profileId : resolveDefaultProfileId(settings, shells)
}

function PaneRenderer({ pane, path, activeTabId }: { pane: PaneNode; path: number[]; activeTabId: string | null }): React.JSX.Element {
  if (pane.type === 'leaf') {
    return <div className={`pane-leaf${pane.terminalId === activeTabId ? ' pane-leaf-active' : ''}`}><TerminalView tabId={pane.terminalId} active={pane.terminalId === activeTabId} visible /></div>
  }
  const basis = (ratio: number): React.CSSProperties => ({ flex: `${ratio} 1 0`, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden' })
  return <div className={`pane-tree-split pane-tree-${pane.dir}`}>
    <div style={basis(pane.ratio)}><PaneRenderer pane={pane.a} path={[...path, 0]} activeTabId={activeTabId} /></div>
    <PaneDivider direction={pane.dir} path={path} ratio={pane.ratio} />
    <div style={basis(1 - pane.ratio)}><PaneRenderer pane={pane.b} path={[...path, 1]} activeTabId={activeTabId} /></div>
  </div>
}

function PaneDivider({ direction, path, ratio }: { direction: 'vertical' | 'horizontal'; path: number[]; ratio: number }): React.JSX.Element {
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const divider = event.currentTarget
    const container = divider.parentElement
    if (!container) return
    divider.setPointerCapture(event.pointerId)
    const onMove = (move: PointerEvent): void => {
      const rect = container.getBoundingClientRect()
      const ratio = direction === 'vertical'
        ? (move.clientX - rect.left) / rect.width
        : (move.clientY - rect.top) / rect.height
      useTerminalStore.getState().setPaneRatio(path, ratio)
    }
    const onUp = (up: PointerEvent): void => {
      try { divider.releasePointerCapture(up.pointerId) } catch { /* already released */ }
      divider.removeEventListener('pointermove', onMove)
      divider.removeEventListener('pointerup', onUp)
    }
    divider.addEventListener('pointermove', onMove)
    divider.addEventListener('pointerup', onUp)
  }
  return <div className={`pane-tree-divider pane-tree-divider-${direction}`} onPointerDown={onPointerDown} role="separator" aria-label="Resize split terminals" aria-valuenow={Math.round(ratio * 100)} />
}

/**
 * Uygulama içi kapatma onayı (PRD §36 confirmBeforeClose). Native
 * window.confirm renderer'ı bloke ettiği için kullanılmaz: Escape/dışa tık
 * iptal eder, Enter onaylar.
 */
function CloseTabConfirm(): React.JSX.Element {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      useTerminalStore.getState().cancelCloseTab()
    } else if (e.key === 'Enter') {
      e.stopPropagation()
      useTerminalStore.getState().confirmCloseTab()
    }
  }

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) useTerminalStore.getState().cancelCloseTab()
      }}
    >
      <div
        ref={panelRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Close terminal tab"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="confirm-dialog-text">Close this terminal tab?</div>
        <div className="confirm-dialog-actions">
          <button className="settings-btn" onClick={() => useTerminalStore.getState().cancelCloseTab()}>
            Cancel
          </button>
          <button
            className="settings-btn settings-btn-primary"
            onClick={() => useTerminalStore.getState().confirmCloseTab()}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { resolveDefaultProfileId, useSettingsStore } from './store/settingsStore'
import { dataHandlers, exitHandlers, useTerminalStore } from './store/terminalStore'
import { TabBar } from './tabs/TabBar'
import { TerminalView } from './terminal/TerminalView'
import { Settings } from './settings/Settings'
import { StatusBar } from './components/StatusBar'
import { matchShortcut } from './shortcuts'

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

  // Boot: settings + shells yükle, sonra default profile ile ilk tab'ı aç.
  useEffect(() => {
    if (bootStarted) return
    bootStarted = true
    void (async () => {
      const st = useSettingsStore.getState()
      if (!st.loaded) await st.load()
      useSettingsStore.getState().applyTheme()
      const { settings, shells } = useSettingsStore.getState()
      useTerminalStore.getState().addTab(resolveDefaultProfileId(settings, shells))
    })()
  }, [])

  // Klavye kısayolları (PRD §39): CAPTURE fazında — xterm'in textarea'sından
  // önce çalışır. Sadece eşleşen kısayollarda preventDefault; xterm'e giden
  // diğer tuşlar etkilenmez.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // Settings modal açıkken kısayollar sessize alınır — yoksa Ctrl+W gibi
      // bağlamalar ayarları düzenlerken tab kapatabilir (KeyboardSettings
      // kayıt modu zaten document capture'da yakalayıp yutar).
      if (useSettingsStore.getState().settingsOpen) return
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
  }, [])

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
      <div className="terminal-area">
        {/* Tüm tab'lar mount kalır (mount = PTY create); aktif olmayanlar CSS ile
            gizlenir ama layout boyutunu korur, böylece arka plandaki process
            ölmez ve gizli terminal doğru cols/rows'a fit olmaya devam eder. */}
        {tabs.map((t) => (
          <TerminalView key={t.id} tabId={t.id} active={t.id === activeTabId} />
        ))}
      </div>
      <StatusBar />
      {settingsOpen && <Settings />}
      {pendingCloseTabId && <CloseTabConfirm />}
    </div>
  )
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

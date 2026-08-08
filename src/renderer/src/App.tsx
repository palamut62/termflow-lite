import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import { DEFAULT_SETTINGS } from '../../shared/types'
import { resolveDefaultProfileId, useSettingsStore } from './store/settingsStore'
import { dataHandlers, exitHandlers, useTerminalStore } from './store/terminalStore'
import { TabBar } from './tabs/TabBar'
import { TerminalView } from './terminal/TerminalView'
import { matchShortcut } from './shortcuts'

// StrictMode double-mounts effects in dev — the boot sequence must run once.
let bootStarted = false

export default function App(): React.JSX.Element {
  const loaded = useSettingsStore((s) => s.loaded)
  const tabHeight = useSettingsStore((s) => s.settings.tabHeight)
  const opacity = useSettingsStore((s) => s.settings.opacity)
  const blur = useSettingsStore((s) => s.settings.blur)
  const themeId = useSettingsStore((s) => s.settings.themeId)
  const tabs = useTerminalStore((s) => s.tabs)
  const activeTabId = useTerminalStore((s) => s.activeTabId)

  const activeTab = tabs.find((t) => t.id === activeTabId)

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
          if (id) termStore.closeTab(id)
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
        default:
          return // search/settings bindings land in Faz 6-7
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
    const unCwd = window.termflow.pty.onCwd(({ ptyId, cwd }) =>
      useTerminalStore.getState().setTabCwd(ptyId, cwd)
    )
    return () => {
      unData()
      unExit()
      unCwd()
    }
  }, [])

  // Pencere boyutu: mount'ta gerçek boyutu al ve persist et; resize'da
  // settingsStore'a debounce ile yansıt.
  useEffect(() => {
    void (async () => {
      const size = await window.termflow.window.getSize()
      useSettingsStore.getState().update({ windowWidth: size.width, windowHeight: size.height })
    })()
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = (): void => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        useSettingsStore
          .getState()
          .update({ windowWidth: window.innerWidth, windowHeight: window.innerHeight })
      }, 300)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
    }
  }, [])

  // Tema değişince CSS variable'ları yeniden uygula.
  useEffect(() => {
    if (loaded) useSettingsStore.getState().applyTheme()
  }, [themeId, loaded])

  return (
    <div className="app">
      <TabBar height={tabHeight} />
      <div
        className="terminal-area"
        style={
          {
            '--terminal-opacity': `${opacity}%`,
            '--terminal-blur': blur ? '8px' : '0px'
          } as CSSProperties
        }
      >
        {/* Sadece aktif tab mount edilir — TerminalView mount = PTY create. */}
        {activeTab && <TerminalView key={activeTab.id} tabId={activeTab.id} active />}
      </div>
    </div>
  )
}

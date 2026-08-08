import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { dataHandlers, exitHandlers, searchAddons, useTerminalStore } from '../store/terminalStore'
import { resolveTheme } from '../themes/themes'
import { TerminalContextMenu } from './TerminalContextMenu'
import { TerminalSearch } from './TerminalSearch'

interface Props {
  tabId: string
  active: boolean
}

interface ExitInfo {
  exitCode: number
  durationMs: number
}

interface ContextMenuState {
  x: number
  y: number
  hasSelection: boolean
}

/** Seçimi sistem panosuna kopyala (navigator.clipboard; yazma izni otomatik). */
function copySelection(term: Terminal): void {
  const sel = term.getSelection()
  if (!sel) return
  void navigator.clipboard.writeText(sel).catch(() => {})
}

/** Panoyu okuyup xterm'e yapıştır — tek yol preload IPC (sandbox uyumlu). */
function pasteFromClipboard(term: Terminal): void {
  void window.termflow.clipboard.readText().then((text) => {
    if (text) term.paste(text)
  })
}

/**
 * A single xterm.js instance bound to a PTY. Mounting this component creates
 * the PTY (only the active tab is mounted, so mount == PTY create), rehydrates
 * from the main-process ring buffer with live chunks queued to avoid ordering
 * races, and funnels every resize through one atomic channel: xterm view and
 * PTY move to the new size in the SAME tick, 250ms after the last change.
 */
export function TerminalView({ tabId, active }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const activeRef = useRef(active)
  // Single resize channel, populated by the main effect. Other effects call
  // through this ref so every resize goes through the same atomic path.
  const scheduleResizeRef = useRef<(() => void) | null>(null)
  /** Last cell size pushed to xterm/PTY — re-asserted after a PTY restart. */
  const lastSizeRef = useRef({ cols: 0, rows: 0 })
  const [exited, setExited] = useState<ExitInfo | null>(null)

  const profileId = useTerminalStore((s) => s.tabs.find((t) => t.id === tabId)?.profileId)
  const settings = useSettingsStore((s) => s.settings)
  const uiSearchTabId = useSettingsStore((s) => s.uiSearchTabId)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  // ---- Terminal init + PTY create (mount == create) ----
  useEffect(() => {
    const host = hostRef.current
    if (!host || !profileId) return

    const themeColors = resolveTheme(settings).colors
    const term = new Terminal({
      fontFamily: settings.fontFamily,
      fontSize: settings.fontSize,
      // Settings'te serbest string; xterm yalnızca normal/bold/100..900 kabul eder.
      fontWeight: settings.fontWeight as 'normal' | 'bold' | number,
      lineHeight: settings.lineHeight,
      cursorBlink: settings.cursorBlink,
      cursorStyle: settings.cursorStyle,
      cursorWidth: settings.cursorWidth,
      scrollback: settings.scrollback,
      // cursorColor override: '' = tema default (PRD §32).
      theme: settings.cursorColor ? { ...themeColors, cursor: settings.cursorColor } : themeColors,
      allowProposedApi: true,
      // Draw box-drawing / block glyphs procedurally instead of using the
      // font's own (often misaligned) glyphs — keeps TUI borders crisp.
      customGlyphs: true,
      // VS Code parity: tell xterm the real ConPTY build so its reflow
      // behaviour matches what the backend actually does.
      windowsPty: { backend: 'conpty', buildNumber: window.termflow.system.osBuildNumber }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon()) // URLs open in the default browser
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    searchAddons.set(tabId, searchAddon) // TerminalSearch lookup (Faz 7)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    term.open(host)
    termRef.current = term
    fitRef.current = fit

    let disposed = false
    let ready = false
    const queue: string[] = []
    lastSizeRef.current = { cols: term.cols, rows: term.rows }

    // Data stream: buffer rehydration + live chunks (queue pattern — race yok).
    const onDataHandler = (data: string): void => {
      if (ready) term.write(data)
      else queue.push(data)
    }
    dataHandlers.set(tabId, onDataHandler)

    const onExitHandler = (exitCode: number, durationMs: number): void => {
      // Sarımsı mesaj terminal içine, butonlar overlay'de (PRD §74).
      term.write(`\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m\r\n`)
      setExited({ exitCode, durationMs })
    }
    exitHandlers.set(tabId, onExitHandler)

    // First measurement: move xterm AND the PTY to the real cell size in the
    // same tick (no settle wait). The PTY spawns at a 120x30 default, and TUI
    // apps that draw their first frames at that width leave permanently-
    // wrapped garbage in the ring buffer otherwise.
    let firstMeasureDone = false
    const measureNow = (): boolean => {
      try {
        const dims = fit.proposeDimensions()
        if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return false
        const cols = Math.max(2, Math.floor(dims.cols))
        const rows = Math.max(1, Math.floor(dims.rows))
        firstMeasureDone = true
        if (cols !== term.cols || rows !== term.rows) term.resize(cols, rows)
        lastSizeRef.current = { cols, rows }
        return true
      } catch {
        return false // not laid out yet
      }
    }

    const createPty = (): void => {
      if (disposed || !profileId) return
      void window.termflow.pty
        .create(tabId, profileId, lastSizeRef.current.cols, lastSizeRef.current.rows)
        .then(() => {
          if (disposed) return
          // Re-assert the current cell size so a size change that landed while
          // the PTY was spawning is not lost (main no-ops when identical).
          window.termflow.pty.resize(tabId, lastSizeRef.current.cols, lastSizeRef.current.rows)
        void window.termflow.pty.buffer(tabId).then((data) => {
          if (disposed) return
          if (data) term.write(data)
          for (const q of queue) term.write(q)
          queue.length = 0
          ready = true
        })
      })
    }

    // A brand-new tab's flexbox box is frequently still zero-sized in this
    // tick. Retry on the very next frame instead of falling into the 250ms
    // settle debounce — that delay is what made terminals feel sluggish.
    if (!measureNow()) {
      requestAnimationFrame(() => {
        if (disposed) return
        measureNow()
        createPty()
      })
    } else {
      createPty()
    }

    // Single atomic resize channel. Every resize source (observer, activation,
    // font/theme) funnels through here. We wait for the size to settle, then
    // move the xterm view AND the PTY to the new size in the SAME tick —
    // intermediate sizes are never applied. (PRD §11.7)
    let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null
    const applyResize = (): void => {
      if (disposed) return
      const dims = fit.proposeDimensions()
      if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return
      const cols = Math.max(2, Math.floor(dims.cols))
      const rows = Math.max(1, Math.floor(dims.rows))
      firstMeasureDone = true
      if (cols === term.cols && rows === term.rows) return
      term.resize(cols, rows) // xterm view
      window.termflow.pty.resize(tabId, cols, rows) // PTY, same tick
      lastSizeRef.current = { cols, rows }
    }
    const scheduleResize = (): void => {
      if (!firstMeasureDone) {
        applyResize()
        return
      }
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
      resizeSettleTimer = setTimeout(applyResize, 250)
    }
    scheduleResizeRef.current = scheduleResize
    const ro = new ResizeObserver(() => scheduleResize())
    ro.observe(host)

    // Forward input to the PTY only while this tab is the active one.
    const dataSub = term.onData((data) => {
      if (!activeRef.current) return
      window.termflow.pty.write(tabId, data)
    })

    // PRD §23: Ctrl+Shift+C — seçim varsa kopyala ve tuşu yut; yoksa Ctrl+C
    // normal şekilde PTY'ye gitsin (no-op copy'de tuş kaybolmaz). Ctrl+Shift+V
    // paste'ı xterm kendisi ele alır — ek handler gerekmez.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && (e.key === 'C' || e.key === 'c')) {
        if (term.hasSelection()) {
          copySelection(term)
          return false
        }
      }
      return true
    })

    // Sağ tık (PRD §24): 'paste' davranışı — seçim varsa kopyala, yoksa
    // yapıştır (Windows Terminal); 'context-menu' — menüyü aç.
    const onCtxMenu = (e: MouseEvent): void => {
      e.preventDefault()
      if (useSettingsStore.getState().settings.rightClickBehavior === 'paste') {
        if (term.hasSelection()) copySelection(term)
        else pasteFromClipboard(term)
        return
      }
      setMenu({ x: e.clientX, y: e.clientY, hasSelection: term.hasSelection() })
    }
    host.addEventListener('contextmenu', onCtxMenu)

    // Visible terminals stream live; offscreen ones are paused by main.
    window.termflow.pty.setMode(tabId, 'active')

    return () => {
      disposed = true
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
      scheduleResizeRef.current = null
      ro.disconnect()
      dataSub.dispose()
      host.removeEventListener('contextmenu', onCtxMenu)
      dataHandlers.delete(tabId)
      exitHandlers.delete(tabId)
      searchAddons.delete(tabId)
      // Component unmounts when its tab is deselected -> switch main to
      // buffer-only mode so the process keeps running without streaming.
      window.termflow.pty.setMode(tabId, 'buffer')
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, profileId])

  // Focus + re-measure when this tab becomes active.
  useEffect(() => {
    if (active && termRef.current) {
      termRef.current.focus()
      scheduleResizeRef.current?.()
    }
  }, [active, tabId])

  // Keep xterm options in sync with settings changes (font, theme, cursor…).
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.fontFamily = settings.fontFamily
    term.options.fontSize = settings.fontSize
    term.options.fontWeight = settings.fontWeight as 'normal' | 'bold' | number
    term.options.lineHeight = settings.lineHeight
    term.options.cursorStyle = settings.cursorStyle
    term.options.cursorBlink = settings.cursorBlink
    term.options.cursorWidth = settings.cursorWidth
    term.options.scrollback = settings.scrollback
    const themeColors = resolveTheme(settings).colors
    term.options.theme = settings.cursorColor ? { ...themeColors, cursor: settings.cursorColor } : themeColors
    // A font/size change alters the cell metrics, so the fit result may change;
    // route it through the single atomic resize channel.
    scheduleResizeRef.current?.()
    term.refresh(0, term.rows - 1)
  }, [
    settings.fontFamily,
    settings.fontSize,
    settings.fontWeight,
    settings.lineHeight,
    settings.cursorStyle,
    settings.cursorBlink,
    settings.cursorWidth,
    settings.cursorColor,
    settings.scrollback,
    settings.themeId,
    settings.customTheme
  ])

  const handleRestart = (): void => {
    setExited(null)
    const term = termRef.current
    void window.termflow.pty.restart(tabId).then((res) => {
      if (!res) return
      term?.reset() // clear the view; fresh output streams through the handlers
      window.termflow.pty.resize(tabId, lastSizeRef.current.cols, lastSizeRef.current.rows)
    })
  }

  const handleCloseTab = (): void => {
    useTerminalStore.getState().closeTab(tabId)
  }

  // ---- Context menu actions (PRD §24) ----
  const closeMenu = (): void => setMenu(null)
  const handleCopy = (): void => {
    if (termRef.current) copySelection(termRef.current)
    closeMenu()
  }
  const handlePaste = (): void => {
    if (termRef.current) pasteFromClipboard(termRef.current)
    closeMenu()
  }
  const handleSelectAll = (): void => {
    termRef.current?.selectAll()
    closeMenu()
  }
  const handleClear = (): void => {
    termRef.current?.clear() // sadece görünüm; PTY geçmişine dokunulmaz
    closeMenu()
  }
  const handleSearch = (): void => {
    closeMenu()
    useSettingsStore.getState().openSearch(tabId)
  }
  const handleNewTab = (): void => {
    closeMenu()
    const { settings, shells } = useSettingsStore.getState()
    useTerminalStore.getState().addTab(resolveDefaultProfileId(settings, shells))
  }
  const handleSettings = (): void => {
    closeMenu()
    useSettingsStore.getState().openSettings()
  }

  return (
    <div className="terminal-view" style={{ padding: settings.terminalPadding }}>
      <div ref={hostRef} className="terminal-host" />
      {uiSearchTabId === tabId && (
        <TerminalSearch
          tabId={tabId}
          onClose={() => {
            useSettingsStore.getState().closeSearch()
            termRef.current?.focus()
          }}
        />
      )}
      {menu !== null && (
        <TerminalContextMenu
          x={menu.x}
          y={menu.y}
          hasSelection={menu.hasSelection}
          onClose={closeMenu}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onSelectAll={handleSelectAll}
          onClear={handleClear}
          onSearch={handleSearch}
          onNewTab={handleNewTab}
          onCloseTab={handleCloseTab}
          onSettings={handleSettings}
        />
      )}
      {exited !== null && (
        <div className="exit-overlay">
          <span>Process exited with code {exited.exitCode}</span>
          <div className="exit-overlay-actions">
            <button className="exit-overlay-btn" onClick={handleRestart}>
              Restart
            </button>
            <button className="exit-overlay-btn" onClick={handleCloseTab}>
              Close Tab
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

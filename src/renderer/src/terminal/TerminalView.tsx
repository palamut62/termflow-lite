import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebglAddon } from '@xterm/addon-webgl'
import { ImageAddon } from '@xterm/addon-image'
import { ligatureJoiner } from './ligatures'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { broadcastTargetIds, dataHandlers, exitHandlers, searchAddons, useTerminalStore } from '../store/terminalStore'
import { useCommandHistoryStore } from '../store/commandHistoryStore'
import { resolveTheme } from '../themes/themes'
import { formatDroppedPaths } from './dropPaths'
import { TerminalContextMenu } from './TerminalContextMenu'
import { TerminalSearch } from './TerminalSearch'
import { AgentWorkPanel } from '../components/AgentWorkPanel'

interface Props {
  tabId: string
  active: boolean
  visible?: boolean
  splitPane?: 'first' | 'second'
  splitDirection?: 'vertical' | 'horizontal' | null
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

/**
 * Bu render'da PTY'si oluşturulmuş tab id'leri. Savunma amaçlı: PtyCore.create()
 * var olan PTY'yi öldürüp yenisini spawn ettiği için (restart bunu kullanır),
 * bir TerminalView aynı tabId için ikinci kez create çağırmamalı.
 */
const createdPtys = new Set<string>()

/** Seçimi sistem panosuna kopyala (navigator.clipboard; yazma izni otomatik). */
function copySelection(term: Terminal): void {
  const sel = term.getSelection()
  if (!sel) return
  void navigator.clipboard.writeText(sel).catch(() => {})
}

/** Panoyu okuyup xterm'e yapıştır — tek yol preload IPC (sandbox uyumlu). */
function pasteFromClipboard(term: Terminal): void {
  void window.termflow.clipboard.readPaste().then(({ kind, value }) => {
    if (!value) return
    term.paste(kind === 'file' ? `"${value.replace(/"/g, '\\"')}"` : value)
  })
}

/**
 * A single xterm.js instance bound to a PTY. Mounting this component creates
 * the PTY (every tab stays mounted for its lifetime, so mount == PTY create
 * exactly once — sekme değiştirmek arka plandaki process'i öldürmez), rehydrates
 * from the main-process ring buffer with live chunks queued to avoid ordering
 * races, and funnels every resize through one atomic channel: xterm view and
 * PTY move to the new size in the SAME tick, 250ms after the last change.
 */
export function TerminalView({ tabId, active, visible = active, splitPane, splitDirection }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  // Canlı yüklenip atılabilen addon'lar/joiner: ayar değişimi terminali
  // yeniden yaratmasın diye ref'te tutulur.
  const webglRef = useRef<WebglAddon | null>(null)
  const imageRef = useRef<ImageAddon | null>(null)
  const joinerRef = useRef<number | null>(null)
  const activeRef = useRef(active)
  // Single resize channel, populated by the main effect. Other effects call
  // through this ref so every resize goes through the same atomic path.
  const scheduleResizeRef = useRef<(() => void) | null>(null)
  /** Last cell size pushed to xterm/PTY — re-asserted after a PTY restart. */
  const lastSizeRef = useRef({ cols: 0, rows: 0 })
  const [exited, setExited] = useState<ExitInfo | null>(null)

  const profileId = useTerminalStore((s) => s.tabs.find((t) => t.id === tabId)?.profileId)
  const resumeSession = useTerminalStore((s) => s.tabs.find((t) => t.id === tabId)?.resumeSession)
  const launchCwd = useTerminalStore((s) => s.tabs.find((t) => t.id === tabId)?.launchCwd)
  const settings = useSettingsStore((s) => s.settings)
  const uiSearchTabId = useSettingsStore((s) => s.uiSearchTabId)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  useEffect(() => {
    activeRef.current = active
  }, [active])

  /**
   * WebGL renderer: 'off' hiç denemez. Yükleme başarısızsa (context yok, sürücü
   * sorunu) sessizce DOM renderer'da kalınır; context kaybında addon dispose
   * edilir ve xterm kendiliğinden DOM renderer'a döner.
   */
  const syncWebgl = (term: Terminal, mode: 'auto' | 'on' | 'off'): void => {
    if (mode === 'off') {
      webglRef.current?.dispose()
      webglRef.current = null
      return
    }
    if (webglRef.current) return
    try {
      const addon = new WebglAddon()
      addon.onContextLoss(() => {
        addon.dispose()
        if (webglRef.current === addon) webglRef.current = null
      })
      term.loadAddon(addon)
      webglRef.current = addon
    } catch {
      webglRef.current = null
    }
  }

  /** Sixel / iTerm2 satır içi görseller. */
  const syncImage = (term: Terminal, enabled: boolean): void => {
    if (!enabled) {
      imageRef.current?.dispose()
      imageRef.current = null
      return
    }
    if (imageRef.current) return
    try {
      const addon = new ImageAddon()
      term.loadAddon(addon)
      imageRef.current = addon
    } catch {
      imageRef.current = null
    }
  }

  /** Ligature'lar xterm'in character joiner API'siyle çizilir (bkz. ligatures.ts). */
  const syncLigatures = (term: Terminal, enabled: boolean): void => {
    if (enabled) {
      if (joinerRef.current === null) joinerRef.current = term.registerCharacterJoiner(ligatureJoiner)
    } else if (joinerRef.current !== null) {
      term.deregisterCharacterJoiner(joinerRef.current)
      joinerRef.current = null
    }
  }

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
      letterSpacing: settings.letterSpacing,
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
    // WebGL/image addon'ları yalnızca open() sonrası yüklenebilir.
    syncWebgl(term, settings.gpuAcceleration)
    syncImage(term, settings.imageSupport)
    syncLigatures(term, settings.fontLigatures)
    termRef.current = term
    fitRef.current = fit

    let disposed = false
    let ready = false
    const queue: string[] = []
    let recentOutput = ''
    let inputBuffer = ''
    let capturingCommand = false
    lastSizeRef.current = { cols: term.cols, rows: term.rows }

    // Data stream: buffer rehydration + live chunks (queue pattern — race yok).
    const onDataHandler = (data: string): void => {
      if (ready) term.write(data)
      else queue.push(data)
      recentOutput = (recentOutput + data).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').slice(-256)
      const activity = !activeRef.current
        ? 'unread'
        : /(?:[A-Za-z]:\\[^\r\n]*>|[$#>❯])\s*$/.test(recentOutput)
          ? 'waiting'
          : 'running'
      useTerminalStore.getState().setTabActivity(tabId, activity)
    }
    dataHandlers.set(tabId, onDataHandler)

    const onExitHandler = (exitCode: number, durationMs: number): void => {
      // Sarımsı mesaj terminal içine, butonlar overlay'de (PRD §74).
      term.write(`\r\n\x1b[33mProcess exited with code ${exitCode}\x1b[0m\r\n`)
      setExited({ exitCode, durationMs })
      useTerminalStore.getState().setTabActivity(tabId, exitCode === 0 ? 'completed' : 'error')
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
      if (createdPtys.has(tabId)) {
        // PTY zaten yaşıyor (ör. StrictMode remount) — öldürüp yeniden
        // spawn etmek yerine sadece buffer'dan rehydrate et.
        window.termflow.pty.resize(tabId, lastSizeRef.current.cols, lastSizeRef.current.rows)
        void window.termflow.pty.buffer(tabId).then((data) => {
          if (disposed) return
          if (data) term.write(data)
          for (const q of queue) term.write(q)
          queue.length = 0
          ready = true
        })
        return
      }
      createdPtys.add(tabId)
      void window.termflow.pty
        .create(tabId, profileId, lastSizeRef.current.cols, lastSizeRef.current.rows, launchCwd, resumeSession)
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

    // Register terminal-generated input BEFORE spawning the PTY. TUI programs
    // such as Codex query OSC 10/11 immediately at startup to discover the
    // terminal foreground/background. xterm answers those queries through
    // onData; if this bridge is attached after spawn, the answer is lost and
    // Codex falls back to its dark composer palette even on a light theme.
    const dataSub = term.onData((data) => {
      // Protocol replies (OSC/CSI, always ESC-prefixed) must reach background
      // PTYs too; only human keyboard input is restricted to the active tab.
      if (!activeRef.current && !data.startsWith('\x1b')) return
      const tab = useTerminalStore.getState().tabs.find((item) => item.id === tabId)
      const cursorLine = term.buffer.active.getLine(term.buffer.active.cursorY)?.translateToString(true) ?? ''
      const sensitivePrompt = /(?:password|passphrase|token|secret|api[_ -]?key)[^\r\n]*:\s*$/i.test(cursorLine)
      if (!capturingCommand && !sensitivePrompt && !data.startsWith('\x1b')) capturingCommand = true
      if (capturingCommand) {
        if (data === '\x03' || data.startsWith('\x1b')) {
          inputBuffer = ''
          capturingCommand = false
        }
        for (const char of capturingCommand ? data : '') {
          if (char === '\r' || char === '\n') {
            const command = inputBuffer.trim()
            if (command && tab) {
              useCommandHistoryStore.getState().add({
                command,
                cwd: tab.cwd || tab.launchCwd || '',
                profileId: tab.profileId,
                profileName: tab.title
              })
            }
            inputBuffer = ''
            capturingCommand = false
          } else if (char === '\x7f' || char === '\b') {
            inputBuffer = inputBuffer.slice(0, -1)
          } else if (char >= ' ' && char !== '\x7f') {
            inputBuffer += char
          }
        }
      }
      useTerminalStore.getState().setTabActivity(tabId, 'running')
      // Broadcast: yalnızca insan girdisi (ESC ile başlamayan) split'teki tüm
      // panellere gider; protokol yanıtları hep kendi PTY'sinde kalır. Komut
      // geçmişine kayıt yukarıda yalnızca bir kez (aktif tab) düşer.
      const { splitTabIds, broadcastInput } = useTerminalStore.getState()
      const targets = data.startsWith('\x1b')
        ? [tabId]
        : broadcastTargetIds(tabId, splitTabIds, broadcastInput && activeRef.current)
      for (const target of targets) window.termflow.pty.write(target, data)
    })

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

    // Ctrl+C / Ctrl+Shift+C: seçim varsa kopyala; seçim yoksa Ctrl+C normal
    // şekilde PTY'ye gider. Ctrl+V / Ctrl+Shift+V preload üzerinden yapıştırır.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.key === 'C' || e.key === 'c') {
          if (term.hasSelection()) {
            copySelection(term)
            return false
          }
        } else if (e.key === 'V' || e.key === 'v') {
          pasteFromClipboard(term)
          return false
        }
      }
      return true
    })

    // PRD: copyOnSelect — ayar açıkken seçim biter bitmez panoya kopyala.
    // Ayar getState() ile okunur ki değişiklik terminali yeniden yaratmasın.
    const selSub = term.onSelectionChange(() => {
      if (!useSettingsStore.getState().settings.copyOnSelect) return
      if (!term.hasSelection()) return
      copySelection(term)
    })

    // PRD: bell — ayar açıkken kısa görsel flash (ek dependency yok).
    let bellTimer: ReturnType<typeof setTimeout> | null = null
    const bellSub = term.onBell(() => {
      useTerminalStore.getState().setTabActivity(tabId, activeRef.current ? 'waiting' : 'unread')
      if (!useSettingsStore.getState().settings.bell) return
      host.classList.remove('bell-flash')
      // reflow: aynı sınıfın animasyonu üst üste gelen bell'lerde de yeniden başlasın
      void host.offsetWidth
      host.classList.add('bell-flash')
      if (bellTimer) clearTimeout(bellTimer)
      bellTimer = setTimeout(() => host.classList.remove('bell-flash'), 150)
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

    // Visible terminals stream live; offscreen ones are throttled by main.
    // (Gerçek mod aşağıdaki `active` effect'i tarafından yönetilir.)
    window.termflow.pty.setMode(tabId, activeRef.current ? 'active' : 'passive')

    return () => {
      disposed = true
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
      if (bellTimer) clearTimeout(bellTimer)
      scheduleResizeRef.current = null
      ro.disconnect()
      dataSub.dispose()
      selSub.dispose()
      bellSub.dispose()
      host.removeEventListener('contextmenu', onCtxMenu)
      // Bu view'lar tabId ile anahtarlanır; unmount yalnızca kendi kaydını siler.
      dataHandlers.delete(tabId)
      exitHandlers.delete(tabId)
      searchAddons.delete(tabId)
      // Unmount artık yalnızca tab kapanınca olur; tab kapanışı zaten pty.kill
      // çağırdığı için ayrıca bir mod değişikliğine gerek yok. createdPtys'ten
      // silmiyoruz: tab id'leri benzersiz, ve StrictMode'un unmount/remount
      // döngüsünde PTY'nin yeniden spawn edilmesini de böylece engelliyoruz.
      webglRef.current?.dispose()
      webglRef.current = null
      imageRef.current?.dispose()
      imageRef.current = null
      joinerRef.current = null
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, profileId, launchCwd, resumeSession])

  // Focus + re-measure when this tab becomes active. Tüm tab'lar mount kaldığı
  // için render modunu da burada güncelliyoruz: aktif olan canlı stream alır,
  // diğerleri passive (process çalışmaya devam eder).
  useEffect(() => {
    window.termflow.pty.setMode(tabId, active ? 'active' : 'passive')
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
    // xterm letterSpacing'i (px) native olarak destekler; hücre metriğini
    // değiştirdiği için aşağıdaki resize kanalı yeniden fit edecek.
    term.options.letterSpacing = settings.letterSpacing
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
    settings.letterSpacing,
    settings.scrollback,
    settings.themeId,
    settings.customTheme
  ])

  // GPU / inline image / ligature ayarları terminali yeniden yaratmadan,
  // yalnızca ilgili addon'ı yükleyip atarak uygulanır.
  useEffect(() => {
    const term = termRef.current
    if (term) syncWebgl(term, settings.gpuAcceleration)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.gpuAcceleration])

  useEffect(() => {
    const term = termRef.current
    if (term) syncImage(term, settings.imageSupport)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.imageSupport])

  useEffect(() => {
    const term = termRef.current
    if (!term) return
    syncLigatures(term, settings.fontLigatures)
    term.refresh(0, term.rows - 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.fontLigatures])

  const handleRestart = (): void => {
    setExited(null)
    const term = termRef.current
    void window.termflow.pty.restart(tabId).then((res) => {
      if (!res) return
      useTerminalStore.getState().setTabActivity(tabId, 'running')
      term?.reset() // clear the view; fresh output streams through the handlers
      window.termflow.pty.resize(tabId, lastSizeRef.current.cols, lastSizeRef.current.rows)
    })
  }

  const handleChangeCwd = async (cwd: string): Promise<boolean> => {
    try {
      const result = await window.termflow.pty.restartAt(tabId, cwd)
      if (!result) return false
      setExited(null)
      termRef.current?.reset()
      useTerminalStore.getState().setTabWorkingDirectory(tabId, cwd)
      useTerminalStore.getState().setTabActivity(tabId, 'running')
      window.termflow.pty.resize(tabId, lastSizeRef.current.cols, lastSizeRef.current.rows)
      termRef.current?.focus()
      return true
    } catch {
      return false
    }
  }

  const handleCloseTab = (): void => {
    useTerminalStore.getState().requestCloseTab(tabId)
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

  // ---- Dosya sürükle-bırak: yalnızca yolu input'a yaz (Enter'a BASILMAZ) ----
  // Yalnızca gerçek dosya taşıyan sürüklemeler kabul edilir; metin/URL
  // sürüklemeleri tarayıcının varsayılan davranışına bırakılır.
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    const paths = formatDroppedPaths(
      Array.from(e.dataTransfer.files),
      window.termflow.system.getPathForFile
    )
    if (!paths) return
    // Yazma yalnızca bu view'ın kendi tab id'sine gider.
    window.termflow.pty.write(tabId, paths)
    termRef.current?.focus()
  }

  return (
    <div
      className={`terminal-view${visible ? '' : ' inactive'}${splitPane ? ` split-pane split-pane-${splitPane} split-${splitDirection}` : ''}${active ? ' split-pane-active' : ''}`}
      style={{ padding: settings.terminalPadding }}
      onMouseDown={() => {
        if (visible && !active) useTerminalStore.getState().setActiveTab(tabId)
      }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={hostRef} className="terminal-host" />
      <AgentWorkPanel tabId={tabId} onChangeCwd={handleChangeCwd} />
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

import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { Terminal, type IDecoration, type ILink } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { registerWriter } from '../terminalRegistry'
import { pulseActivity } from '../terminalActivity'
import { reportTerminalSize } from '../terminalStartup'
import { useAppStore } from '../store/appStore'
import { captureCommandInput } from '../commandHistory'
import { getTheme } from '../themes'
import { getLeafTerminalIds } from '../paneUtils'
import { isPrefixEvent } from '../prefixKeys'
import { applyMotion, clampPos, resolveCopyModeKey, selectionRange, type CopyBuffer, type CopyPos } from '../copyMode'
import {
  OSC_SEMANTIC_PROMPT,
  OSC_VSCODE,
  ShellIntegrationTracker,
  registerCommandOutputReader,
  commandBlocksOf,
  notifyCommandBlocksChanged,
  type CommandRecord
} from '../shellIntegration'
import { notifyLongCommandDone } from '../store/notifications'
import { findPathMatches, resolvePath } from '../filePathLinks'

// Existence answers for path candidates seen in output. Terminal scrollback
// re-renders the same lines constantly, so without this every repaint would
// fire an IPC round-trip per candidate.
const pathExistsCache = new Map<string, boolean>()
const PATH_CACHE_MAX = 500
function cacheExists(path: string, exists: boolean): void {
  if (pathExistsCache.size >= PATH_CACHE_MAX) pathExistsCache.clear()
  pathExistsCache.set(path, exists)
}

// Short two-tone chime for the terminal bell (\x07). Web Audio, no asset —
// throttled so a burst of BELs doesn't stack into noise.
let lastBellAt = 0
function playBell(): void {
  const now = Date.now()
  if (now - lastBellAt < 400) return
  lastBellAt = now
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28)
    gain.connect(ctx.destination)
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.setValueAtTime(1174, ctx.currentTime + 0.12)
    osc.connect(gain)
    osc.start()
    osc.stop(ctx.currentTime + 0.3)
    osc.onended = () => void ctx.close()
  } catch { /* audio unavailable */ }
}

interface Props {
  terminalId: string
  active: boolean
}

/**
 * Render paths as ONE line, space separated, so several files land next to each
 * other on the current prompt instead of stacking. Quotes are added only when a
 * path actually needs them — JSON.stringify would also double every Windows
 * backslash, which cmd/PowerShell take literally.
 */
function formatPaths(paths: string[]): string {
  return paths
    .filter(Boolean)
    .map((path) => path.replace(/[\r\n]+/g, ' ').trim())
    .map((path) => (/[\s"'`$&|<>^()]/.test(path) ? `"${path.replace(/"/g, '\\"')}"` : path))
    .join(' ')
}

function formatDroppedPaths(files: FileList): string {
  return formatPaths(Array.from(files).map((file) => window.termflow.system.getPathForFile(file)))
}

/**
 * Scan the terminal buffer for lines matching any active highlight rule and
 * register decorations on them. All previous decorations are disposed first so
 * the view stays in sync with the current rule set. (P1-8)
 */
function applyHighlights(
  term: Terminal,
  rules: { pattern: string; flags: string; color: string }[],
  decorsRef: { current: IDecoration[] }
): void {
  for (const d of decorsRef.current) {
    try { d.dispose() } catch { /* already disposed */ }
  }
  decorsRef.current = []
  if (!rules.length) return

  const buffer = term.buffer.active
  const startRow = Math.max(0, buffer.length - 500)
  for (let row = startRow; row < buffer.length; row++) {
    const line = buffer.getLine(row)
    if (!line) continue
    const text = line.translateToString()
    for (const rule of rules) {
      try {
        const re = new RegExp(rule.pattern, rule.flags)
        if (re.test(text)) {
          // Marker offset: 0 = cursor line, negative values go back in history
          const marker = term.registerMarker(-(buffer.length - 1 - row))
          const deco = term.registerDecoration({
            marker,
            backgroundColor: rule.color,
            width: term.cols
          })
          if (deco) decorsRef.current.push(deco)
          break // only the first matching rule per line
        }
      } catch {
        // invalid regex in the rule — skip silently
      }
    }
  }
}

/** How many exit-code decorations are kept alive per terminal. */
const MAX_COMMAND_MARKS = 200

/** Read the text of a finished command's output straight from the xterm buffer. */
function commandOutputText(term: Terminal, record: CommandRecord): string | null {
  const first = record.startLine
  // The `D` sequence lands on the next prompt line, so the output stops before it.
  const last = (record.endLine >= 0 ? record.endLine : term.buffer.active.length) - 1
  if (first < 0 || last < first) return null
  const buffer = term.buffer.active
  const lines: string[] = []
  for (let row = first; row <= Math.min(last, buffer.length - 1); row++) {
    lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  const text = lines.join('\n')
  return text.trim() ? text : null
}

/** Read-only view of the live xterm buffer for the pure copy-mode motions. */
function bufferView(term: Terminal): CopyBuffer {
  const buf = term.buffer.active
  return {
    lineCount: Math.max(1, buf.length),
    lineText: (row) => buf.getLine(row)?.translateToString(true) ?? ''
  }
}

/**
 * Paint the copy-mode cursor / selection and keep the cursor on screen.
 * xterm has no independent "copy cursor", so the cursor is drawn as a
 * one-cell selection; a real selection replaces it once an anchor is set.
 */
function paintCopyView(term: Terminal, cursor: CopyPos, anchor: CopyPos | null): void {
  if (anchor) {
    const [start, end] = selectionRange(anchor, cursor)
    // `select()` cannot span rows, so multi-row selections fall back to
    // whole-line selection (tmux line-wise copy).
    if (start.row === end.row) term.select(start.col, start.row, end.col - start.col + 1)
    else term.selectLines(start.row, end.row)
  } else {
    term.select(cursor.col, cursor.row, 1)
  }
  const top = term.buffer.active.viewportY
  const bottom = top + term.rows - 1
  if (cursor.row < top) term.scrollLines(cursor.row - top)
  else if (cursor.row > bottom) term.scrollLines(cursor.row - bottom)
}

/**
 * A single xterm.js instance bound to a PTY. Handles input forwarding (only
 * while active — PRD FR-012), buffer rehydration on mount with live chunks
 * queued to avoid ordering races, WebGL rendering when enabled, and debounced
 * fit/resize -> node-pty resize. Render mode is pushed to main so passive
 * terminals stream at a throttled cadence. (PRD §10.4, §11, §12)
 */
export default function TerminalView({ terminalId, active }: Props): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const activeRef = useRef(active)
  const scrollback = useAppStore((s) => s.settings.scrollback)
  const fontFamily = useAppStore((s) => s.settings.fontFamily)
  const fontSize = useAppStore((s) => s.settings.fontSize)
  const lineHeight = useAppStore((s) => s.settings.lineHeight)
  const cursorStyle = useAppStore((s) => s.settings.cursorStyle)
  const cursorBlink = useAppStore((s) => s.settings.cursorBlink)
  const terminalThemeName = useAppStore((s) => s.settings.terminalTheme)
  const appTheme = useAppStore((s) => s.settings.theme)
  const transparency = useAppStore((s) => s.settings.transparency)
  const highlightRules = useAppStore((s) => s.highlightRules)

  const copyMode = useAppStore((s) => s.copyModePaneId === terminalId)

  const [attachHover, setAttachHover] = useState(false)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false)
  const [searchRegex, setSearchRegex] = useState(false)
  const searchBackwardRef = useRef(false)
  const searchAddonRef = useRef<SearchAddon | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const existingDecorsRef = useRef<IDecoration[]>([])
  const lastTotalRef = useRef(0)
  const lastPtySizeRef = useRef({ cols: 0, rows: 0 })
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Shell integration (OSC 133/633). Populated only when the opt-in setting is
  // on; jumping between prompts goes through this ref so the key handler that
  // xterm holds stays stable.
  const jumpToCommandRef = useRef<((step: -1 | 1) => void) | null>(null)
  // Single resize channel, populated by the main effect. Other effects call
  // through this ref so every resize goes through the same atomic path.
  const scheduleResizeRef = useRef<(() => void) | null>(null)

  const scheduleHighlights = (term: Terminal): void => {
    if (highlightTimerRef.current) return
    highlightTimerRef.current = setTimeout(() => {
      highlightTimerRef.current = null
      const rules = useAppStore.getState().highlightRules
      if (rules.length) applyHighlights(term, rules, existingDecorsRef)
    }, 500)
  }

  useEffect(() => {
    activeRef.current = active
  }, [active])

  // ---- Copy mode (tmux `prefix [`) ----
  // Cursor/anchor live in refs: they change per keystroke and must not
  // re-render the terminal host.
  const copyCursorRef = useRef<CopyPos>({ row: 0, col: 0 })
  const copyAnchorRef = useRef<CopyPos | null>(null)
  const handleCopyKeyRef = useRef<((e: KeyboardEvent) => void) | null>(null)

  const runSearch = useCallback(
    (backward: boolean, query: string) => {
      if (!query) return
      const opts = {
        caseSensitive: searchCaseSensitive,
        regex: searchRegex,
        decorations: {
          matchBackground: '#2f80ff44',
          matchOverviewRuler: '#2f80ff',
          activeMatchBackground: '#2f80ff88',
          activeMatchColorOverviewRuler: '#2f80ff'
        }
      }
      const addon = searchAddonRef.current
      if (backward) addon?.findPrevious(query, opts)
      else addon?.findNext(query, opts)
    },
    [searchCaseSensitive, searchRegex]
  )

  const exitCopyMode = useCallback(() => {
    const term = termRef.current
    copyAnchorRef.current = null
    term?.clearSelection()
    term?.scrollToBottom()
    useAppStore.getState().setCopyModePane(null)
    term?.focus()
  }, [])

  const handleCopyKey = useCallback(
    (event: KeyboardEvent) => {
      const term = termRef.current
      if (!term) return
      const cmd = resolveCopyModeKey(event)
      if (!cmd) return
      event.preventDefault()
      const buf = bufferView(term)

      switch (cmd.type) {
        case 'move':
          copyCursorRef.current = applyMotion(buf, copyCursorRef.current, cmd.motion)
          break
        case 'scroll': {
          const half = Math.max(1, Math.floor(term.rows / 2))
          const delta =
            cmd.amount === 'halfUp' ? -half : cmd.amount === 'halfDown' ? half : cmd.amount === 'pageUp' ? -term.rows : term.rows
          copyCursorRef.current = clampPos(buf, {
            row: copyCursorRef.current.row + delta,
            col: copyCursorRef.current.col
          })
          break
        }
        case 'beginSelection':
          copyAnchorRef.current = { ...copyCursorRef.current }
          break
        case 'copySelection': {
          if (copyAnchorRef.current) {
            const text = term.getSelection()
            if (text) void navigator.clipboard.writeText(text)
          }
          exitCopyMode()
          return
        }
        case 'cancel':
          // Escape drops the selection first, and only then copy mode itself.
          if (copyAnchorRef.current) {
            copyAnchorRef.current = null
            break
          }
          exitCopyMode()
          return
        case 'exit':
          exitCopyMode()
          return
        case 'search':
          searchBackwardRef.current = cmd.direction === 'backward'
          setSearchVisible(true)
          return
        case 'findNext':
          runSearch(searchBackwardRef.current, searchQuery)
          return
        case 'findPrevious':
          runSearch(!searchBackwardRef.current, searchQuery)
          return
      }

      paintCopyView(term, copyCursorRef.current, copyAnchorRef.current)
    },
    [exitCopyMode, runSearch, searchQuery]
  )

  useEffect(() => {
    handleCopyKeyRef.current = handleCopyKey
  }, [handleCopyKey])

  // Entering copy mode snaps to the live cursor at the bottom of the buffer;
  // leaving it clears the painted selection.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    if (copyMode) {
      term.scrollToBottom()
      const buf = term.buffer.active
      copyAnchorRef.current = null
      copyCursorRef.current = clampPos(bufferView(term), { row: buf.baseY + buf.cursorY, col: buf.cursorX })
      paintCopyView(term, copyCursorRef.current, null)
      term.focus()
    } else {
      copyAnchorRef.current = null
      term.clearSelection()
    }
  }, [copyMode])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      fontFamily,
      fontSize,
      lineHeight,
      cursorBlink,
      cursorStyle,
      scrollback,
      theme: getTheme(terminalThemeName).theme,
      allowProposedApi: true,
      // Draw box-drawing / block / Powerline glyphs procedurally instead of
      // using the font's own (often misaligned) glyphs. This is xterm 6's
      // default; stated explicitly so TUI borders stay crisp and gap-free.
      customGlyphs: true,
      // VS Code parity: tell xterm the real ConPTY build so its reflow
      // behaviour matches what the backend actually does. On modern builds
      // (>= 21376) ConPTY forwards wrapped-line state and xterm's reflow is
      // correct; lying about the build (or omitting it) causes the mangled /
      // clipped TUI output seen with claude & co.
      windowsPty: { backend: 'conpty', buildNumber: window.termflow.system.osBuildNumber }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    // File paths in output become links that open the configured editor at the
    // reported line. URLs stay with WebLinksAddon.
    const pathLinks = term.registerLinkProvider({
      provideLinks: (bufferLineNumber, callback) => {
        const buf = term.buffer.active
        const raw = buf.getLine(buf.viewportY + bufferLineNumber - 1)?.translateToString(true)
        if (!raw) {
          callback(undefined)
          return
        }
        const matches = findPathMatches(raw)
        if (matches.length === 0) {
          callback(undefined)
          return
        }
        const cwd = useAppStore.getState().terminals[terminalId]?.cwd ?? ''
        void (async () => {
          const links: ILink[] = []
          for (const m of matches) {
            const resolved = resolvePath(cwd, m.path)
            let exists = pathExistsCache.get(resolved)
            if (exists === undefined) {
              exists = await window.termflow.dialog.checkFile(resolved)
              cacheExists(resolved, exists)
            }
            if (!exists) continue
            links.push({
              text: m.text,
              range: {
                start: { x: m.start + 1, y: bufferLineNumber },
                end: { x: m.end, y: bufferLineNumber }
              },
              activate: () => void window.termflow.editor.open(resolved, m.line, m.col)
            })
          }
          if (disposed) return
          callback(links.length > 0 ? links : undefined)
        })()
      }
    })
    const searchAddon = new SearchAddon()
    term.loadAddon(searchAddon)
    term.loadAddon(new Unicode11Addon())
    term.unicode.activeVersion = '11'
    searchAddonRef.current = searchAddon
    term.open(host)
    // tmux prefix capture: the prefix combo itself, and every key typed while
    // the prefix is pending, belong to the app — xterm must not consume them.
    // (Ctrl+A twice still reaches the shell: App sends the raw byte itself.)
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true
      // Ctrl+Alt+Up/Down: jump between command prompts. Deliberately NOT
      // prefix + n/p — those are already bound to window navigation.
      if (event.ctrlKey && event.altKey && !event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        if (jumpToCommandRef.current) {
          event.preventDefault()
          jumpToCommandRef.current(event.key === 'ArrowUp' ? -1 : 1)
          return false
        }
      }
      const st = useAppStore.getState()
      // Copy mode swallows every key: nothing reaches the PTY, and its own
      // bindings (Ctrl+B page-up included) beat the prefix.
      if (st.copyModePaneId === terminalId) {
        handleCopyKeyRef.current?.(event)
        return false
      }
      if (st.prefixPending) return false
      return !isPrefixEvent(event, st.settings.prefixKey)
    })
    // Keep the DOM renderer for resize correctness. The WebGL add-on leaves
    // stale atlas tiles/canvas geometry on some Windows GPUs after narrow/wide
    // layout changes, corrupting full-screen TUI borders and glyphs.
    termRef.current = term
    fitRef.current = fit

    // ---- Shell integration (OSC 133 / VS Code OSC 633), opt-in ----
    // The handlers are pure bookkeeping (no writes, no layout reads on the hot
    // path), so the 16ms batching / passive throttling path is untouched. When
    // the setting is off nothing is registered at all.
    const shellIntegrationSubs: { dispose: () => void }[] = []
    const commandMarks: IDecoration[] = []
    if (useAppStore.getState().settings.shellIntegration) {
      const tracker = new ShellIntegrationTracker()

      const markCommand = (record: CommandRecord): void => {
        const buffer = term.buffer.active
        const cursorLine = buffer.baseY + buffer.cursorY
        const line = record.startLine >= 0 ? record.startLine : record.promptLine
        const offset = line - cursorLine
        if (offset > 0 || cursorLine - line > term.buffer.active.length) return
        const marker = term.registerMarker(offset)
        if (!marker) return
        const failed = record.exitCode !== undefined && record.exitCode !== 0
        const deco = term.registerDecoration({ marker, x: 0, width: 1, layer: 'top' })
        if (!deco) return
        deco.onRender((el) => {
          el.classList.add('tf-cmd-mark', failed ? 'tf-cmd-mark-fail' : 'tf-cmd-mark-ok')
          const seconds = record.durationMs !== undefined ? ` · ${(record.durationMs / 1000).toFixed(1)}s` : ''
          el.title = `${record.commandText ?? 'command'} — exit ${record.exitCode ?? '?'}${seconds}`
        })
        commandMarks.push(deco)
        while (commandMarks.length > MAX_COMMAND_MARKS) {
          try { commandMarks.shift()?.dispose() } catch { /* already disposed */ }
        }
      }

      const handleOsc = (code: number) => (payload: string): boolean => {
        const buffer = term.buffer.active
        const event = tracker.handle(code, payload, buffer.baseY + buffer.cursorY)
        if (event?.type === 'commandFinish') {
          markCommand(event.record)
          // Only on a real command boundary — the blocks panel must never be a
          // cost on the output hot path.
          notifyCommandBlocksChanged(terminalId)
          // Real command boundaries replace the old process-exit heuristic for
          // the "long command finished" notification.
          const settings = useAppStore.getState().settings
          const duration = event.record.durationMs ?? 0
          if (duration >= settings.longCommandThresholdMs) {
            const name = useAppStore.getState().terminals[terminalId]?.name ?? 'Terminal'
            notifyLongCommandDone(terminalId, event.record.commandText ?? name, event.record.exitCode ?? 0, duration)
          }
        }
        return true // consumed: never let the payload reach the screen
      }

      shellIntegrationSubs.push(term.parser.registerOscHandler(OSC_SEMANTIC_PROMPT, handleOsc(OSC_SEMANTIC_PROMPT)))
      shellIntegrationSubs.push(term.parser.registerOscHandler(OSC_VSCODE, handleOsc(OSC_VSCODE)))

      jumpToCommandRef.current = (step) => {
        const lines = tracker.commands.map((c) => c.promptLine).filter((l) => l >= 0)
        if (!lines.length) return
        const viewport = term.buffer.active.viewportY
        const target =
          step < 0
            ? [...lines].reverse().find((l) => l < viewport) ?? lines[0]
            : lines.find((l) => l > viewport) ?? lines[lines.length - 1]
        term.scrollToLine(Math.max(0, target))
      }

      shellIntegrationSubs.push({
        dispose: registerCommandOutputReader(terminalId, {
          lastOutput: () => {
            const record = tracker.lastFinished()
            return record ? commandOutputText(term, record) : null
          },
          blocks: () => commandBlocksOf(tracker.commands),
          outputFor: (blockId) => {
            const record = tracker.commands.find((c) => c.id === blockId)
            return record ? commandOutputText(term, record) : null
          },
          scrollToBlock: (blockId) => {
            const record = tracker.commands.find((c) => c.id === blockId)
            if (record && record.promptLine >= 0) term.scrollToLine(Math.max(0, record.promptLine))
          }
        })
      })
    }

    // First measurement: move xterm AND the PTY to the real cell size in the
    // same tick (no settle wait). The PTY spawns at a 120x30 default, and TUI
    // apps that draw their first frames at that width leave permanently-
    // wrapped garbage in the ring buffer otherwise.
    //
    // The measurement is also reported to terminalStartup, so a pane that is
    // still waiting for its PTY can have it spawned at exactly this size — then
    // the pty.resize below is a no-op on the main side and ConPTY never rewraps.
    let disposed = false
    let firstMeasureDone = false
    const measureNow = (): boolean => {
      try {
        const dims = fit.proposeDimensions()
        if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return false
        const cols = Math.max(2, Math.floor(dims.cols))
        const rows = Math.max(1, Math.floor(dims.rows))
        firstMeasureDone = true
        reportTerminalSize(terminalId, cols, rows)
        if (cols !== term.cols || rows !== term.rows) term.resize(cols, rows)
        window.termflow.pty.resize(terminalId, cols, rows)
        lastPtySizeRef.current = { cols, rows }
        return true
      } catch {
        return false // not laid out yet
      }
    }
    // A brand-new pane's flexbox box is frequently still zero-sized in this
    // tick. Retry on the very next frame instead of falling into the 250ms
    // settle debounce — that delay is what made `claude` panes feel sluggish.
    if (!measureNow()) {
      requestAnimationFrame(() => {
        if (!disposed && !firstMeasureDone) measureNow()
      })
    }

    // Rehydrate from the main-process ring buffer, queueing any live chunks that
    // arrive before the buffer is applied so output never interleaves. (Bug #3)
    let ready = false
    const queue: string[] = []
    const unregister = registerWriter(terminalId, (data) => {
      // Output arriving means the agent/shell in this pane is actively doing
      // something — feed the activity badge regardless of the buffer-ready gate.
      pulseActivity(terminalId)
      if (ready) {
        term.write(data, () => {
          lastTotalRef.current += data.length
          scheduleHighlights(term)
        })
      } else {
        queue.push(data)
      }
    })
    window.termflow.pty.bufferInfo(terminalId).then(({ data, total }) => {
      if (disposed) return
      if (data) term.write(data)
      lastTotalRef.current = total
      for (const q of queue) {
        lastTotalRef.current += q.length
        term.write(q)
      }
      queue.length = 0
      ready = true
      scheduleHighlights(term)
    })
    // Forward input to the PTY only when this terminal is the active one.
    const dataSub = term.onData((data) => {
      if (!activeRef.current) return
      const state = useAppStore.getState()
      if (state.activeWorkspaceId) captureCommandInput(state.activeWorkspaceId, terminalId, state.terminals[terminalId]?.cwd ?? '', data)
      window.termflow.pty.write(terminalId, data)
      // Broadcast keystrokes to all members of the broadcast group (P0-4)
      const st = useAppStore.getState()
      if (st.broadcastEnabled && st.broadcastGroup.includes(terminalId)) {
        for (const tid of st.broadcastGroup) {
          if (tid !== terminalId) window.termflow.pty.write(tid, data)
        }
      }
    })
    // Terminal bell: claude/codex ring \x07 when a task finishes — play the
    // chime if enabled in Settings. (user request)
    const bellSub = term.onBell(() => {
      if (useAppStore.getState().settings.terminalBell) playBell()
    })
    // Ctrl+F toggles the inline search bar overlay.
    const keySub = term.onKey(({ domEvent }) => {
      if (domEvent.ctrlKey && domEvent.key === 'f') {
        domEvent.preventDefault()
        setSearchVisible((v) => !v)
      }
    })

    // Every visible terminal stays live. Selection controls keyboard input only;
    // it must not throttle or pause output from background terminals.
    window.termflow.pty.setMode(terminalId, 'active')

    // Single atomic resize channel. Every resize source (observer, activation,
    // font/theme) funnels through here. We wait for the size to settle, then
    // move the xterm view AND the PTY to the new size in the SAME tick —
    // intermediate sizes are never applied. This closes the window where xterm
    // refits instantly while the PTY lags behind, which drew TUI frames at the
    // wrong width. Every ConPTY resize also rewraps its buffer lossily, so one
    // settled resize = one rewrap (no mangled banners/borders in claude & co).
    // (PRD §11.7)
    let resizeSettleTimer: ReturnType<typeof setTimeout> | null = null
    const applyResize = (): void => {
      if (disposed) return
      const dims = fit.proposeDimensions()
      if (!dims || !Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return
      const cols = Math.max(2, Math.floor(dims.cols))
      const rows = Math.max(1, Math.floor(dims.rows))
      firstMeasureDone = true
      reportTerminalSize(terminalId, cols, rows)
      if (cols === term.cols && rows === term.rows) return
      term.resize(cols, rows) // xterm view
      window.termflow.pty.resize(terminalId, cols, rows) // PTY, same tick
      lastPtySizeRef.current = { cols, rows }
    }
    const scheduleTerminalResize = (): void => {
      // The very first measurement is not a "resize" — nothing has been drawn
      // yet, so waiting 250ms only delays the pane's first frame (and, for
      // agent panes, its startup command). Later changes stay debounced so a
      // drag still produces exactly ONE ConPTY rewrap.
      if (!firstMeasureDone) {
        applyResize()
        return
      }
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
      resizeSettleTimer = setTimeout(applyResize, 250)
    }
    scheduleResizeRef.current = scheduleTerminalResize
    // The container's canvas already fills its box via CSS, so no early fit is
    // needed for visual smoothness — an early fit only reintroduces the
    // mismatch window this channel exists to eliminate.
    const ro = new ResizeObserver(() => scheduleTerminalResize())
    ro.observe(host)

    return () => {
      disposed = true
      if (resizeSettleTimer) clearTimeout(resizeSettleTimer)
      scheduleResizeRef.current = null
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
      ro.disconnect()
      dataSub.dispose()
      keySub.dispose()
      bellSub.dispose()
      pathLinks.dispose()
      jumpToCommandRef.current = null
      for (const sub of shellIntegrationSubs) {
        try { sub.dispose() } catch { /* already disposed */ }
      }
      for (const deco of commandMarks) {
        try { deco.dispose() } catch { /* already disposed */ }
      }
      unregister()
      // Component unmounts when its window is deselected -> switch main to
      // buffer-only mode so the process keeps running without streaming.
      window.termflow.pty.setMode(terminalId, 'buffer')
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId])

  // Selection controls editing/focus only. All visible terminals remain live.
  useEffect(() => {
    if (active && termRef.current) {
      termRef.current.focus()
      // Route through the single resize channel — it no-ops if the size hasn't
      // changed and applies xterm + PTY atomically otherwise.
      scheduleResizeRef.current?.()
    }
  }, [active, terminalId])

  // Keep xterm options in sync with settings changes (font, theme, cursor, etc.).
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const s = useAppStore.getState().settings
    term.options.fontFamily = s.fontFamily
    term.options.fontSize = s.fontSize
    term.options.lineHeight = s.lineHeight
    term.options.cursorStyle = s.cursorStyle
    term.options.cursorBlink = s.cursorBlink
    const base = getTheme(s.terminalTheme).theme
    const css = getComputedStyle(document.documentElement)
    term.options.theme = {
      ...base,
      background: transparency < 100 ? 'rgba(0,0,0,0)' : css.getPropertyValue('--bg-terminal').trim(),
      cursor: css.getPropertyValue('--active-border').trim(),
      selectionBackground: css.getPropertyValue('--accent-soft').trim()
    }
    // A font/size change alters the cell metrics, so the fit result may change;
    // route it through the single atomic resize channel.
    scheduleResizeRef.current?.()
    term.refresh(0, term.rows - 1)
  }, [fontFamily, fontSize, lineHeight, cursorStyle, cursorBlink, terminalThemeName, appTheme, transparency])

  // Re-apply highlight decorations when the rule set changes.
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    applyHighlights(term, highlightRules, existingDecorsRef)
  }, [highlightRules])

  // Focus search input when the bar opens.
  useEffect(() => {
    if (searchVisible && searchInputRef.current) searchInputRef.current.focus()
  }, [searchVisible])

  // Clicking INSIDE the terminal must select its window/pane — xterm swallows
  // the event, so a passive pane would otherwise never accept keystrokes until
  // its tab was clicked.
  const activateOnClick = (): void => {
    const st = useAppStore.getState()
    const node = st.nodes.find(
      (n) => n.terminalId === terminalId || (n.panes ? getLeafTerminalIds(n.panes).includes(terminalId) : false)
    )
    if (!node) return
    if (st.activeNodeId !== node.id) st.setActiveNode(node.id)
    if (node.panes && node.activePaneId !== terminalId) st.setActivePane(node.id, terminalId)
  }

  // "+" button: pick files and type their quoted paths at the cursor, exactly
  // like dropping them onto the pane. Handy for agent CLIs (claude, codex) that
  // take file paths as part of a prompt.
  const attachFiles = async (): Promise<void> => {
    activateOnClick()
    const paths = await window.termflow.dialog.openFiles()
    const text = formatPaths(paths)
    if (!text) {
      termRef.current?.focus()
      return
    }
    // Trailing space so the next word (or another attach) stays separated.
    window.termflow.pty.write(terminalId, `${text} `)
    termRef.current?.focus()
  }

  const acceptFileDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    if (!event.dataTransfer.files.length) return
    activateOnClick()
    const paths = formatDroppedPaths(event.dataTransfer.files)
    if (!paths) return
    window.termflow.pty.write(terminalId, paths)
    termRef.current?.focus()
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onMouseDownCapture={activateOnClick}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={acceptFileDrop}
    >
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      {!searchVisible && (
      <button
        onClick={() => void attachFiles()}
        onMouseEnter={() => setAttachHover(true)}
        onMouseLeave={() => setAttachHover(false)}
        title="Attach files — inserts their paths at the cursor"
        aria-label="Attach files"
        style={{
          position: 'absolute',
          // Fixed top-right corner: every CLI puts its input somewhere else,
          // so a corner anchor is the one spot that never lands on top of the
          // prompt. The search bar owns this corner while it is open.
          // Small and faded so it stays out of the way; it only firms up on
          // hover, tinted with the theme accent rather than a fixed blue.
          top: 4,
          right: 10,
          height: 18,
          width: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: attachHover ? 'var(--accent-soft)' : 'transparent',
          border: `1px solid ${attachHover ? 'var(--accent)' : 'var(--border-soft)'}`,
          borderRadius: 4,
          color: attachHover ? 'var(--text-primary)' : 'var(--text-muted)',
          cursor: 'pointer',
          lineHeight: 0,
          padding: 0,
          opacity: attachHover ? 1 : 0.55,
          transition: 'background 120ms, color 120ms, border-color 120ms, opacity 120ms',
          zIndex: 9
        }}
      >
        {/* SVG icon, not the "+" glyph: font metrics leave the character
            optically off-centre in the box. */}
        <Plus size={12} strokeWidth={2.25} />
      </button>
      )}
      {searchVisible && (
        <div
          style={{
            position: 'absolute' as const,
            top: 4,
            right: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: '#1e2530',
            border: '1px solid #3a4050',
            borderRadius: 6,
            padding: '4px 8px',
            zIndex: 10
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSearchVisible(false)
              termRef.current?.focus()
            }
            e.stopPropagation()
          }}
        >
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // In copy mode the bar is the `/` `?` prompt: search once,
                // then hand the keyboard back to the copy-mode cursor.
                runSearch(copyMode ? searchBackwardRef.current : false, searchQuery)
                if (copyMode) {
                  setSearchVisible(false)
                  termRef.current?.focus()
                }
              }
            }}
            placeholder="Find..."
            style={{
              background: '#0d1117',
              border: '1px solid #3a4050',
              borderRadius: 4,
              color: '#e8eaf0',
              padding: '2px 6px',
              width: 160,
              outline: 'none'
            }}
          />
          <button
            onClick={() =>
              searchAddonRef.current?.findPrevious(searchQuery, {
                caseSensitive: searchCaseSensitive,
                regex: searchRegex,
                decorations: {
                  matchBackground: '#2f80ff44',
                  matchOverviewRuler: '#2f80ff',
                  activeMatchBackground: '#2f80ff88',
                  activeMatchColorOverviewRuler: '#2f80ff'
                }
              })
            }
            style={{ background: 'transparent', border: 'none', color: '#a0a7b4', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 12, lineHeight: 1 }}
            title="Previous match"
          >
            &#9650;
          </button>
          <button
            onClick={() =>
              searchAddonRef.current?.findNext(searchQuery, {
                caseSensitive: searchCaseSensitive,
                regex: searchRegex,
                decorations: {
                  matchBackground: '#2f80ff44',
                  matchOverviewRuler: '#2f80ff',
                  activeMatchBackground: '#2f80ff88',
                  activeMatchColorOverviewRuler: '#2f80ff'
                }
              })
            }
            style={{ background: 'transparent', border: 'none', color: '#a0a7b4', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 12, lineHeight: 1 }}
            title="Next match"
          >
            &#9660;
          </button>
          <button
            onClick={() => setSearchCaseSensitive((v) => !v)}
            style={{
              background: searchCaseSensitive ? '#2f80ff44' : 'transparent',
              border: 'none',
              color: '#a0a7b4',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 12,
              lineHeight: 1
            }}
            title="Case sensitive"
          >
            Aa
          </button>
          <button
            onClick={() => setSearchRegex((v) => !v)}
            style={{
              background: searchRegex ? '#2f80ff44' : 'transparent',
              border: 'none',
              color: '#a0a7b4',
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
              fontSize: 12,
              lineHeight: 1
            }}
            title="Regex"
          >
            .*
          </button>
          <button
            onClick={() => {
              setSearchVisible(false)
              termRef.current?.focus()
            }}
            style={{ background: 'transparent', border: 'none', color: '#a0a7b4', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 12, lineHeight: 1 }}
            title="Close"
          >
            X
          </button>
        </div>
      )}
    </div>
  )
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import Sidebar from './components/Sidebar'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import WorkspaceModal from './components/WorkspaceModal'
// Heavy, rarely-opened modals are code-split so they never sit in the startup
// bundle with the terminal path. (TerminalView/xterm is deliberately eager.)
const SettingsModal = lazy(() => import('./components/SettingsModal'))
const DeveloperCenter = lazy(() => import('./components/DeveloperCenter'))
const ProviderManagerModal = lazy(() => import('./components/ProviderManagerModal'))
const HistoryPickerModal = lazy(() => import('./components/HistoryPickerModal'))
const CommandBlocksPanel = lazy(() => import('./components/CommandBlocksPanel'))
import SnippetModal from './components/SnippetModal'
import ProjectManifestPanel from './components/ProjectManifestPanel'
import DetachedSessionsPanel from './components/DetachedSessionsPanel'
import HelpModal from './components/HelpModal'
import TerminalLauncherModal from './components/TerminalLauncherModal'
import RecoveryModal from './components/RecoveryModal'
import ConfirmModal from './components/ConfirmModal'
import PromptModal, { type PromptField } from './components/PromptModal'
import CommandPalette, { type PaletteCommand } from './components/CommandPalette'
import WindowTabs from './canvas/WindowTabs'
import WindowView from './canvas/WindowView'
import { useAppStore } from './store/appStore'
import { getActiveTerminalId, getLeafTerminalIds, countLeaves, findPaneInDirection, type PaneDirection } from './paneUtils'
import { isPrefixEvent, prefixControlChar, PREFIX_TIMEOUT_MS } from './prefixKeys'
import { readLastCommandOutput } from './shellIntegration'
import type { TermFlowPluginManifest } from '../../shared/types'
import { pluginMatchesWorkspace } from '../../shared/pluginValidation'

export default function App(): React.JSX.Element {
  const loadWorkspaces = useAppStore((s) => s.loadWorkspaces)
  const developerCenterOpen = useAppStore((s) => s.developerCenterOpen)
  const loadSettings = useAppStore((s) => s.loadSettings)
  const startRuntimeListeners = useAppStore((s) => s.startRuntimeListeners)
  const flushPersist = useAppStore((s) => s.flushPersist)
  const nodes = useAppStore((s) => s.nodes)
  const activeNodeId = useAppStore((s) => s.activeNodeId)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const snippets = useAppStore((s) => s.snippets)
  const sshProfiles = useAppStore((s) => s.sshProfiles)
  const projectManifest = useAppStore((s) => s.projectManifest)
  const activeWorkspace = useAppStore((s) => s.workspaces.find((workspace) => workspace.id === s.activeWorkspaceId))

  const [showWsModal, setShowWsModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showSnippetModal, setShowSnippetModal] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [helpTopicId, setHelpTopicId] = useState<string | undefined>(undefined)
  const [showTerminalLauncher, setShowTerminalLauncher] = useState(false)
  const [showProviderManager, setShowProviderManager] = useState(false)
  const [showRecovery, setShowRecovery] = useState(false)
  const [showHistoryPicker, setShowHistoryPicker] = useState(false)
  const [showCommandBlocks, setShowCommandBlocks] = useState(false)
  const [pluginCommands, setPluginCommands] = useState<TermFlowPluginManifest[]>([])
  const [confirm, setConfirm] = useState<{
    title: string
    message: string
    confirmLabel?: string
    tone?: 'default' | 'danger'
    onConfirm: () => void
  } | null>(null)
  const [prompt, setPrompt] = useState<{
    title: string
    fields: PromptField[]
    submitLabel?: string
    onSubmit: (values: Record<string, string>) => void
  } | null>(null)

  useEffect(() => {
    const openLauncher = (): void => setShowTerminalLauncher(true)
    const openProviders = (): void => setShowProviderManager(true)
    const closeAll = (): void => setConfirm({ title: 'Close all terminals', message: 'All terminal processes in this workspace will be terminated completely.', confirmLabel: 'Terminate All', tone: 'danger', onConfirm: () => { void useAppStore.getState().closeAllNodes() } })
    // DeveloperCenter is lazily mounted, so its open event has to be handled
    // here — the component itself is not in the tree while it is closed.
    const openDevCenter = (): void => useAppStore.getState().setDeveloperCenterOpen(true)
    window.addEventListener('termflow:open-terminal-launcher', openLauncher)
    window.addEventListener('termflow:open-provider-manager', openProviders)
    window.addEventListener('termflow:close-all-terminals', closeAll)
    window.addEventListener('termflow:open-developer-center', openDevCenter)
    return () => {
      window.removeEventListener('termflow:open-terminal-launcher', openLauncher)
      window.removeEventListener('termflow:open-provider-manager', openProviders)
      window.removeEventListener('termflow:close-all-terminals', closeAll)
      window.removeEventListener('termflow:open-developer-center', openDevCenter)
    }
  }, [])

  useEffect(() => {
    let active = true
    const loadPlugins = async (): Promise<void> => {
      const [plugins, files] = await Promise.all([
        window.termflow.plugins.list(),
        activeWorkspace ? window.termflow.files.list(activeWorkspace.id).catch(() => []) : Promise.resolve([])
      ])
      const names = new Set(files.map((file) => file.name.toLowerCase()))
      const platform = navigator.userAgent.includes('Windows') ? 'win32' : navigator.userAgent.includes('Mac') ? 'darwin' : 'linux'
      if (active) setPluginCommands(plugins.filter((plugin) => plugin.enabled !== false && pluginMatchesWorkspace(plugin, names, platform)))
    }
    const onChanged = (): void => { void loadPlugins() }
    void loadPlugins()
    window.addEventListener('termflow:plugins-changed', onChanged)
    return () => { active = false; window.removeEventListener('termflow:plugins-changed', onChanged) }
  }, [activeWorkspace])

  const loadSnippets = useAppStore((s) => s.loadSnippets)
  const loadHighlightRules = useAppStore((s) => s.loadHighlightRules)
  const startGitPolling = useAppStore((s) => s.startGitPolling)

  // Save layout immediately when window closes (before PTYs are killed).
  useEffect(() => {
    const onBeforeUnload = (): void => { flushPersist() }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushPersist])

  useEffect(() => {
    loadSettings()
    startRuntimeListeners()
    loadWorkspaces().then(() => {
      void window.termflow.recovery.status().then((status) => setShowRecovery(status.crashed))
      loadSnippets()
      loadHighlightRules()
      startGitPolling()
    })
  }, [loadSettings, startRuntimeListeners, loadWorkspaces, loadSnippets, loadHighlightRules, startGitPolling])

  // Global search (and friends) ask to reveal a terminal: switch to the window
  // that owns it and focus its pane. (feature: global search)
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ nodeId: string; terminalId?: string }>).detail
      const nodeId = detail?.nodeId
      if (!nodeId) return
      const s = useAppStore.getState()
      if (!s.nodes.some((n) => n.id === nodeId)) return
      s.setActiveNode(nodeId)
      if (detail.terminalId) s.setActivePane(nodeId, detail.terminalId)
    }
    window.addEventListener('termflow:focus-node', handler)
    return () => window.removeEventListener('termflow:focus-node', handler)
  }, [])

  const paletteCommands = useMemo<PaletteCommand[]>(() => {
    const s = useAppStore.getState
    const cmds: PaletteCommand[] = [
      { id: 'new-cmd', title: 'New Terminal: CMD', run: () => s().addTerminal('cmd') },
      { id: 'new-ps', title: 'New Terminal: PowerShell', run: () => s().addTerminal('powershell') },
      { id: 'new-wsl', title: 'New Terminal: WSL', run: () => s().addTerminal('wsl') },
      { id: 'new-claude', title: 'Open Claude Code', run: () => s().addTerminal('claude') },
      { id: 'new-codex', title: 'Open Codex', run: () => s().addTerminal('codex') },
      { id: 'new-opencode', title: 'Open OpenCode', run: () => s().addTerminal('opencode') },
      ...s().sshProfiles.map((profile) => ({
        id: `ssh:${profile.id}`,
        title: `SSH: ${profile.name} (${profile.user}@${profile.host})`,
        run: () => s().launchSshProfile(profile)
      })),
      ...((s().projectManifest?.tasks ?? []).map((task) => ({
        id: `manifest-task:${task.name}`,
        title: `Task: ${task.name}`,
        run: () => s().runManifestTask(task.name)
      }))),
      ...pluginCommands.flatMap((plugin) => plugin.commands.map((command) => ({
        id: `plugin:${plugin.id}:${command.id}`,
        title: `${command.category || plugin.name}: ${command.title}`,
        run: () => s().addTerminal(command.shell || 'custom', {
          name: command.title,
          startupCommand: command.command,
          cwd: command.cwd?.replaceAll('${workspaceFolder}', activeWorkspace?.path || '') || activeWorkspace?.path
        })
      }))),
      {
        id: 'apply-manifest',
        title: 'Apply .termflow.json Manifest',
        run: () => s().applyProjectManifest()
      },
      { id: 'new-window', title: 'New Window', run: () => s().addTerminal('cmd') },
      {
        id: 'next-window',
        title: 'Next Window',
        run: () => {
          const list = s().nodes
          if (!list.length) return
          const i = list.findIndex((n) => n.id === s().activeNodeId)
          s().setActiveNode(list[(i + 1) % list.length].id)
        }
      },
      {
        id: 'prev-window',
        title: 'Previous Window',
        run: () => {
          const list = s().nodes
          if (!list.length) return
          const i = list.findIndex((n) => n.id === s().activeNodeId)
          s().setActiveNode(list[(i - 1 + list.length) % list.length].id)
        }
      },
      {
        id: 'restart',
        title: 'Restart Active Terminal',
        run: () => {
          const a = s().activeNodeId
          if (a) s().restartNode(a)
        }
      },
      {
        id: 'kill-all',
        title: 'Kill All Terminals',
        run: () => {
          setConfirm({
            title: 'Close all terminals',
            message: 'All running terminal panels in this workspace will be terminated.',
            confirmLabel: 'Terminate All',
            tone: 'danger',
            onConfirm: () => s().nodes.slice().forEach((n) => s().closeNode(n.id, 'terminate'))
          })
        }
      },
      { id: 'toggle-broadcast', title: 'Toggle Broadcast Mode', run: () => s().toggleBroadcast() },
      {
        id: 'split-h',
        title: 'Split Active Window Down (stacked)',
        run: () => {
          const a = s().activeNodeId
          if (a) s().splitNode(a, 'horizontal')
        }
      },
      {
        id: 'split-v',
        title: 'Split Active Window Right (side by side)',
        run: () => {
          const a = s().activeNodeId
          if (a) s().splitNode(a, 'vertical')
        }
      },
      // Add snippets
      ...s().snippets.map((sn) => ({
        id: `snippet:${sn.id}`,
        title: `Snippet: ${sn.name}`,
        run: () => {
          // Quick-run snippet: write to active terminal
          const activeNodeId = s().activeNodeId
          if (!activeNodeId) return
          const node = s().nodes.find((n) => n.id === activeNodeId)
          if (!node) return
          const tid = getActiveTerminalId(node.activePaneId, node.panes, node.terminalId)
          if (tid) {
            if (sn.params.length > 0) {
              setPrompt({
                title: `Snippet: ${sn.name}`,
                submitLabel: 'Run',
                fields: sn.params.map((p) => ({ key: p, label: p, required: true })),
                onSubmit: (values) => {
                  let cmd = sn.command
                  for (const p of sn.params) {
                    cmd = cmd.replace(new RegExp(`\\{\\{${p}\\}\\}`, 'g'), values[p] ?? '')
                  }
                  window.termflow.pty.write(tid, cmd + '\r')
                }
              })
            } else {
              window.termflow.pty.write(tid, sn.command + '\r')
            }
          }
        }
      })),
      {
        // Needs shell integration (OSC 133) to know where the last command's
        // output starts; without it there is nothing to copy.
        id: 'copy-last-output',
        title: 'Copy Last Command Output',
        run: () => {
          const node = s().nodes.find((n) => n.id === s().activeNodeId)
          if (!node) return
          const tid = getActiveTerminalId(node.activePaneId, node.panes, node.terminalId)
          const text = tid ? readLastCommandOutput(tid) : null
          if (text) void navigator.clipboard.writeText(text)
        }
      },
      { id: 'command-history', title: 'Command History (Ctrl+Shift+R)', run: () => setShowHistoryPicker(true) },
      { id: 'command-blocks', title: 'Command Blocks', run: () => setShowCommandBlocks(true) },
      { id: 'new-snippet', title: 'Create New Snippet', run: () => setShowSnippetModal(true) },
      { id: 'settings', title: 'Open Settings', run: () => setShowSettings(true) },
      { id: 'new-ws', title: 'Create Workspace', run: () => setShowWsModal(true) }
    ]
    return cmds
  }, [snippets, sshProfiles, projectManifest, pluginCommands, activeWorkspace])

  // Keyboard shortcuts (PRD §21). Ctrl+Alt combos avoid clashing with terminal input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useAppStore.getState()
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setShowPalette((v) => !v)
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        if (s.activeNodeId) s.splitNode(s.activeNodeId, 'vertical')
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault()
        if (s.activeNodeId) s.splitNode(s.activeNodeId, 'horizontal')
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'r') {
        // Shift only: plain Ctrl+R must stay with the shell's reverse search.
        e.preventDefault()
        setShowHistoryPicker((v) => !v)
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        s.toggleBroadcast()
      } else if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 't') {
        e.preventDefault()
        s.addTerminal('cmd')
      } else if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        const list = s.nodes
        if (list.length) {
          const i = list.findIndex((n) => n.id === s.activeNodeId)
          const step = e.shiftKey ? -1 : 1
          s.setActiveNode(list[(i + step + list.length) % list.length].id)
        }
      } else if (e.key === 'Escape') {
        setShowPalette(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The ⋯ menu (per window) asks App to open the command-blocks panel.
  useEffect(() => {
    const open = (): void => setShowCommandBlocks(true)
    window.addEventListener('termflow:command-blocks', open)
    return () => window.removeEventListener('termflow:command-blocks', open)
  }, [])

  // Any open modal owns the keyboard: the prefix stays disabled while one is up.
  const anyModalOpen =
    showWsModal || showSettings || showPalette || showSnippetModal || showHelp ||
    showTerminalLauncher || showProviderManager || showRecovery || showHistoryPicker || showCommandBlocks || !!confirm || !!prompt
  const modalOpenRef = useRef(anyModalOpen)
  modalOpenRef.current = anyModalOpen

  // tmux-style prefix key (default Ctrl+A). Press the prefix, then a command
  // key; pressing the prefix twice sends the key itself to the terminal.
  // Capture phase so we win over xterm and the plain shortcut handler.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const setPending = (pending: boolean): void => {
      if (timer) clearTimeout(timer)
      timer = null
      useAppStore.getState().setPrefixPending(pending)
      if (pending) timer = setTimeout(() => useAppStore.getState().setPrefixPending(false), PREFIX_TIMEOUT_MS)
    }

    const activeWindow = (): { nodeId: string; termId: string | undefined } | null => {
      const s = useAppStore.getState()
      const node = s.nodes.find((n) => n.id === s.activeNodeId)
      if (!node) return null
      return { nodeId: node.id, termId: getActiveTerminalId(node.activePaneId, node.panes, node.terminalId) }
    }

    const selectPane = (dir: PaneDirection): void => {
      const s = useAppStore.getState()
      const node = s.nodes.find((n) => n.id === s.activeNodeId)
      if (!node?.panes) return
      const current = getActiveTerminalId(node.activePaneId, node.panes, node.terminalId)
      if (!current) return
      const target = findPaneInDirection(node.panes, current, dir)
      if (!target) return
      s.setZoomedPane(null)
      s.setActivePane(node.id, target)
    }

    const switchWindow = (step: number): void => {
      const s = useAppStore.getState()
      if (!s.nodes.length) return
      const i = s.nodes.findIndex((n) => n.id === s.activeNodeId)
      s.setActiveNode(s.nodes[(i + step + s.nodes.length) % s.nodes.length].id)
    }

    /** Run one prefix command. Returns false when the key is not ours. */
    const runCommand = (e: KeyboardEvent): boolean => {
      const s = useAppStore.getState()
      const win = activeWindow()
      const key = e.key

      if (key === '%') {
        if (win) void s.splitNode(win.nodeId, 'vertical')
        return true
      }
      if (key === '"') {
        if (win) void s.splitNode(win.nodeId, 'horizontal')
        return true
      }
      if (key === 'h' || key === 'ArrowLeft') { selectPane('left'); return true }
      if (key === 'l' || key === 'ArrowRight') { selectPane('right'); return true }
      if (key === 'k' || key === 'ArrowUp') { selectPane('up'); return true }
      if (key === 'j' || key === 'ArrowDown') { selectPane('down'); return true }
      if (key === 'o') {
        const node = s.nodes.find((n) => n.id === s.activeNodeId)
        if (node?.panes) {
          const leaves = getLeafTerminalIds(node.panes)
          const current = getActiveTerminalId(node.activePaneId, node.panes, node.terminalId)
          const i = leaves.indexOf(current ?? '')
          const next = leaves[(i + 1) % leaves.length]
          if (next) {
            s.setZoomedPane(null)
            s.setActivePane(node.id, next)
          }
        }
        return true
      }
      if (key === 'x') {
        const node = s.nodes.find((n) => n.id === s.activeNodeId)
        if (node) {
          const current = getActiveTerminalId(node.activePaneId, node.panes, node.terminalId)
          if (node.panes && countLeaves(node.panes) > 1 && current) void s.closePaneInNode(node.id, current)
          // A window with a single pane goes through the usual close dialog.
          else window.dispatchEvent(new CustomEvent('termflow:close-window', { detail: { nodeId: node.id } }))
        }
        return true
      }
      if (key === 'z') {
        if (win?.termId) s.toggleZoomedPane(win.termId)
        return true
      }
      if (key === 'c') { void s.addTerminal('cmd'); return true }
      if (key === 't') { s.tileAllWindows(); return true }
      if (key === 'n') { switchWindow(1); return true }
      if (key === 'p') { switchWindow(-1); return true }
      if (key >= '0' && key <= '9') {
        const target = s.nodes[Number(key)]
        if (target) s.setActiveNode(target.id)
        return true
      }
      if (key === ',') {
        if (win) window.dispatchEvent(new CustomEvent('termflow:rename-window', { detail: { nodeId: win.nodeId } }))
        return true
      }
      if (key === '[') {
        // Copy mode never breaks the zoom (tmux behaviour).
        if (win?.termId) s.setCopyModePane(win.termId)
        return true
      }
      if (key === 'd') {
        if (win) void s.closeNode(win.nodeId, 'detach')
        return true
      }
      if (key === '?') {
        setHelpTopicId('prefix')
        setShowHelp(true)
        return true
      }
      return false
    }

    const onKeyCapture = (e: KeyboardEvent): void => {
      const s = useAppStore.getState()
      if (modalOpenRef.current) {
        if (s.prefixPending) setPending(false)
        return
      }

      // Copy mode owns the keyboard: its own keys (Ctrl+B page-up among them)
      // win over the prefix while it is active.
      if (s.copyModePaneId) {
        if (s.prefixPending) setPending(false)
        return
      }

      if (!s.prefixPending) {
        if (!isPrefixEvent(e, s.settings.prefixKey)) return
        // Text fields (tab rename, search boxes) keep their own key handling.
        const el = document.activeElement
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable) return
        e.preventDefault()
        e.stopPropagation()
        setPending(true)
        return
      }

      // Pending: bare modifier presses keep waiting for the real key.
      if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return

      // Double prefix (e.g. Ctrl+A Ctrl+A) sends the key itself to the shell.
      if (isPrefixEvent(e, s.settings.prefixKey)) {
        setPending(false)
        e.preventDefault()
        e.stopPropagation()
        const win = activeWindow()
        if (win?.termId) window.termflow.pty.write(win.termId, prefixControlChar(s.settings.prefixKey))
        return
      }

      // Clear first: an unhandled key must fall through to xterm normally.
      setPending(false)
      if (runCommand(e)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }

    window.addEventListener('keydown', onKeyCapture, true)
    return () => {
      if (timer) clearTimeout(timer)
      window.removeEventListener('keydown', onKeyCapture, true)
    }
  }, [])

  return (
    <div className={`app${developerCenterOpen ? ' dev-docked' : ''}`}>
      <Sidebar onNewWorkspace={() => setShowWsModal(true)} />
      <Toolbar
        onOpenSettings={() => setShowSettings(true)}
        onOpenPalette={() => setShowPalette(true)}
        onOpenHelp={() => setShowHelp(true)}
        onOpenTerminalLauncher={() => setShowTerminalLauncher(true)}
        onOpenProviderManager={() => setShowProviderManager(true)}
      />
      <div className="canvas-wrap">
        {/* The window tab strip lives inside the window header (single chrome
            row); it only needs its own row when there is no window to host it. */}
        {nodes.length > 0 && !nodes.some((n) => n.id === activeNodeId) && <WindowTabs />}
        <div className="window-area">
          {activeNodeId && nodes.some((n) => n.id === activeNodeId) && (
            <WindowView key={activeNodeId} id={activeNodeId} />
          )}
          <ProjectManifestPanel />
          <DetachedSessionsPanel />
          {nodes.length === 0 && (
            <div className="empty-canvas">
              <TerminalSquare size={40} strokeWidth={1.3} />
              <div className="big">{activeWorkspaceId ? 'No windows open' : 'Select or create a workspace'}</div>
              <div>{activeWorkspaceId ? 'Open one with "New Terminal"' : ''}</div>
            </div>
          )}
        </div>
      </div>
      {developerCenterOpen && <Suspense fallback={null}><DeveloperCenter /></Suspense>}
      <StatusBar />
      {showWsModal && <WorkspaceModal onClose={() => setShowWsModal(false)} />}
      {showSettings && <Suspense fallback={null}><SettingsModal onClose={() => setShowSettings(false)} /></Suspense>}
      {showHelp && <HelpModal initialTopicId={helpTopicId} onClose={() => { setShowHelp(false); setHelpTopicId(undefined) }} />}
      {showTerminalLauncher && <TerminalLauncherModal onClose={() => setShowTerminalLauncher(false)} />}
      {showProviderManager && <Suspense fallback={null}><ProviderManagerModal onClose={() => setShowProviderManager(false)} /></Suspense>}
      {showRecovery && <RecoveryModal onRestore={() => { void window.termflow.recovery.acknowledge(); setShowRecovery(false) }} onDiscard={() => { useAppStore.getState().nodes.slice().forEach((node) => useAppStore.getState().closeNode(node.id, 'terminate')); void window.termflow.recovery.acknowledge(); setShowRecovery(false) }} />}
      {showSnippetModal && <SnippetModal onClose={() => setShowSnippetModal(false)} />}
      {showHistoryPicker && <Suspense fallback={null}><HistoryPickerModal open={showHistoryPicker} onClose={() => setShowHistoryPicker(false)} /></Suspense>}
      {showCommandBlocks && <Suspense fallback={null}><CommandBlocksPanel open={showCommandBlocks} onClose={() => setShowCommandBlocks(false)} /></Suspense>}
      {showPalette && <CommandPalette commands={paletteCommands} onClose={() => setShowPalette(false)} />}
      {confirm && (
        <ConfirmModal
          {...confirm}
          onClose={() => setConfirm(null)}
        />
      )}
      {prompt && (
        <PromptModal
          {...prompt}
          onClose={() => setPrompt(null)}
        />
      )}
    </div>
  )
}

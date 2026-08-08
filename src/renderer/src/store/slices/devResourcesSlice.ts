import type { StateCreator } from 'zustand'
import type {
  Workspace,
  TerminalSession,
  AppSettings,
  Snippet,
  HighlightRule,
  SshProfile,
  TermflowManifest,
  TaskTrigger
} from '../../../../shared/types'
import { DEFAULT_SETTINGS } from '../../../../shared/types'
import { isValidSshProfile } from '../../../../shared/validation'
import { getLeafTerminalIds } from '../../paneUtils'
import { applyTheme } from '../storeShared'
import type { AppState } from '../appStore'

export interface DevResourcesSlice {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  settings: AppSettings

  loadWorkspaces: () => Promise<void>
  loadSettings: () => Promise<void>
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  openWorkspace: (id: string) => Promise<void>
  createWorkspace: (input: { name: string; path: string; description?: string }) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>

  // Snippets (P0-2)
  snippets: Snippet[]
  loadSnippets: () => Promise<void>
  createSnippet: (input: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Snippet>
  updateSnippet: (id: string, patch: Partial<Snippet>) => Promise<void>
  deleteSnippet: (id: string) => Promise<void>

  // Highlight rules (P1-8)
  highlightRules: HighlightRule[]
  loadHighlightRules: () => Promise<void>
  sshProfiles: SshProfile[]
  projectManifest: TermflowManifest | null
  projectManifestApplied: boolean
  loadDeveloperResources: () => Promise<void>
  launchSshProfile: (profile: SshProfile) => Promise<void>
  runManifestTask: (taskName: string) => Promise<void>
  applyProjectManifest: () => Promise<void>
  dismissProjectManifest: () => void

  // Git status (P2-9, extended with ahead/behind + fetch for deep git)
  gitStatus: Record<string, { branch: string; dirty: boolean; ahead?: number; behind?: number } | null>
  startGitPolling: () => void
  refreshGitStatus: (terminalId: string) => Promise<void>
  fetchGitRemote: (terminalId: string) => Promise<{ ok: boolean; message: string }>
  copyGitBranch: (terminalId: string) => Promise<void>

  // package.json script runner (feature: task-runner)
  pkgScripts: Record<string, string>
  packageManager: 'npm' | 'pnpm' | 'yarn'
  loadPkgScripts: () => Promise<void>
  runPkgScript: (scriptName: string) => Promise<void>

  // Task triggers: process_exit / timer (feature: expanded task triggers)
  taskTriggers: TaskTrigger[]
  loadTaskTriggers: () => Promise<void>
  saveTaskTrigger: (trigger: Omit<TaskTrigger, 'id' | 'workspaceId'> & { id?: string }) => Promise<void>
  deleteTaskTrigger: (id: string) => Promise<void>
  toggleTaskTrigger: (id: string) => Promise<void>
  runTaskTriggerAction: (trigger: TaskTrigger) => Promise<void>
}

let gitPollingStarted = false
let workspaceRequest = 0
const timerHandles = new Map<string, ReturnType<typeof setInterval>>()

function clearTaskTimers(): void {
  for (const handle of timerHandles.values()) clearInterval(handle)
  timerHandles.clear()
}

export const createDevResourcesSlice: StateCreator<AppState, [], [], DevResourcesSlice> = (set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  settings: { ...DEFAULT_SETTINGS },

  snippets: [],
  highlightRules: [],
  sshProfiles: [],
  projectManifest: null,
  projectManifestApplied: false,
  gitStatus: {},
  pkgScripts: {},
  packageManager: 'npm',
  taskTriggers: [],

  loadSettings: async () => {
    let settings = await window.termflow.settings.get()
    // WebGL is disabled for all existing profiles too: persisted `true`
    // values otherwise keep re-enabling the Windows resize corruption.
    if (settings.webgl) settings = await window.termflow.settings.set({ webgl: false })
    const appearancePatch: Partial<AppSettings> = {}
    if (settings.fontSize === 10 || settings.fontSize === 13) appearancePatch.fontSize = 12
    if (settings.fontFamily.includes('Cascadia Mono') && !settings.fontFamily.includes('0xProto'))
      appearancePatch.fontFamily = "'0xProto Nerd Font Mono', 'Cascadia Mono', Consolas, monospace"
    if (settings.fontFamily.includes('JetBrains Mono') && settings.fontSize >= 16) {
      appearancePatch.fontFamily = "'0xProto Nerd Font Mono', 'Cascadia Mono', Consolas, monospace"
      appearancePatch.fontSize = 12
    }
    if (settings.terminalTheme === 'TermFlow Dark' || settings.terminalTheme === 'Zeonica') appearancePatch.terminalTheme = 'VS Code Dark'
    const THEME_MIGRATION: Record<string, AppSettings['theme']> = {
      dark: 'vscode-dark',
      light: 'vscode-light',
      mocha: 'vscode-dark',
      latte: 'vscode-light',
      matcha: 'vscode-light',
      frappe: 'vscode-dark',
      macchiato: 'vscode-dark',
      kanagawa: 'tokyo-night',
      ayu: 'one-dark-pro',
      'rose-pine': 'tokyo-night'
    }
    const migratedTheme = THEME_MIGRATION[settings.theme as string]
    if (migratedTheme) appearancePatch.theme = migratedTheme
    if (Object.keys(appearancePatch).length) settings = await window.termflow.settings.set(appearancePatch)
    set({ settings })
    document.documentElement.style.setProperty('--active-border', settings.activeBorderColor)
    applyTheme(settings.theme, settings.transparency)
  },

  updateSettings: async (patch) => {
    const settings = await window.termflow.settings.set(patch)
    set({ settings })
    if (patch.activeBorderColor)
      document.documentElement.style.setProperty('--active-border', settings.activeBorderColor)
    if (patch.theme || patch.transparency !== undefined) applyTheme(settings.theme, settings.transparency)
  },

  loadWorkspaces: async () => {
    const workspaces = await window.termflow.workspaces.list()
    set({ workspaces })
    const st = get()
    if (!st.activeWorkspaceId && workspaces.length) await get().openWorkspace(workspaces[0].id)
  },

  openWorkspace: async (id) => {
    const request = ++workspaceRequest
    // Kill terminals from the previously open workspace before switching.
    const prev = get()
    if (prev.activeWorkspaceId && prev.activeWorkspaceId !== id) {
      for (const t of Object.values(prev.terminals)) window.termflow.pty.kill(t.id)
    }
    clearTaskTimers()

    const layout = await window.termflow.layout.get(id)
    const terms = await window.termflow.terminals.list(id)
    if (request !== workspaceRequest) return
    const terminals: Record<string, TerminalSession> = {}
    for (const t of terms) terminals[t.id] = t

    // Collect all terminalIds from pane trees
    const termIds = new Set<string>()
    for (const node of layout.nodes) {
      if (node.panes) {
        getLeafTerminalIds(node.panes).forEach((tid) => termIds.add(tid))
      } else if (node.terminalId) {
        termIds.add(node.terminalId)
      }
    }

    for (const tid of termIds) {
      if (request !== workspaceRequest) return
      const t = terminals[tid]
      if (!t) {
        // Create a terminal session for this pane if it doesn't exist
        const termSession: TerminalSession = {
          id: tid,
          workspaceId: id,
          name: `Terminal`,
          kind: 'powershell',
          shell: 'powershell.exe',
          args: [],
          cwd: '',
          status: 'stopped',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        try {
          const { pid } = await window.termflow.pty.create(tid, {
            workspaceId: id,
            name: termSession.name,
            kind: termSession.kind,
            cwd: termSession.cwd
          })
          terminals[tid] = { ...termSession, pid, status: 'running' }
        } catch {
          terminals[tid] = { ...termSession, status: 'error' }
        }
        continue
      }
      try {
        const { pid } = await window.termflow.pty.create(t.id, {
          workspaceId: id,
          name: t.name,
          kind: t.kind,
          shell: t.shell,
          args: t.args,
          cwd: t.cwd,
          env: t.env,
          cleanProviderEnv: t.cleanProviderEnv,
          startupCommand: t.startupCommand
        })
        terminals[t.id] = { ...t, pid, status: 'running' }
      } catch {
        terminals[t.id] = { ...t, status: 'error' }
      }
    }

    // Prune orphaned terminal records: sessions persisted by earlier runs that
    // aren't referenced by any layout node. Their PTYs never survive a restart,
    // so without this they pile up forever as "stopped" detached sessions.
    for (const t of Object.values(terminals)) {
      if (!termIds.has(t.id)) {
        delete terminals[t.id]
        window.termflow.terminals.remove(t.id).catch(() => {})
      }
    }

    if (request !== workspaceRequest) return
    const [snippets, highlightRules, sshProfiles] = await Promise.all([
      window.termflow.snippets.list(id),
      window.termflow.highlightRules.list(id),
      window.termflow.sshProfiles.list(id)
    ])
    if (request !== workspaceRequest) return
    const ws = get().workspaces.find((w) => w.id === id)
    const manifest = ws?.path ? await window.termflow.workspaces.checkManifest(ws.path) as TermflowManifest | null : null
    if (request !== workspaceRequest) return
    set({
      activeWorkspaceId: id,
      nodes: layout.nodes,
      terminals,
      activeNodeId: layout.activeNodeId && layout.nodes.some((n) => n.id === layout.activeNodeId)
        ? layout.activeNodeId
        : layout.nodes[0]?.id ?? null,
      snippets,
      highlightRules,
      sshProfiles,
      projectManifest: manifest,
      projectManifestApplied: false
    })
    await window.termflow.workspaces.update(id, { lastOpenedAt: new Date().toISOString() })
    await get().loadPkgScripts()
    await get().loadTaskTriggers()
  },

  createWorkspace: async (input) => {
    const ws = await window.termflow.workspaces.create(input)
    set((s) => ({ workspaces: [ws, ...s.workspaces] }))
    await get().openWorkspace(ws.id)
  },

  deleteWorkspace: async (id) => {
    const { terminals, activeWorkspaceId } = get()
    if (activeWorkspaceId === id) for (const t of Object.values(terminals)) window.termflow.pty.kill(t.id)
    await window.termflow.workspaces.remove(id)
    const workspaces = await window.termflow.workspaces.list()
    set({ workspaces })
    if (activeWorkspaceId === id) {
      set({ activeWorkspaceId: null, nodes: [], terminals: {}, activeNodeId: null })
      if (workspaces.length) await get().openWorkspace(workspaces[0].id)
    }
  },

  renameWorkspace: async (id, name) => {
    await window.termflow.workspaces.update(id, { name })
    set((s) => ({ workspaces: s.workspaces.map((w) => (w.id === id ? { ...w, name } : w)) }))
  },

  // ---- Snippets ----
  loadSnippets: async () => {
    const wsId = get().activeWorkspaceId
    const snippets = await window.termflow.snippets.list(wsId || undefined)
    set({ snippets })
  },

  createSnippet: async (input) => {
    const snippet = await window.termflow.snippets.create(input)
    set((s) => ({ snippets: [...s.snippets, snippet] }))
    return snippet
  },

  updateSnippet: async (id, patch) => {
    await window.termflow.snippets.update(id, patch)
    set((s) => ({ snippets: s.snippets.map((sn) => (sn.id === id ? { ...sn, ...patch, updatedAt: new Date().toISOString() } : sn)) }))
  },

  deleteSnippet: async (id) => {
    await window.termflow.snippets.remove(id)
    set((s) => ({ snippets: s.snippets.filter((sn) => sn.id !== id) }))
  },

  // ---- Highlight Rules ----
  loadHighlightRules: async () => {
    const wsId = get().activeWorkspaceId
    const highlightRules = await window.termflow.highlightRules.list(wsId || undefined)
    set({ highlightRules })
  },

  loadDeveloperResources: async () => {
    const wsId = get().activeWorkspaceId
    if (!wsId) {
      set({ sshProfiles: [] })
      return
    }
    const sshProfiles = await window.termflow.sshProfiles.list(wsId)
    set({ sshProfiles })
  },

  launchSshProfile: async (profile) => {
    if (!isValidSshProfile(profile)) throw new Error('Invalid SSH profile')
    const args: string[] = []
    if (profile.port && profile.port !== 22) args.push('-p', String(profile.port))
    if (profile.keyPath) args.push('-i', profile.keyPath)
    if (profile.jumpHost) args.push('-J', profile.jumpHost)
    args.push(`${profile.user}@${profile.host}`)
    await get().addTerminal('ssh', {
      name: `SSH: ${profile.name}`,
      args
    })
  },

  runManifestTask: async (taskName) => {
    const st = get()
    const task = st.projectManifest?.tasks?.find((t) => t.name === taskName)
    const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
    if (!task || !ws) return
    await get().addTerminal(task.shell ?? 'cmd', {
      name: task.name,
      cwd: task.cwd || ws.path,
      startupCommand: task.command
    })
  },

  applyProjectManifest: async () => {
    const st = get()
    const manifest = st.projectManifest
    const wsId = st.activeWorkspaceId
    if (!manifest || !wsId) return

    const existingEnv = await window.termflow.envVars.list(wsId)
    const existingEnvKeys = new Set(existingEnv.map((item) => item.key.toUpperCase()))
    for (const item of manifest.env ?? []) {
      if (!item.key.trim()) continue
      if (existingEnvKeys.has(item.key.trim().toUpperCase())) continue
      await window.termflow.envVars.create({
        workspaceId: wsId,
        key: item.key.trim(),
        value: item.value ?? '',
        masked: item.masked ?? true
      })
    }

    const existingSnippetNames = new Set(st.snippets.map((item) => item.name.toLowerCase()))
    for (const sn of manifest.snippets ?? []) {
      if (!sn.name.trim() || !sn.command.trim()) continue
      if (existingSnippetNames.has(sn.name.trim().toLowerCase())) continue
      const params = [...sn.command.matchAll(/\{\{([a-zA-Z0-9_-]+)\}\}/g)].map((m) => m[1])
      await get().createSnippet({
        workspaceId: sn.scope === 'global' ? null : wsId,
        name: sn.name.trim(),
        command: sn.command,
        params: [...new Set(params)],
        scope: sn.scope ?? 'workspace'
      })
    }

    const existingAgentNames = new Set(st.nodes.map((node) => node.title.toLowerCase()))
    for (const agent of manifest.agents ?? []) {
      if (existingAgentNames.has(agent.name.toLowerCase())) continue
      await get().addTerminal(agent.kind ?? 'claude', {
        name: agent.name,
        startupCommand: agent.command
      })
    }

    set({ projectManifestApplied: true })
    await Promise.all([get().loadDeveloperResources(), get().loadSnippets()])
  },

  dismissProjectManifest: () => set({ projectManifest: null, projectManifestApplied: false }),

  // ---- Git Status ----
  startGitPolling: () => {
    if (gitPollingStarted) return
    gitPollingStarted = true
    const poll = async (): Promise<void> => {
      const st = get()
      if (!st.activeWorkspaceId) return
      const seen = new Set<string>()
      for (const node of st.nodes) {
        const termIds = node.panes ? getLeafTerminalIds(node.panes) : (node.terminalId ? [node.terminalId] : [])
        for (const tid of termIds) {
          if (seen.has(tid)) continue
          seen.add(tid)
          const t = st.terminals[tid]
          if (t?.cwd) {
            try {
              const status = await window.termflow.git.status(t.cwd)
              if (status) set((s) => ({ gitStatus: { ...s.gitStatus, [tid]: status } }))
            } catch { /* ignore */ }
          }
        }
      }
    }
    poll()
    const schedule = (): void => {
      const count = Object.keys(get().terminals).length
      setTimeout(async () => {
        await poll()
        schedule()
      }, count > 8 ? 30000 : 10000)
    }
    schedule()
  },

  // Force a single terminal's git badge to refresh right away, e.g. right
  // after a manual fetch. (deep git)
  refreshGitStatus: async (terminalId) => {
    const t = get().terminals[terminalId]
    if (!t?.cwd) return
    try {
      const status = await window.termflow.git.status(t.cwd)
      set((s) => ({ gitStatus: { ...s.gitStatus, [terminalId]: status } }))
    } catch { /* ignore */ }
  },

  // Quick git action: `git fetch` for the terminal's cwd, then refresh the badge. (deep git)
  fetchGitRemote: async (terminalId) => {
    const t = get().terminals[terminalId]
    if (!t?.cwd) return { ok: false, message: 'cwd bilinmiyor' }
    const res = await window.termflow.git.fetch(t.cwd)
    await get().refreshGitStatus(terminalId)
    return res
  },

  // Quick git action: copy the current branch name to the clipboard. (deep git)
  copyGitBranch: async (terminalId) => {
    const status = get().gitStatus[terminalId]
    if (status?.branch) await navigator.clipboard.writeText(status.branch)
  },

  // ---- package.json script runner ----
  loadPkgScripts: async () => {
    const ws = get().workspaces.find((w) => w.id === get().activeWorkspaceId)
    if (!ws?.path) {
      set({ pkgScripts: {}, packageManager: 'npm' })
      return
    }
    const result = await window.termflow.pkg.scripts(ws.path)
    set({ pkgScripts: result?.scripts ?? {}, packageManager: result?.packageManager ?? 'npm' })
  },

  runPkgScript: async (scriptName) => {
    const st = get()
    const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
    if (!ws || !st.pkgScripts[scriptName]) return
    await get().addTerminal('cmd', {
      name: scriptName,
      cwd: ws.path,
      startupCommand: `${st.packageManager} run ${scriptName}`
    })
  },

  // ---- Task Triggers (process_exit / timer) ----
  loadTaskTriggers: async () => {
    const wsId = get().activeWorkspaceId
    clearTaskTimers()
    if (!wsId) {
      set({ taskTriggers: [] })
      return
    }
    const taskTriggers = await window.termflow.taskTriggers.list(wsId)
    set({ taskTriggers })
    for (const trigger of taskTriggers) {
      if (trigger.kind !== 'timer' || !trigger.enabled || !trigger.intervalMs) continue
      const handle = setInterval(() => { void get().runTaskTriggerAction(trigger) }, Math.max(5000, trigger.intervalMs))
      timerHandles.set(trigger.id, handle)
    }
  },

  saveTaskTrigger: async (trigger) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return
    await window.termflow.taskTriggers.save({ ...trigger, workspaceId: wsId } as TaskTrigger)
    await get().loadTaskTriggers()
  },

  deleteTaskTrigger: async (id) => {
    const wsId = get().activeWorkspaceId
    if (!wsId) return
    await window.termflow.taskTriggers.remove(wsId, id)
    await get().loadTaskTriggers()
  },

  toggleTaskTrigger: async (id) => {
    const trigger = get().taskTriggers.find((t) => t.id === id)
    if (!trigger) return
    await get().saveTaskTrigger({ ...trigger, enabled: !trigger.enabled })
  },

  runTaskTriggerAction: async (trigger) => {
    const st = get()
    const ws = st.workspaces.find((w) => w.id === st.activeWorkspaceId)
    if (!ws || !trigger.command.trim()) return
    await get().addTerminal(trigger.shell ?? 'cmd', {
      name: trigger.name || 'Trigger',
      cwd: trigger.cwd || ws.path,
      startupCommand: trigger.command
    })
  }
})

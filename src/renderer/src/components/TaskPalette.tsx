import { useEffect, useMemo, useState } from 'react'
import { Box, Clock3, Code2, GitBranch, Play, Search, Settings, TerminalSquare } from 'lucide-react'
import type { ProjectInfo } from '../../../shared/ipc'
import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { useCommandHistoryStore } from '../store/commandHistoryStore'
import { useTaskPaletteStore } from '../store/taskPaletteStore'
import { useTerminalStore } from '../store/terminalStore'

interface PaletteItem {
  id: string
  label: string
  detail: string
  command?: string
  action?: () => void
  icon: React.JSX.Element
}

const COMMON_TASKS: PaletteItem[] = [
  { id: 'git-status', label: 'Git: Status', detail: 'git status', command: 'git status', icon: <GitBranch size={14} /> },
  { id: 'git-log', label: 'Git: Recent commits', detail: 'git log --oneline -10', command: 'git log --oneline -10', icon: <GitBranch size={14} /> },
  { id: 'npm-install', label: 'npm: Install dependencies', detail: 'npm install', command: 'npm install', icon: <Code2 size={14} /> },
  { id: 'docker-up', label: 'Docker: Compose up', detail: 'docker compose up', command: 'docker compose up', icon: <Box size={14} /> },
  { id: 'docker-down', label: 'Docker: Compose down', detail: 'docker compose down', command: 'docker compose down', icon: <Box size={14} /> }
]

export function TaskPalette(): React.JSX.Element {
  const hide = useTaskPaletteStore((state) => state.hide)
  const activeTabId = useTerminalStore((state) => state.activeTabId)
  const active = useTerminalStore((state) => state.tabs.find((tab) => tab.id === state.activeTabId))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [project, setProject] = useState<ProjectInfo | null>(null)
  const cwd = active?.cwd || active?.launchCwd || ''

  useEffect(() => {
    let current = true
    if (!cwd) {
      setProject(null)
      return
    }
    void window.termflow.project.detect(cwd).then((value) => {
      if (current) setProject(value)
    })
    return () => { current = false }
  }, [cwd])

  const items = useMemo<PaletteItem[]>(() => {
    const settingsStore = useSettingsStore.getState()
    const actions: PaletteItem[] = [
      { id: 'new-terminal', label: 'Terminal: New terminal', detail: 'Create a new default terminal', icon: <TerminalSquare size={14} />, action: () => useTerminalStore.getState().addTab(resolveDefaultProfileId(settingsStore.settings, settingsStore.shells)) },
      { id: 'history', label: 'Terminal: Command history', detail: 'Open saved command history', icon: <Clock3 size={14} />, action: () => useCommandHistoryStore.getState().show() },
      { id: 'settings', label: 'Application: Settings', detail: 'Open TermFlow Lite settings', icon: <Settings size={14} />, action: () => settingsStore.openSettings() }
    ]
    const detected = (project?.tasks ?? []).map((task) => ({ ...task, detail: task.command, icon: <Code2 size={14} /> }))
    const detectedCommands = new Set(detected.map((item) => item.command))
    return [...detected, ...actions, ...COMMON_TASKS.filter((item) => !item.command || !detectedCommands.has(item.command))]
  }, [project])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return items.filter((item) => !needle || `${item.label} ${item.detail}`.toLowerCase().includes(needle))
  }, [items, query])

  useEffect(() => setSelected(0), [query])

  const execute = (item: PaletteItem | undefined): void => {
    if (!item) return
    hide()
    if (item.command && activeTabId) {
      window.termflow.pty.write(activeTabId, `${item.command}\r`)
      useTerminalStore.getState().setTabActivity(activeTabId, 'running')
    } else {
      item.action?.()
    }
  }

  return (
    <div className="palette-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) hide() }}>
      <section className="task-palette" role="dialog" aria-label="Command palette">
        <label className="palette-search"><Search size={15} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => Math.min(value + 1, filtered.length - 1)) }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => Math.max(value - 1, 0)) }
          else if (event.key === 'Enter') { event.preventDefault(); execute(filtered[selected]) }
          else if (event.key === 'Escape') { event.preventDefault(); hide() }
        }} placeholder="Type a task or command..." /></label>
        <div className="palette-results">
          {filtered.length === 0 && <div className="palette-empty">No matching tasks</div>}
          {filtered.map((item, index) => <button key={item.id} className={`palette-item${selected === index ? ' palette-item-selected' : ''}`} onMouseEnter={() => setSelected(index)} onClick={() => execute(item)}>{item.icon}<span><strong>{item.label}</strong><small>{item.detail}</small></span><Play size={12} /></button>)}
        </div>
        <footer className="palette-hint"><span>↑↓ Navigate</span><span>Enter Run</span><span>Esc Close</span>{project && <span>{project.technologies.join(' · ')}</span>}{cwd && <span className="palette-cwd">{cwd}</span>}</footer>
      </section>
    </div>
  )
}

import { CheckCircle2, Download, Play, RefreshCw, TriangleAlert, XCircle, Plus, Trash2, Timer, Power } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WorkspaceHealthCheck, TaskTriggerKind, ExitCodeFilter } from '../../../shared/types'
import { useAppStore } from '../store/appStore'
import AppHealthPanel from './AppHealthPanel'

export default function DeveloperCenter(): React.JSX.Element | null {
  const open = useAppStore((s) => s.developerCenterOpen)
  const setOpen = useAppStore((s) => s.setDeveloperCenterOpen)
  const [checks, setChecks] = useState<WorkspaceHealthCheck[]>([])
  const [loading, setLoading] = useState(false)
  const workspaceId = useAppStore((s) => s.activeWorkspaceId)
  const manifest = useAppStore((s) => s.projectManifest)
  const runTask = useAppStore((s) => s.runManifestTask)
  const pkgScripts = useAppStore((s) => s.pkgScripts)
  const packageManager = useAppStore((s) => s.packageManager)
  const runPkgScript = useAppStore((s) => s.runPkgScript)
  const nodes = useAppStore((s) => s.nodes)
  const taskTriggers = useAppStore((s) => s.taskTriggers)
  const saveTaskTrigger = useAppStore((s) => s.saveTaskTrigger)
  const deleteTaskTrigger = useAppStore((s) => s.deleteTaskTrigger)
  const toggleTaskTrigger = useAppStore((s) => s.toggleTaskTrigger)

  const [showAddTrigger, setShowAddTrigger] = useState(false)
  const [triggerName, setTriggerName] = useState('')
  const [triggerKind, setTriggerKind] = useState<TaskTriggerKind>('process_exit')
  const [triggerNodeId, setTriggerNodeId] = useState('')
  const [triggerExitFilter, setTriggerExitFilter] = useState<ExitCodeFilter>('any')
  const [triggerIntervalSec, setTriggerIntervalSec] = useState('60')
  const [triggerCommand, setTriggerCommand] = useState('')

  useEffect(() => {
    const openDeveloperCenter = (): void => setOpen(true)
    window.addEventListener('termflow:open-developer-center', openDeveloperCenter)
    return () => window.removeEventListener('termflow:open-developer-center', openDeveloperCenter)
  }, [])

  const refresh = async (): Promise<void> => {
    if (!workspaceId) return
    setLoading(true)
    try { setChecks(await window.termflow.workspaces.health(workspaceId)) } finally { setLoading(false) }
  }
  useEffect(() => { if (open) void refresh() }, [open, workspaceId])
  if (!workspaceId) return null
  if (!open) return null

  return (
    <aside className="developer-center">
      <div className="aap-head">
        <div><strong>Developer Center</strong><span>App health, tasks, runtimes &amp; workspace health</span></div>
        <button className="hbtn" title="Close Developer Center" aria-label="Close Developer Center" onClick={() => setOpen(false)}><XCircle size={15} /></button>
      </div>
      <AppHealthPanel />
      {(manifest?.tasks?.length ?? 0) > 0 && <div className="dev-section">
        <div className="dev-section-title">Project tasks</div>
        {manifest!.tasks!.map((task) => <button className="dev-task" key={task.name} onClick={() => runTask(task.name)}><Play size={12} /><span>{task.name}</span><em>{task.command}</em></button>)}
      </div>}
      {Object.keys(pkgScripts).length > 0 && <div className="dev-section">
        <div className="dev-section-title"><span>package.json scripts</span><em>{packageManager}</em></div>
        {Object.entries(pkgScripts).map(([name, command]) => (
          <button className="dev-task" key={name} onClick={() => runPkgScript(name)}>
            <Play size={12} /><span>{name}</span><em>{command}</em>
          </button>
        ))}
      </div>}
      <div className="dev-section">
        <div className="dev-section-title">
          <span>Task triggers</span>
          <button className="hbtn" title="Add task trigger" aria-label="Add task trigger" onClick={() => setShowAddTrigger((v) => !v)}><Plus size={14} /></button>
        </div>
        {taskTriggers.map((t) => (
          <div className="dev-task" key={t.id} style={{ cursor: 'default' }}>
            {t.kind === 'timer' ? <Timer size={12} /> : <Power size={12} />}
            <span>{t.name || (t.kind === 'timer' ? 'Timer' : 'On exit')}</span>
            <em>{t.command}</em>
            <button className="hbtn" title={t.enabled ? 'Disable' : 'Enable'} onClick={() => toggleTaskTrigger(t.id)} style={{ opacity: t.enabled ? 1 : 0.4 }}>
              <Power size={12} />
            </button>
            <button className="hbtn" title="Delete trigger" onClick={() => deleteTaskTrigger(t.id)} style={{ color: 'var(--danger)' }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {showAddTrigger && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
            <input placeholder="Trigger name" value={triggerName} onChange={(e) => setTriggerName(e.target.value)} />
            <select value={triggerKind} onChange={(e) => setTriggerKind(e.target.value as TaskTriggerKind)}>
              <option value="process_exit">When a terminal finishes (process exit)</option>
              <option value="timer">On a repeating timer</option>
            </select>
            {triggerKind === 'process_exit' ? (
              <>
                <select value={triggerNodeId} onChange={(e) => setTriggerNodeId(e.target.value)}>
                  <option value="">Select window…</option>
                  {nodes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
                </select>
                <select value={triggerExitFilter} onChange={(e) => setTriggerExitFilter(e.target.value as ExitCodeFilter)}>
                  <option value="any">Any exit code</option>
                  <option value="zero">Only success (exit 0)</option>
                  <option value="nonzero">Only failure (exit ≠ 0)</option>
                </select>
              </>
            ) : (
              <input type="number" min={5} placeholder="Interval (seconds)" value={triggerIntervalSec} onChange={(e) => setTriggerIntervalSec(e.target.value)} />
            )}
            <input placeholder="Command to run, e.g. npm test" value={triggerCommand} onChange={(e) => setTriggerCommand(e.target.value)} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn primary"
                disabled={!triggerCommand.trim() || (triggerKind === 'process_exit' && !triggerNodeId)}
                onClick={async () => {
                  await saveTaskTrigger({
                    name: triggerName || (triggerKind === 'timer' ? 'Timer' : 'On exit'),
                    kind: triggerKind,
                    enabled: true,
                    sourceNodeId: triggerKind === 'process_exit' ? triggerNodeId : undefined,
                    exitCodeFilter: triggerKind === 'process_exit' ? triggerExitFilter : undefined,
                    intervalMs: triggerKind === 'timer' ? Math.max(5, Number(triggerIntervalSec) || 60) * 1000 : undefined,
                    command: triggerCommand
                  })
                  setShowAddTrigger(false)
                  setTriggerName('')
                  setTriggerCommand('')
                }}
              >
                Add trigger
              </button>
              <button className="btn" onClick={() => setShowAddTrigger(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      <div className="dev-section">
        <div className="dev-section-title"><span>Workspace health</span><button className="hbtn" title="Refresh workspace health" aria-label="Refresh workspace health" disabled={loading} onClick={() => refresh()}><RefreshCw className={loading ? 'spin' : ''} size={14} /></button></div>
        {checks.map((check) => <div className={`health-row ${check.status}`} key={check.id}>{check.status === 'ok' ? <CheckCircle2 size={13} /> : <TriangleAlert size={13} />}<span>{check.label}</span><em title={check.detail}>{check.detail}</em></div>)}
      </div>
      <div className="dev-footer"><button className="btn" onClick={() => window.termflow.diagnostics.export(workspaceId)}><Download size={13} /> Export Diagnostics</button></div>
    </aside>
  )
}

import { FileJson, Play, X, CheckCircle2 } from 'lucide-react'
import { useAppStore } from '../store/appStore'

export default function ProjectManifestPanel(): React.JSX.Element | null {
  const manifest = useAppStore((s) => s.projectManifest)
  const applied = useAppStore((s) => s.projectManifestApplied)
  const apply = useAppStore((s) => s.applyProjectManifest)
  const dismiss = useAppStore((s) => s.dismissProjectManifest)
  const runTask = useAppStore((s) => s.runManifestTask)

  if (!manifest) return null

  const tasks = manifest.tasks ?? []
  const agents = manifest.agents ?? []
  const snippets = manifest.snippets ?? []
  const env = manifest.env ?? []

  return (
    <aside className="manifest-panel">
      <div className="mp-head">
        <FileJson size={15} />
        <div>
          <strong>{manifest.name || '.termflow.json'}</strong>
          <span>{tasks.length} tasks · {agents.length} agents · {snippets.length} snippets · {env.length} env</span>
        </div>
        <button className="hbtn" title="Dismiss manifest" onClick={dismiss}>
          <X size={14} />
        </button>
      </div>

      <div className="mp-actions">
        <button className="btn primary" disabled={applied} onClick={() => apply()}>
          {applied ? <CheckCircle2 size={14} /> : <FileJson size={14} />}
          {applied ? 'Applied' : 'Apply Manifest'}
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="mp-list">
          {tasks.slice(0, 8).map((task) => (
            <button key={task.name} className="mp-task" onClick={() => runTask(task.name)}>
              <Play size={13} />
              <span>{task.name}</span>
              <em>{task.command}</em>
            </button>
          ))}
        </div>
      )}
    </aside>
  )
}

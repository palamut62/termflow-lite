import { useState } from 'react'
import { openWorkspace, useWorkspaceStore } from '../store/workspaceStore'
import { useSettingsStore } from '../store/settingsStore'

export function WorkspaceSettings(): React.JSX.Element {
  const workspaces = useWorkspaceStore(s => s.workspaces)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  return <section><div className="settings-section-title">Project Workspaces</div>
    <p className="settings-note">Save visible split panes (or all tabs), folders, profiles, models and matching saved tasks. Opening adds tabs and keeps existing processes alive. Restored task schedules start paused.</p>
    <form onSubmit={e => { e.preventDefault(); try { useWorkspaceStore.getState().save(name); setName(''); setError('') } catch { setError('Workspace could not be saved. Check available storage.') } }}>
      <input className="settings-input" aria-label="Workspace name" placeholder="Project name" value={name} onChange={e => setName(e.target.value)} maxLength={100} />
      <button className="settings-btn" disabled={!name.trim()}>Save workspace</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {workspaces.map(w => <article className="profile-row" key={w.id}><div className="profile-row-info"><strong>{w.name}</strong><small>{w.session.tabs.length} tabs · {w.commands.length} tasks · {new Date(w.savedAt).toLocaleString()}</small></div>
      <button className="settings-btn" onClick={() => { openWorkspace(w); useSettingsStore.getState().closeSettings() }}>Open workspace</button>
      <button className="settings-btn" onClick={() => { try { useWorkspaceStore.getState().remove(w.id) } catch { setError('Workspace could not be removed.') } }}>Delete</button>
    </article>)}
  </section>
}

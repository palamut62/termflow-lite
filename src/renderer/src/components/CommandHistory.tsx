import { useMemo, useState } from 'react'
import { Clock3, Folder, Play, Search, Trash2, X } from 'lucide-react'
import { useCommandHistoryStore } from '../store/commandHistoryStore'
import { useTerminalStore } from '../store/terminalStore'

export function CommandHistory(): React.JSX.Element {
  const entries = useCommandHistoryStore((state) => state.entries)
  const hide = useCommandHistoryStore((state) => state.hide)
  const [query, setQuery] = useState('')
  const [profile, setProfile] = useState('all')
  const [confirmClear, setConfirmClear] = useState(false)
  const profiles = useMemo(() => [...new Set(entries.map((entry) => entry.profileName))], [entries])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return entries.filter((entry) =>
      (profile === 'all' || entry.profileName === profile) &&
      (!needle || `${entry.command} ${entry.cwd} ${entry.profileName}`.toLowerCase().includes(needle)))
  }, [entries, profile, query])

  const run = (command: string): void => {
    const activeTabId = useTerminalStore.getState().activeTabId
    if (!activeTabId) return
    window.termflow.pty.write(activeTabId, `${command}\r`)
    useTerminalStore.getState().setTabActivity(activeTabId, 'running')
    hide()
  }

  return (
    <aside className="history-panel" aria-label="Command history">
      <header className="history-header">
        <span><Clock3 size={15} /> Command History</span>
        <button className="history-icon-btn" onClick={hide} aria-label="Close command history"><X size={15} /></button>
      </header>
      <div className="history-toolbar">
        <label className="history-search"><Search size={13} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search commands, folders..." /></label>
        <select value={profile} onChange={(event) => setProfile(event.target.value)} aria-label="Filter command profile">
          <option value="all">All profiles</option>
          {profiles.map((name) => <option value={name} key={name}>{name}</option>)}
        </select>
      </div>
      <div className="history-list">
        {filtered.length === 0 && <div className="history-empty">No matching commands</div>}
        {filtered.map((entry) => (
          <article className="history-entry" key={entry.id}>
            <button className="history-command" onClick={() => run(entry.command)} title="Run in active terminal"><code>{entry.command}</code><Play size={13} /></button>
            <div className="history-meta"><span>{entry.profileName}</span><span title={entry.cwd}><Folder size={11} />{entry.cwd || 'Unknown folder'}</span><time>{new Date(entry.timestamp).toLocaleString()}</time></div>
            <button className="history-delete" onClick={() => useCommandHistoryStore.getState().remove(entry.id)} aria-label={`Delete ${entry.command}`}><Trash2 size={12} /></button>
          </article>
        ))}
      </div>
      <footer className="history-footer">
        {confirmClear ? <><span>Clear all history?</span><button onClick={() => { useCommandHistoryStore.getState().clear(); setConfirmClear(false) }}>Clear</button><button onClick={() => setConfirmClear(false)}>Cancel</button></> : <button onClick={() => setConfirmClear(true)} disabled={entries.length === 0}><Trash2 size={12} /> Clear history</button>}
      </footer>
    </aside>
  )
}

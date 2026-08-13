import { useState } from 'react'
import { Bookmark, Check, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react'
import { useSavedCommandStore } from '../store/savedCommandStore'
import { useTerminalStore } from '../store/terminalStore'

export function SavedCommands(): React.JSX.Element {
  const commands = useSavedCommandStore((state) => state.commands)
  const hide = useSavedCommandStore((state) => state.hide)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const needle = query.trim().toLowerCase()
  const filtered = commands.filter((item) => !needle || `${item.name} ${item.command}`.toLowerCase().includes(needle))

  const resetForm = (): void => {
    setName('')
    setCommand('')
    setEditingId(null)
  }

  const save = (event: React.FormEvent): void => {
    event.preventDefault()
    const saved = editingId
      ? useSavedCommandStore.getState().update(editingId, name, command)
      : useSavedCommandStore.getState().add(name, command)
    if (saved) resetForm()
  }

  const edit = (id: string): void => {
    const item = commands.find((candidate) => candidate.id === id)
    if (!item) return
    setEditingId(id)
    setName(item.name)
    setCommand(item.command)
  }

  const run = (value: string): void => {
    const activeTabId = useTerminalStore.getState().activeTabId
    if (!activeTabId) return
    window.termflow.pty.write(activeTabId, `${value}\r`)
    useTerminalStore.getState().setTabActivity(activeTabId, 'running')
  }

  return (
    <aside className="history-panel saved-commands-panel" aria-label="Saved commands">
      <header className="history-header">
        <span><Bookmark size={15} /> Saved Commands</span>
        <button className="history-icon-btn" onClick={hide} aria-label="Close saved commands"><X size={15} /></button>
      </header>
      <form className="saved-command-form" onSubmit={save}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name (for example: Claude update)" aria-label="Command name" />
        <div className="saved-command-input-row">
          <input autoFocus value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Command (for example: claude update)" aria-label="Command" />
          <button type="submit" disabled={!command.trim()} title={editingId ? 'Save changes' : 'Add command'}>
            {editingId ? <Check size={14} /> : <Plus size={14} />}{editingId ? 'Save' : 'Add'}
          </button>
          {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
        </div>
      </form>
      <label className="history-search saved-command-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search saved commands..." /></label>
      <div className="history-list">
        {filtered.length === 0 && <div className="history-empty">{commands.length === 0 ? 'No saved commands yet' : 'No matching commands'}</div>}
        {filtered.map((item) => (
          <article className="saved-command-entry" key={item.id}>
            <div className="saved-command-copy"><strong>{item.name}</strong><code title={item.command}>{item.command}</code></div>
            <div className="saved-command-actions">
              <button onClick={() => run(item.command)} title="Run in active terminal" aria-label={`Run ${item.name}`}><Play size={14} /></button>
              <button onClick={() => edit(item.id)} title="Edit command" aria-label={`Edit ${item.name}`}><Pencil size={13} /></button>
              <button onClick={() => useSavedCommandStore.getState().remove(item.id)} title="Delete command" aria-label={`Delete ${item.name}`}><Trash2 size={13} /></button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  )
}

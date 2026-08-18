import { useState } from 'react'
import { Bookmark, Check, Pencil, Play, Plus, Search, Trash2, X } from 'lucide-react'
import { useSavedCommandStore } from '../store/savedCommandStore'
import { describeSchedule, nextRunAt, type CommandSchedule } from '../store/commandSchedule'
import { useTerminalStore } from '../store/terminalStore'
import { useSettingsStore } from '../store/settingsStore'
import { mergeProfiles, providerProfileId } from '../../../shared/profiles'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function SavedCommands(): React.JSX.Element {
  const commands = useSavedCommandStore((state) => state.commands)
  const hide = useSavedCommandStore((state) => state.hide)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [profileId, setProfileId] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scheduleKind, setScheduleKind] = useState<'none' | CommandSchedule['kind']>('none')
  const [scheduleTime, setScheduleTime] = useState('09:00')
  const [scheduleWeekday, setScheduleWeekday] = useState(1)
  const [scheduleMinutes, setScheduleMinutes] = useState(30)
  const shells = useSettingsStore((state) => state.shells)
  const settings = useSettingsStore((state) => state.settings)
  const profiles = mergeProfiles(settings.profiles)
  const targetNames = new Map([
    ...shells.map((item) => [item.id, item.name] as const),
    ...profiles.map((item) => [item.id, item.name] as const),
    ...settings.providerProfiles.map((item) => [providerProfileId(item.id), item.name] as const)
  ])
  const needle = query.trim().toLowerCase()
  const filtered = commands.filter((item) => !needle || `${item.name} ${item.command}`.toLowerCase().includes(needle))

  const resetForm = (): void => {
    setName('')
    setCommand('')
    setProfileId('')
    setEditingId(null)
    setScheduleKind('none')
    setScheduleTime('09:00')
    setScheduleWeekday(1)
    setScheduleMinutes(30)
  }

  const buildSchedule = (): CommandSchedule | null => {
    if (scheduleKind === 'daily') return { kind: 'daily', time: scheduleTime }
    if (scheduleKind === 'weekly') return { kind: 'weekly', time: scheduleTime, weekday: scheduleWeekday }
    if (scheduleKind === 'interval') return { kind: 'interval', minutes: scheduleMinutes }
    return null
  }

  const save = (event: React.FormEvent): void => {
    event.preventDefault()
    const schedule = buildSchedule()
    const saved = editingId
      ? useSavedCommandStore.getState().update(editingId, name, command, profileId, schedule)
      : useSavedCommandStore.getState().add(name, command, profileId, schedule)
    if (saved) resetForm()
  }

  const edit = (id: string): void => {
    const item = commands.find((candidate) => candidate.id === id)
    if (!item) return
    setEditingId(id)
    setName(item.name)
    setCommand(item.command)
    setProfileId(item.profileId)
    setScheduleKind(item.schedule?.kind ?? 'none')
    if (item.schedule?.kind === 'daily' || item.schedule?.kind === 'weekly') setScheduleTime(item.schedule.time)
    if (item.schedule?.kind === 'weekly') setScheduleWeekday(item.schedule.weekday)
    if (item.schedule?.kind === 'interval') setScheduleMinutes(item.schedule.minutes)
  }

  const run = (value: string, targetProfileId: string): void => {
    if (!targetProfileId || !targetNames.has(targetProfileId)) return
    useTerminalStore.getState().addTab(targetProfileId, true, undefined, value)
    hide()
  }

  return (
    <aside className="history-panel saved-commands-panel" aria-label="Saved commands">
      <header className="history-header">
        <span><Bookmark size={15} /> Saved Commands</span>
        <button className="history-icon-btn" onClick={hide} aria-label="Close saved commands"><X size={15} /></button>
      </header>
      <form className="saved-command-form" onSubmit={save}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name (for example: Claude update)" aria-label="Command name" />
        <select value={profileId} onChange={(event) => setProfileId(event.target.value)} aria-label="Run command in">
          <option value="">Select shell or agent...</option>
          {shells.length > 0 && <optgroup label="Shells">{shells.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</optgroup>}
          {profiles.length > 0 && <optgroup label="Agents and profiles">{profiles.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</optgroup>}
          {settings.providerProfiles.length > 0 && <optgroup label="Providers">{settings.providerProfiles.map((item) => <option value={providerProfileId(item.id)} key={item.id}>{item.name}</option>)}</optgroup>}
        </select>
        <div className="saved-command-schedule-row">
          <select value={scheduleKind} onChange={(event) => setScheduleKind(event.target.value as typeof scheduleKind)} aria-label="Schedule type">
            <option value="none">No schedule</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="interval">Every N minutes</option>
          </select>
          {scheduleKind === 'weekly' && (
            <select value={scheduleWeekday} onChange={(event) => setScheduleWeekday(Number(event.target.value))} aria-label="Schedule weekday">
              {WEEKDAYS.map((label, index) => <option value={index} key={label}>{label}</option>)}
            </select>
          )}
          {(scheduleKind === 'daily' || scheduleKind === 'weekly') && (
            <input type="time" value={scheduleTime} onChange={(event) => setScheduleTime(event.target.value)} aria-label="Schedule time" />
          )}
          {scheduleKind === 'interval' && (
            <input type="number" min={1} max={44640} value={scheduleMinutes} onChange={(event) => setScheduleMinutes(Math.max(1, Math.round(Number(event.target.value) || 1)))} aria-label="Schedule interval in minutes" />
          )}
        </div>
        <div className="saved-command-input-row">
          <input autoFocus value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Command (for example: claude update)" aria-label="Command" />
          <button type="submit" disabled={!command.trim() || !profileId} title={editingId ? 'Save changes' : 'Add command'}>
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
            <div className="saved-command-copy"><strong>{item.name}</strong><code title={item.command}>{item.command}</code><small>{targetNames.get(item.profileId) ?? 'Select a target to run'}</small>{item.schedule && <small className="saved-command-schedule">{describeSchedule(item.schedule)} · Next: {new Date(nextRunAt(item.schedule, item.lastRunAt ?? item.scheduleAnchor ?? Date.now(), Date.now())).toLocaleString()}</small>}</div>
            <div className="saved-command-actions">
              <button onClick={() => run(item.command, item.profileId)} disabled={!targetNames.has(item.profileId)} title="Run in a new terminal" aria-label={`Run ${item.name}`}><Play size={14} /></button>
              <button onClick={() => edit(item.id)} title="Edit command" aria-label={`Edit ${item.name}`}><Pencil size={13} /></button>
              <button onClick={() => useSavedCommandStore.getState().remove(item.id)} title="Delete command" aria-label={`Delete ${item.name}`}><Trash2 size={13} /></button>
            </div>
          </article>
        ))}
      </div>
    </aside>
  )
}

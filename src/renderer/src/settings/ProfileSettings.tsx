import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { TerminalProfile } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { Field, TextInput } from './Settings'

interface EnvRow {
  key: string
  value: string
}

interface ProfileDraft {
  name: string
  command: string
  args: string
  cwd: string
  icon: string
  env: EnvRow[]
}

const emptyDraft = (): ProfileDraft => ({ name: '', command: '', args: '', cwd: '', icon: '', env: [] })

function toDraft(p: TerminalProfile): ProfileDraft {
  return {
    name: p.name,
    command: p.command,
    args: (p.args ?? []).join(' '),
    cwd: p.cwd ?? '',
    icon: p.icon ?? '',
    env: Object.entries(p.env ?? {}).map(([key, value]) => ({ key, value }))
  }
}

function fromDraft(d: ProfileDraft, id: string): TerminalProfile {
  const args = d.args.trim() ? d.args.trim().split(/\s+/) : undefined
  const env: Record<string, string> = {}
  for (const row of d.env) {
    const key = row.key.trim()
    if (key) env[key] = row.value
  }
  return {
    id,
    name: d.name.trim(),
    command: d.command.trim(),
    args,
    cwd: d.cwd.trim() || undefined,
    icon: d.icon.trim() || undefined,
    env: Object.keys(env).length > 0 ? env : undefined
  }
}

/** Custom profiller (PRD §36): ekle/düzenle/sil; silme onay istemez. */
export function ProfileSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft())

  const editing = editingId !== null || creating

  const startEdit = (p: TerminalProfile): void => {
    setEditingId(p.id)
    setCreating(false)
    setDraft(toDraft(p))
  }

  const startCreate = (): void => {
    setEditingId(null)
    setCreating(true)
    setDraft(emptyDraft())
  }

  const cancel = (): void => {
    setEditingId(null)
    setCreating(false)
  }

  const save = (): void => {
    if (!draft.name.trim() || !draft.command.trim()) return
    const id = editingId ?? nanoid(10)
    const payload = fromDraft(draft, id)
    const profiles = editingId
      ? settings.profiles.map((p) => (p.id === editingId ? payload : p))
      : [...settings.profiles, payload]
    // defaultProfileId'ye dokunulmaz — yeni profil otomatik default olmaz.
    void update({ profiles })
    cancel()
  }

  const remove = (id: string): void => {
    void update({ profiles: settings.profiles.filter((p) => p.id !== id) })
    if (editingId === id) cancel()
  }

  const setEnv = (idx: number, patch: Partial<EnvRow>): void => {
    setDraft((d) => ({ ...d, env: d.env.map((row, i) => (i === idx ? { ...row, ...patch } : row)) }))
  }

  const addEnv = (): void => setDraft((d) => ({ ...d, env: [...d.env, { key: '', value: '' }] }))
  const removeEnv = (idx: number): void => setDraft((d) => ({ ...d, env: d.env.filter((_, i) => i !== idx) }))

  const valid = draft.name.trim().length > 0 && draft.command.trim().length > 0

  return (
    <section>
      <div className="settings-section-title">Custom Profiles</div>
      {settings.profiles.length === 0 && !editing && (
        <div className="settings-empty">Henüz özel profil yok — aşağıdan ekleyebilirsiniz.</div>
      )}

      {settings.profiles.map(
        (p) =>
          editingId !== p.id && (
            <div className="profile-row" key={p.id}>
              <span className="profile-row-icon">{p.icon ?? '▸'}</span>
              <span className="profile-row-info">
                <span className="profile-row-name">{p.name}</span>
                <span className="profile-row-command">{p.command}</span>
              </span>
              <button className="settings-btn settings-btn-small" onClick={() => startEdit(p)}>
                Edit
              </button>
              <button className="settings-btn settings-btn-small settings-btn-danger" onClick={() => remove(p.id)} aria-label={`Delete ${p.name}`}>
                <Trash2 size={12} />
              </button>
            </div>
          )
      )}

      {editing && (
        <div className="profile-form">
          <Field label="Name">
            <TextInput value={draft.name} placeholder="My Terminal" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Command" hint="zorunlu">
            <TextInput
              className="settings-input-wide"
              value={draft.command}
              placeholder="C:\path\app.exe"
              onChange={(e) => setDraft({ ...draft, command: e.target.value })}
            />
          </Field>
          <Field label="Arguments" hint="space-separated">
            <TextInput
              className="settings-input-wide"
              value={draft.args}
              placeholder="--flag arg1"
              onChange={(e) => setDraft({ ...draft, args: e.target.value })}
            />
          </Field>
          <Field label="Starting Directory">
            <TextInput
              className="settings-input-wide"
              value={draft.cwd}
              placeholder="C:\work"
              onChange={(e) => setDraft({ ...draft, cwd: e.target.value })}
            />
          </Field>
          <Field label="Icon" hint="emoji veya tek karakter">
            <TextInput
              className="settings-input-narrow"
              value={draft.icon}
              placeholder="🐚"
              onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
            />
          </Field>
          <div className="settings-field">
            <div className="settings-field-info">
              <div className="settings-field-label">Environment Variables</div>
            </div>
            <div className="settings-env-list">
              {draft.env.map((row, i) => (
                <div className="settings-env-row" key={i}>
                  <TextInput
                    className="settings-input-env-key"
                    value={row.key}
                    placeholder="KEY"
                    onChange={(e) => setEnv(i, { key: e.target.value })}
                  />
                  <TextInput
                    className="settings-input-env-value"
                    value={row.value}
                    placeholder="value"
                    onChange={(e) => setEnv(i, { value: e.target.value })}
                  />
                  <button className="settings-icon-btn" onClick={() => removeEnv(i)} aria-label="Remove variable">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
              <button className="settings-btn settings-btn-small" onClick={addEnv}>
                <Plus size={12} /> Add variable
              </button>
            </div>
          </div>
          <div className="profile-form-actions">
            <button className="settings-btn settings-btn-primary" disabled={!valid} onClick={save}>
              Save
            </button>
            <button className="settings-btn" onClick={cancel}>
              Cancel
            </button>
            {editingId && (
              <button className="settings-btn settings-btn-danger" onClick={() => remove(editingId)}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {!editing && (
        <button className="settings-btn settings-btn-primary" onClick={startCreate}>
          <Plus size={12} /> Add Profile
        </button>
      )}
    </section>
  )
}

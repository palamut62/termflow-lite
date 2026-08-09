import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { TerminalProfile } from '../../../shared/types'
import { BUILTIN_PROFILES, defaultFullPermissionArgs } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { Field, TextInput, Toggle } from './Settings'

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
  startupCommand: string
  model: string
  color: string
  fullPermissions: boolean
  fullPermissionArgs: string
  env: EnvRow[]
}

const emptyDraft = (): ProfileDraft => ({
  name: '',
  command: '',
  args: '',
  cwd: '',
  icon: '',
  startupCommand: '',
  model: '',
  color: '',
  fullPermissions: true,
  fullPermissionArgs: '',
  env: []
})

function toDraft(p: TerminalProfile): ProfileDraft {
  return {
    name: p.name,
    command: p.command,
    args: (p.args ?? []).join(' '),
    cwd: p.cwd ?? '',
    icon: p.icon ?? '',
    startupCommand: p.startupCommand ?? '',
    model: p.model ?? '',
    color: p.color ?? '',
    fullPermissions: p.fullPermissions !== false,
    fullPermissionArgs: p.fullPermissionArgs ?? defaultFullPermissionArgs(p.startupCommand || p.command),
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
    startupCommand: d.startupCommand.trim() || undefined,
    model: d.model.trim() || undefined,
    color: d.color.trim() || undefined,
    fullPermissions: d.fullPermissions,
    fullPermissionArgs: d.fullPermissionArgs.trim() || undefined,
    env: Object.keys(env).length > 0 ? env : undefined
  }
}

/**
 * Geçerlilik: ad zorunlu; komut VEYA startup command'dan en az biri gerekir —
 * komut boş bırakılınca profil platformun varsayılan kabuğunda açılıp startup
 * command ile başlatılır (CLI ajan profilleri).
 */
function isValid(d: ProfileDraft): boolean {
  return d.name.trim().length > 0 && (d.command.trim().length > 0 || d.startupCommand.trim().length > 0)
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
    if (!isValid(draft)) return
    const id = editingId ?? nanoid(10)
    const payload = fromDraft(draft, id)
    const exists = editingId ? settings.profiles.some((p) => p.id === editingId) : false
    const profiles = exists
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

  const valid = isValid(draft)
  const builtinIds = new Set(BUILTIN_PROFILES.map((profile) => profile.id))
  const effectiveBuiltins = BUILTIN_PROFILES.map(
    (profile) => settings.profiles.find((candidate) => candidate.id === profile.id) ?? profile
  )
  const customProfiles = settings.profiles.filter((profile) => !builtinIds.has(profile.id))

  return (
    <section>
      <div className="settings-section-title">Command Profiles</div>
      <p className="settings-note">Built-in command profiles launch with full permissions by default. Edit any profile to disable it or change its CLI-specific permission arguments.</p>
      {effectiveBuiltins.map((p) => editingId !== p.id && (
        <div className="profile-row" key={p.id}>
          <span className="menu-item-dot" style={{ background: p.color || '#6467f2' }} />
          <span className="profile-row-info">
            <span className="profile-row-name">{p.name}</span>
            <span className="profile-row-command">{p.startupCommand}{p.model ? ` · ${p.model}` : ''} · {p.fullPermissions !== false ? 'Full permissions' : 'Standard permissions'}</span>
          </span>
          <button className="settings-btn settings-btn-small" onClick={() => startEdit(p)}>Edit</button>
        </div>
      ))}
      <div className="settings-section-title">Custom Profiles</div>
      {customProfiles.length === 0 && !editing && (
        <div className="settings-empty">Henüz özel profil yok — aşağıdan ekleyebilirsiniz.</div>
      )}

      {customProfiles.map(
        (p) =>
          editingId !== p.id && (
            <div className="profile-row" key={p.id}>
              <span className="profile-row-icon">{p.icon ?? '▸'}</span>
              <span className="profile-row-info">
                <span className="profile-row-name">{p.name}</span>
                <span className="profile-row-command">{p.command || p.startupCommand}</span>
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
          <Field label="Command" hint="boşsa varsayılan kabuk">
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
          <Field label="Startup Command" hint="kabuk hazır olunca yazılır">
            <TextInput
              className="settings-input-wide"
              value={draft.startupCommand}
              placeholder="claude"
              onChange={(e) => setDraft({ ...draft, startupCommand: e.target.value })}
            />
          </Field>
          <Field label="Color" hint="#rrggbb — sekme/menü noktası">
            <TextInput
              className="settings-input-narrow"
              value={draft.color}
              placeholder="#d97757"
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            />
          </Field>
          <Field label="Default Model" hint="boşsa CLI varsayılanı; --model ile aktarılır">
            <TextInput
              className="settings-input-wide"
              value={draft.model}
              placeholder="opus"
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </Field>
          <Field label="Full Permissions" hint="approval/sandbox kontrollerini CLI argümanıyla kapatır">
            <Toggle checked={draft.fullPermissions} onChange={(fullPermissions) => setDraft({ ...draft, fullPermissions })} label="Command profile full permissions" />
          </Field>
          <Field label="Permission Arguments" hint="Claude, Codex ve OpenCode için varsayılan gelir">
            <TextInput
              className="settings-input-wide"
              value={draft.fullPermissionArgs}
              placeholder="--dangerously-skip-permissions"
              onChange={(e) => setDraft({ ...draft, fullPermissionArgs: e.target.value })}
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
            {editingId && !builtinIds.has(editingId) && (
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

import { useState } from 'react'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { SshConnection } from '../../../shared/types'
import { sshTarget, validateSshConnection } from '../../../shared/sshArgs'
import { useSettingsStore } from '../store/settingsStore'
import { Field, TextInput, Toggle } from './Settings'

interface SshDraft {
  name: string
  host: string
  user: string
  port: string
  identityFile: string
  jumpHost: string
  remoteCwd: string
  remoteCommand: string
  forwardAgent: boolean
  extraArgs: string
  color: string
}

const emptyDraft = (): SshDraft => ({
  name: '',
  host: '',
  user: '',
  port: '',
  identityFile: '',
  jumpHost: '',
  remoteCwd: '',
  remoteCommand: '',
  forwardAgent: false,
  extraArgs: '',
  color: ''
})

function toDraft(c: SshConnection): SshDraft {
  return {
    name: c.name,
    host: c.host,
    user: c.user ?? '',
    port: c.port ? String(c.port) : '',
    identityFile: c.identityFile ?? '',
    jumpHost: c.jumpHost ?? '',
    remoteCwd: c.remoteCwd ?? '',
    remoteCommand: c.remoteCommand ?? '',
    forwardAgent: c.forwardAgent === true,
    extraArgs: c.extraArgs ?? '',
    color: c.color ?? ''
  }
}

function fromDraft(d: SshDraft, id: string): SshConnection {
  const port = Number.parseInt(d.port.trim(), 10)
  return {
    id,
    name: d.name.trim(),
    host: d.host.trim(),
    user: d.user.trim() || undefined,
    port: Number.isFinite(port) ? port : undefined,
    identityFile: d.identityFile.trim() || undefined,
    jumpHost: d.jumpHost.trim() || undefined,
    remoteCwd: d.remoteCwd.trim() || undefined,
    remoteCommand: d.remoteCommand.trim() || undefined,
    forwardAgent: d.forwardAgent || undefined,
    extraArgs: d.extraArgs.trim() || undefined,
    color: d.color.trim() || undefined
  }
}

/**
 * Kayıtlı SSH bağlantıları (ProfileSettings ile aynı liste + form üslubu).
 * PAROLA ALANI YOKTUR ve hiçbir kimlik bilgisi saklanmaz: bağlantı sistemdeki
 * OpenSSH istemcisiyle kurulur, kimlik doğrulama anahtar/ssh-agent/~/.ssh/config
 * üzerinden yapılır.
 */
export function SshSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const connections = settings.sshConnections ?? []

  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<SshDraft>(emptyDraft())
  const [error, setError] = useState<string | null>(null)

  const editing = editingId !== null || creating

  const startEdit = (c: SshConnection): void => {
    setEditingId(c.id)
    setCreating(false)
    setDraft(toDraft(c))
    setError(null)
  }

  const startCreate = (): void => {
    setEditingId(null)
    setCreating(true)
    setDraft(emptyDraft())
    setError(null)
  }

  const cancel = (): void => {
    setEditingId(null)
    setCreating(false)
    setError(null)
  }

  const save = (): void => {
    if (!draft.name.trim()) {
      setError('Name is required.')
      return
    }
    const id = editingId ?? nanoid(10)
    const payload = fromDraft(draft, id)
    const problem = validateSshConnection(payload)
    if (problem) {
      setError(problem)
      return
    }
    const exists = editingId ? connections.some((c) => c.id === editingId) : false
    const sshConnections = exists
      ? connections.map((c) => (c.id === editingId ? payload : c))
      : [...connections, payload]
    void update({ sshConnections })
    cancel()
  }

  const remove = (id: string): void => {
    void update({ sshConnections: connections.filter((c) => c.id !== id) })
    if (editingId === id) cancel()
  }

  return (
    <section>
      <div className="settings-section-title">SSH Connections</div>
      <p className="settings-note">
        Passwords are never stored. Use key-based authentication or ssh-agent — connections run through your
        system OpenSSH client, so ~/.ssh/config and known_hosts host key verification still apply.
      </p>

      {connections.length === 0 && !editing && (
        <div className="settings-empty">Henüz SSH bağlantısı yok — aşağıdan ekleyebilirsiniz.</div>
      )}

      {connections.map(
        (c) =>
          editingId !== c.id && (
            <div className="profile-row" key={c.id}>
              <span className="menu-item-dot" style={{ background: c.color || '#6467f2' }} />
              <span className="profile-row-info">
                <span className="profile-row-name">{c.name}</span>
                <span className="profile-row-command">
                  {sshTarget(c)}{c.port && c.port !== 22 ? `:${c.port}` : ''}{c.jumpHost ? ` · via ${c.jumpHost}` : ''}
                </span>
              </span>
              <button className="settings-btn settings-btn-small" onClick={() => startEdit(c)}>
                Edit
              </button>
              <button
                className="settings-btn settings-btn-small settings-btn-danger"
                onClick={() => remove(c.id)}
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 size={12} />
              </button>
            </div>
          )
      )}

      {editing && (
        <div className="profile-form">
          <Field label="Name">
            <TextInput value={draft.name} placeholder="Production" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="Host">
            <TextInput
              className="settings-input-wide"
              value={draft.host}
              placeholder="server.example.com"
              onChange={(e) => setDraft({ ...draft, host: e.target.value })}
            />
          </Field>
          <Field label="User" hint="boşsa ~/.ssh/config veya yerel kullanıcı">
            <TextInput value={draft.user} placeholder="deploy" onChange={(e) => setDraft({ ...draft, user: e.target.value })} />
          </Field>
          <Field label="Port" hint="boş = 22">
            <TextInput
              className="settings-input-narrow"
              value={draft.port}
              placeholder="22"
              onChange={(e) => setDraft({ ...draft, port: e.target.value })}
            />
          </Field>
          <Field label="Identity File" hint="boşsa ssh-agent / ~/.ssh/config">
            <span className="settings-inline">
              <TextInput
                className="settings-input-wide"
                value={draft.identityFile}
                placeholder="~/.ssh/id_ed25519"
                onChange={(e) => setDraft({ ...draft, identityFile: e.target.value })}
              />
              <button
                className="settings-btn settings-btn-small"
                onClick={async () => {
                  const path = await window.termflow.dialog.openFile()
                  if (path) setDraft((d) => ({ ...d, identityFile: path }))
                }}
              >
                <FolderOpen size={12} /> Browse
              </button>
            </span>
          </Field>
          <Field label="Jump Host" hint="ProxyJump (-J), ör. user@bastion">
            <TextInput
              className="settings-input-wide"
              value={draft.jumpHost}
              placeholder="user@bastion"
              onChange={(e) => setDraft({ ...draft, jumpHost: e.target.value })}
            />
          </Field>
          <Field label="Remote Directory" hint="bağlantı sonrası cd edilir">
            <TextInput
              className="settings-input-wide"
              value={draft.remoteCwd}
              placeholder="/srv/app"
              onChange={(e) => setDraft({ ...draft, remoteCwd: e.target.value })}
            />
          </Field>
          <Field label="Remote Command" hint="bağlanınca uzak kabukta çalışır">
            <TextInput
              className="settings-input-wide"
              value={draft.remoteCommand}
              placeholder="tmux attach"
              onChange={(e) => setDraft({ ...draft, remoteCommand: e.target.value })}
            />
          </Field>
          <Field label="Forward Agent" hint="ssh-agent'ı uzak makineye iletir — yalnızca güvendiğiniz sunucularda açın">
            <Toggle
              checked={draft.forwardAgent}
              onChange={(forwardAgent) => setDraft({ ...draft, forwardAgent })}
              label="Forward ssh-agent"
            />
          </Field>
          <Field label="Extra Arguments" hint="space-separated ssh argümanları">
            <TextInput
              className="settings-input-wide"
              value={draft.extraArgs}
              placeholder="-o ServerAliveInterval=30"
              onChange={(e) => setDraft({ ...draft, extraArgs: e.target.value })}
            />
          </Field>
          <Field label="Color" hint="#rrggbb — sekme/menü noktası">
            <TextInput
              className="settings-input-narrow"
              value={draft.color}
              placeholder="#6467f2"
              onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            />
          </Field>
          {error && <div className="settings-error" role="alert">{error}</div>}
          <div className="profile-form-actions">
            <button className="settings-btn settings-btn-primary" onClick={save}>
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
          <Plus size={12} /> Add Connection
        </button>
      )}
    </section>
  )
}

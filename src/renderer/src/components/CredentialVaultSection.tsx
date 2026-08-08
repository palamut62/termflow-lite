import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, X } from 'lucide-react'
import type { CredentialMeta } from '../../../shared/types'

interface Props {
  activeWorkspaceId: string | null
}

const ENV_KEY_RE = /^[A-Z_][A-Z0-9_]*$/i

// Credential vault UI (PRD §17.2). Values live encrypted in the OS keychain via
// safeStorage in the main process — only metadata ever reaches the renderer.
export default function CredentialVaultSection({ activeWorkspaceId }: Props): React.JSX.Element {
  const [items, setItems] = useState<CredentialMeta[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('')
  const [envKey, setEnvKey] = useState('')
  const [secret, setSecret] = useState('')
  const [scope, setScope] = useState<'workspace' | 'global'>('global')
  const [error, setError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async (): Promise<void> => {
    const next = await window.termflow.vault.list(activeWorkspaceId || undefined)
    setItems(next)
  }, [activeWorkspaceId])

  useEffect(() => {
    reload()
  }, [reload])

  const resetForm = (): void => {
    setEditingId(null)
    setName('')
    setProvider('')
    setEnvKey('')
    setSecret('')
    setScope(activeWorkspaceId ? 'workspace' : 'global')
    setError('')
  }

  const startEdit = (item: CredentialMeta): void => {
    setEditingId(item.id)
    setName(item.name)
    setProvider(item.provider)
    setEnvKey(item.envKey)
    setSecret('')
    setScope(item.workspaceId ? 'workspace' : 'global')
    setError('')
    setConfirmId(null)
  }

  const submit = async (): Promise<void> => {
    if (!name.trim()) return setError('Name is required.')
    if (!ENV_KEY_RE.test(envKey.trim())) return setError('Environment variable name must look like API_KEY.')
    // The main process replaces the stored secret on every save, so an empty
    // value would wipe the existing one — refuse instead of silently clearing.
    if (!secret) return setError(editingId ? 'Enter the new secret value to save this credential.' : 'Secret value is required.')
    if (scope === 'workspace' && !activeWorkspaceId) return setError('Open a workspace first, or store this credential globally.')
    setBusy(true)
    try {
      await window.termflow.vault.save({
        id: editingId || undefined,
        name: name.trim(),
        provider: provider.trim(),
        envKey: envKey.trim(),
        workspaceId: scope === 'workspace' ? activeWorkspaceId : null,
        value: secret
      })
      setSecret('') // drop the secret from React state as soon as it is stored
      resetForm()
      await reload()
    } catch {
      // Never surface the raw error: it can echo the submitted payload.
      setSecret('')
      setError('Could not save the credential. OS encryption may be unavailable.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <KeyRound size={13} /> Workspace Environment / Credentials
      </label>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>
        Values are encrypted with the operating system keychain (safeStorage) and injected as environment
        variables into new terminals. They are never written into provider profiles and never shown again.
      </p>

      <div className="vault-form">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (DeepSeek key)" autoComplete="off" />
        <input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="Provider (deepseek)" autoComplete="off" />
        <input value={envKey} onChange={(e) => setEnvKey(e.target.value)} placeholder="Env variable (DEEPSEEK_API_KEY)" autoComplete="off" spellCheck={false} />
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={editingId ? 'New secret value (required)' : 'Secret value'}
          autoComplete="off"
          spellCheck={false}
        />
        <label>
          <input type="radio" name="vault-scope" checked={scope === 'global'} onChange={() => setScope('global')} />
          Global (all workspaces)
        </label>
        <label style={{ opacity: activeWorkspaceId ? 1 : 0.5 }}>
          <input type="radio" name="vault-scope" disabled={!activeWorkspaceId} checked={scope === 'workspace'} onChange={() => setScope('workspace')} />
          This workspace only
        </label>
        <div style={{ display: 'flex', gap: 6, gridColumn: '1 / -1' }}>
          <button className="btn primary" disabled={busy} onClick={submit}>
            {editingId ? 'Update credential' : 'Add credential'}
          </button>
          {editingId && <button className="btn" disabled={busy} onClick={resetForm}>Cancel</button>}
        </div>
        {error && <p className="plugin-form-err" style={{ gridColumn: '1 / -1' }}>{error}</p>}
      </div>

      <div className="vault-list">
        {items.map((item) => (
          <div key={item.id} style={{ gridTemplateColumns: '18px minmax(0,1fr) 28px 28px' }}>
            <KeyRound size={13} />
            <span>
              {item.name}
              <em>
                {item.envKey}
                {item.provider ? ` · ${item.provider}` : ''}
                {item.workspaceId ? ' · workspace' : ' · global'} · updated {new Date(item.updatedAt).toLocaleString()}
              </em>
            </span>
            <button className="hbtn" title="Edit" aria-label={`Edit ${item.name}`} onClick={() => startEdit(item)}>
              <Pencil size={12} />
            </button>
            {confirmId === item.id ? (
              <button
                className="hbtn danger"
                title="Confirm delete"
                onClick={async () => {
                  await window.termflow.vault.remove(item.id)
                  setConfirmId(null)
                  if (editingId === item.id) resetForm()
                  await reload()
                }}
              >
                ✓
              </button>
            ) : (
              <button className="hbtn danger" title="Delete" aria-label={`Delete ${item.name}`} onClick={() => setConfirmId(item.id)}>
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>No credentials stored yet.</p>}
      </div>
      {confirmId && <p style={{ fontSize: 11, color: 'var(--danger)' }}>Click ✓ again to permanently delete the selected credential.</p>}
    </div>
  )
}

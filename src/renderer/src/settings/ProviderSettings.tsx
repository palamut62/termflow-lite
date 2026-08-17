import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { nanoid } from 'nanoid'
import type { ProviderProfile } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { Field, Select, TextInput, Toggle } from './Settings'

const emptyProvider = (): ProviderProfile => ({
  id: nanoid(10),
  name: '',
  command: '',
  model: '',
  models: [],
  baseUrl: '',
  apiKeyEnv: '',
  modelEnv: '',
  baseUrlEnv: '',
  color: '#6467f2',
  fullPermissions: true,
  fullPermissionArgs: ''
})

export function ProviderSettings(): React.JSX.Element {
  const providers = useSettingsStore((s) => s.settings.providerProfiles)
  const update = useSettingsStore((s) => s.update)
  const [draft, setDraft] = useState<ProviderProfile | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [secretError, setSecretError] = useState('')

  const edit = async (provider: ProviderProfile): Promise<void> => {
    setDraft({ ...provider })
    setApiKey('')
    setSecretError('')
    setHasApiKey(await window.termflow.providerSecrets.has(provider.id))
  }

  const save = async (): Promise<void> => {
    if (!draft?.name.trim() || !draft.command.trim()) return
    const payload: ProviderProfile = {
      ...draft,
      name: draft.name.trim(),
      command: draft.command.trim(),
      model: draft.model?.trim() || undefined,
      models: draft.models?.map((model) => model.trim()).filter(Boolean),
      baseUrl: draft.baseUrl?.trim() || undefined,
      apiKeyEnv: draft.apiKeyEnv?.trim() || undefined,
      modelEnv: draft.modelEnv?.trim() || undefined,
      baseUrlEnv: draft.baseUrlEnv?.trim() || undefined,
      color: draft.color?.trim() || undefined,
      fullPermissions: draft.fullPermissions !== false,
      fullPermissionArgs: draft.fullPermissionArgs?.trim() || undefined
    }
    try {
      if (apiKey.trim()) {
        await window.termflow.providerSecrets.set(payload.id, apiKey)
      }
    } catch (error) {
      setSecretError(error instanceof Error ? error.message : 'API key could not be stored securely.')
      return
    }
    const exists = providers.some((provider) => provider.id === payload.id)
    await update({
      providerProfiles: exists
        ? providers.map((provider) => (provider.id === payload.id ? payload : provider))
        : [...providers, payload]
    })
    setApiKey('')
    setDraft(null)
  }

  const remove = async (id: string): Promise<void> => {
    await window.termflow.providerSecrets.delete(id)
    await update({ providerProfiles: providers.filter((provider) => provider.id !== id) })
    if (draft?.id === id) setDraft(null)
  }

  return (
    <section>
      <div className="settings-section-title">AI Providers</div>
      <p className="settings-note">
        API keys are encrypted with your operating system credential service and are exposed only to the selected provider process.
      </p>
      {providers.map((provider) => draft?.id !== provider.id && (
        <div className="profile-row" key={provider.id}>
          <span className="menu-item-dot" style={{ background: provider.color || '#6467f2' }} />
          <span className="profile-row-info">
            <span className="profile-row-name">{provider.name}</span>
            <span className="profile-row-command">{provider.command}{provider.model ? ` · ${provider.model}` : ''}</span>
          </span>
          <button className="settings-btn settings-btn-small" onClick={() => void edit(provider)}>Edit</button>
          <button className="settings-btn settings-btn-small settings-btn-danger" onClick={() => void remove(provider.id)} aria-label={`Delete ${provider.name}`}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      {draft && (
        <div className="profile-form">
          <Field label="Name"><TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="My Provider" /></Field>
          <Field label="CLI Command" hint="started in the default shell"><TextInput className="settings-input-wide" value={draft.command} onChange={(e) => setDraft({ ...draft, command: e.target.value })} placeholder="claude" /></Field>
          <Field label="Active Model">
            {(draft.models?.length ?? 0) > 0 ? (
              <Select value={draft.model ?? ''} onChange={(model) => setDraft({ ...draft, model })} options={(draft.models ?? []).map((model) => ({ value: model, label: model }))} />
            ) : (
              <TextInput className="settings-input-wide" value={draft.model ?? ''} onChange={(e) => setDraft({ ...draft, model: e.target.value })} placeholder="model-name" />
            )}
          </Field>
          <Field label="Available Models" hint="comma-separated model ids"><TextInput className="settings-input-wide" value={(draft.models ?? []).join(', ')} onChange={(e) => setDraft({ ...draft, models: e.target.value.split(',').map((model) => model.trim()).filter(Boolean) })} placeholder="model-a, model-b" /></Field>
          <Field label="Base URL"><TextInput className="settings-input-wide" value={draft.baseUrl ?? ''} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://api.example.com" /></Field>
          <Field label="API Key" hint={hasApiKey ? 'A key is securely stored. Leave blank to keep it.' : 'Encrypted by the operating system; never written to settings.json.'}>
            <TextInput className="settings-input-wide" type="password" autoComplete="off" value={apiKey} onChange={(e) => { setApiKey(e.target.value); setSecretError('') }} placeholder={hasApiKey ? 'Stored securely' : 'Paste provider API key'} />
          </Field>
          <Field label="API Key Variable" hint="environment variable expected by the CLI"><TextInput className="settings-input-wide" value={draft.apiKeyEnv ?? ''} onChange={(e) => setDraft({ ...draft, apiKeyEnv: e.target.value })} placeholder="ANTHROPIC_AUTH_TOKEN" /></Field>
          <Field label="Model Variable"><TextInput className="settings-input-wide" value={draft.modelEnv ?? ''} onChange={(e) => setDraft({ ...draft, modelEnv: e.target.value })} placeholder="PROVIDER_MODEL" /></Field>
          <Field label="Base URL Variable"><TextInput className="settings-input-wide" value={draft.baseUrlEnv ?? ''} onChange={(e) => setDraft({ ...draft, baseUrlEnv: e.target.value })} placeholder="PROVIDER_BASE_URL" /></Field>
          <Field label="Color"><TextInput className="settings-input-narrow" value={draft.color ?? ''} onChange={(e) => setDraft({ ...draft, color: e.target.value })} placeholder="#6467f2" /></Field>
          <Field label="Full Permissions" hint="launch without approval prompts"><Toggle checked={draft.fullPermissions !== false} onChange={(fullPermissions) => setDraft({ ...draft, fullPermissions })} label="Provider full permissions" /></Field>
          <Field label="Permission Arguments" hint="CLI-specific bypass flags"><TextInput className="settings-input-wide" value={draft.fullPermissionArgs ?? ''} onChange={(e) => setDraft({ ...draft, fullPermissionArgs: e.target.value })} placeholder="--dangerously-skip-permissions" /></Field>
          <div className="profile-form-actions">
            <button className="settings-btn settings-btn-primary" disabled={!draft.name.trim() || !draft.command.trim()} onClick={() => void save()}>Save</button>
            <button className="settings-btn" onClick={() => { setApiKey(''); setDraft(null) }}>Cancel</button>
          </div>
          {secretError && <p className="settings-note settings-error" role="alert">{secretError}</p>}
        </div>
      )}
      {!draft && <button className="settings-btn settings-btn-primary" onClick={() => { setHasApiKey(false); setApiKey(''); setSecretError(''); setDraft(emptyProvider()) }}><Plus size={12} /> Add Provider</button>}
    </section>
  )
}

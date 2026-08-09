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

  const save = (): void => {
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
    const exists = providers.some((provider) => provider.id === payload.id)
    void update({
      providerProfiles: exists
        ? providers.map((provider) => (provider.id === payload.id ? payload : provider))
        : [...providers, payload]
    })
    setDraft(null)
  }

  const remove = (id: string): void => {
    void update({ providerProfiles: providers.filter((provider) => provider.id !== id) })
    if (draft?.id === id) setDraft(null)
  }

  return (
    <section>
      <div className="settings-section-title">AI Providers</div>
      <p className="settings-note">
        Providers launch a configured CLI with model and endpoint variables. API keys stay in your operating-system environment and are never stored here.
      </p>
      {providers.map((provider) => draft?.id !== provider.id && (
        <div className="profile-row" key={provider.id}>
          <span className="menu-item-dot" style={{ background: provider.color || '#6467f2' }} />
          <span className="profile-row-info">
            <span className="profile-row-name">{provider.name}</span>
            <span className="profile-row-command">{provider.command}{provider.model ? ` · ${provider.model}` : ''}</span>
          </span>
          <button className="settings-btn settings-btn-small" onClick={() => setDraft({ ...provider })}>Edit</button>
          <button className="settings-btn settings-btn-small settings-btn-danger" onClick={() => remove(provider.id)} aria-label={`Delete ${provider.name}`}>
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
          <Field label="API Key Variable" hint="name only; value comes from the OS"><TextInput className="settings-input-wide" value={draft.apiKeyEnv ?? ''} onChange={(e) => setDraft({ ...draft, apiKeyEnv: e.target.value })} placeholder="PROVIDER_API_KEY" /></Field>
          <Field label="Model Variable"><TextInput className="settings-input-wide" value={draft.modelEnv ?? ''} onChange={(e) => setDraft({ ...draft, modelEnv: e.target.value })} placeholder="PROVIDER_MODEL" /></Field>
          <Field label="Base URL Variable"><TextInput className="settings-input-wide" value={draft.baseUrlEnv ?? ''} onChange={(e) => setDraft({ ...draft, baseUrlEnv: e.target.value })} placeholder="PROVIDER_BASE_URL" /></Field>
          <Field label="Color"><TextInput className="settings-input-narrow" value={draft.color ?? ''} onChange={(e) => setDraft({ ...draft, color: e.target.value })} placeholder="#6467f2" /></Field>
          <Field label="Full Permissions" hint="launch without approval prompts"><Toggle checked={draft.fullPermissions !== false} onChange={(fullPermissions) => setDraft({ ...draft, fullPermissions })} label="Provider full permissions" /></Field>
          <Field label="Permission Arguments" hint="CLI-specific bypass flags"><TextInput className="settings-input-wide" value={draft.fullPermissionArgs ?? ''} onChange={(e) => setDraft({ ...draft, fullPermissionArgs: e.target.value })} placeholder="--dangerously-skip-permissions" /></Field>
          <div className="profile-form-actions">
            <button className="settings-btn settings-btn-primary" disabled={!draft.name.trim() || !draft.command.trim()} onClick={save}>Save</button>
            <button className="settings-btn" onClick={() => setDraft(null)}>Cancel</button>
          </div>
        </div>
      )}
      {!draft && <button className="settings-btn settings-btn-primary" onClick={() => setDraft(emptyProvider())}><Plus size={12} /> Add Provider</button>}
    </section>
  )
}

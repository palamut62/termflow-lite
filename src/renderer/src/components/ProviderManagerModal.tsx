import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_SETTINGS, type AiProviderProfile } from '../../../shared/types'
import { useAppStore } from '../store/appStore'
import { useModalClose } from '../hooks/useModalClose'
import ConfirmModal from './ConfirmModal'

const emptyProfile = (): AiProviderProfile => ({
  id: crypto.randomUUID(), name: 'New Provider', command: '', model: '', baseUrl: '',
  apiKeyEnv: '', modelEnv: '', baseUrlEnv: '', color: '#2f80ff', fullPermissionArgs: ''
})

const builtInProviderIds = new Set(DEFAULT_SETTINGS.providerProfiles.map((profile) => profile.id))

export default function ProviderManagerModal({ onClose, initialProviderId }: { onClose: () => void; initialProviderId?: string }): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [profiles, setProfiles] = useState<AiProviderProfile[]>(settings.providerProfiles)
  const [pendingDelete, setPendingDelete] = useState<AiProviderProfile | null>(null)
  const focusRef = useRef<HTMLElement>(null)
  useModalClose(onClose)

  useEffect(() => {
    if (initialProviderId && focusRef.current) {
      focusRef.current.scrollIntoView({ block: 'center' })
      focusRef.current.querySelector('input')?.focus()
    }
  }, [initialProviderId])

  const patchProfile = (id: string, patch: Partial<AiProviderProfile>): void => {
    setProfiles((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  const deleteProvider = (id: string): void => {
    const nextProfiles = profiles.filter((profile) => profile.id !== id)
    setProfiles(nextProfiles)
    void updateSettings({ providerProfiles: nextProfiles })
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal provider-modal" onMouseDown={(event) => event.stopPropagation()}>
        <h3>AI Provider Profiles</h3>
        <p className="help-intro">Configure any CLI-backed provider. Store API keys separately under Settings &gt; Developer &gt; Workspace Environment / Credentials using the API key variable shown here.</p>
        <div className="provider-list">
          {profiles.map((profile) => (
            <section className="provider-card" key={profile.id} ref={profile.id === initialProviderId ? focusRef : undefined}>
              <div className="provider-card-head">
                <input value={profile.name} onChange={(e) => patchProfile(profile.id, { name: e.target.value })} aria-label="Provider name" />
                <input type="color" value={profile.color} onChange={(e) => patchProfile(profile.id, { color: e.target.value })} aria-label="Provider color" />
                {builtInProviderIds.has(profile.id) ? (
                  <span className="kind-tag" title="Built-in provider">Built-in</span>
                ) : (
                  <button className="hbtn danger" title="Delete provider" aria-label={`Delete ${profile.name}`} onClick={() => setPendingDelete(profile)}><Trash2 size={14} /></button>
                )}
              </div>
              <div className="provider-fields">
                <label>Terminal command<input value={profile.command} onChange={(e) => patchProfile(profile.id, { command: e.target.value })} placeholder="claude, opencode, ollama run llama3.2..." /></label>
                <label>Model<input value={profile.model} onChange={(e) => patchProfile(profile.id, { model: e.target.value })} placeholder="deepseek-chat" /></label>
                <label>Base URL<input value={profile.baseUrl} onChange={(e) => patchProfile(profile.id, { baseUrl: e.target.value })} placeholder="https://api.example.com" /></label>
                <label>API key variable<input value={profile.apiKeyEnv} onChange={(e) => patchProfile(profile.id, { apiKeyEnv: e.target.value })} placeholder="OPENAI_API_KEY" /></label>
                <label>Model variable<input value={profile.modelEnv} onChange={(e) => patchProfile(profile.id, { modelEnv: e.target.value })} placeholder="OPENAI_MODEL" /></label>
                <label>Base URL variable<input value={profile.baseUrlEnv} onChange={(e) => patchProfile(profile.id, { baseUrlEnv: e.target.value })} placeholder="OPENAI_BASE_URL" /></label>
                <label>Full-permission arguments<input value={profile.fullPermissionArgs} onChange={(e) => patchProfile(profile.id, { fullPermissionArgs: e.target.value })} placeholder="--dangerously-skip-permissions" /></label>
              </div>
            </section>
          ))}
        </div>
        <button className="btn" onClick={() => setProfiles((items) => [...items, emptyProfile()])}><Plus size={14} /> Add provider</button>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={async () => { await updateSettings({ providerProfiles: profiles }); onClose() }}>Save providers</button>
        </div>
      </div>
      {pendingDelete && (
        <ConfirmModal
          title="Delete AI provider?"
          message={`${pendingDelete.name} will be removed from TermFlow.`}
          confirmLabel="Delete provider"
          tone="danger"
          onConfirm={() => deleteProvider(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

import { useState } from 'react'
import { mergeProfiles, providerProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'

export function ProfileHealthSettings(): React.JSX.Element {
  const settings = useSettingsStore(state => state.settings)
  const options = [...mergeProfiles(settings.profiles), ...settings.providerProfiles.map(p => ({ ...p, id: providerProfileId(p.id) }))]
  const [id, setId] = useState(options[0]?.id ?? '')
  const [checks, setChecks] = useState<{ label: string; ok: boolean; detail: string }[]>([])
  const [busy, setBusy] = useState(false)
  const run = async (connection: boolean): Promise<void> => {
    setBusy(true); setChecks([])
    try { setChecks(await window.termflow.profileHealth(id, connection)) }
    catch { setChecks([{ label: 'Check', ok: false, detail: 'The profile could not be checked.' }]) }
    finally { setBusy(false) }
  }
  return <section><div className="settings-section-title">Profile Health</div>
    <p className="settings-note">Check the installed CLI, its permission flags and credential availability. Connection testing sends a request to the configured provider's models endpoint.</p>
    <select aria-label="Profile to check" value={id} disabled={busy} onChange={e => { setId(e.target.value); setChecks([]) }}>{options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    <div className="profile-form-actions"><button className="settings-btn" disabled={busy || !id} onClick={() => void run(false)}>{busy ? 'Checking...' : 'Check locally'}</button>
      {id.startsWith('provider:') && <button className="settings-btn" disabled={busy} onClick={() => void run(true)}>Test connection</button>}</div>
    <div aria-live="polite">{checks.map((check, i) => <p key={i}><strong>{check.ok ? 'OK' : 'Needs attention'} · {check.label}</strong><br />{check.detail}</p>)}</div>
  </section>
}

import { useState } from 'react'
import { useSettingsStore } from '../store/settingsStore'
import { useSavedCommandStore } from '../store/savedCommandStore'
import { useWorkspaceStore } from '../store/workspaceStore'
import { exportBackup, parseBackup, type BackupData } from './backupData'

export function BackupSettings(): React.JSX.Element {
  const [text, setText] = useState('')
  const [preview, setPreview] = useState<BackupData | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const create = (): string => exportBackup(useSettingsStore.getState().settings, useSavedCommandStore.getState().commands, useWorkspaceStore.getState().workspaces)
  const apply = async (): Promise<void> => {
    if (!preview) return
    setBusy(true)
    try {
      await useSettingsStore.getState().update(preview.settings)
      useSavedCommandStore.getState().replace(preview.commands)
      useWorkspaceStore.getState().replace(preview.workspaces)
      setPreview(null); setText(''); setMessage('Backup imported. Task schedules are paused; review them before enabling.')
    } catch { setMessage('Import could not complete. Check available storage before retrying.') }
    finally { setBusy(false) }
  }
  return <section><div className="settings-section-title">Backup & Restore</div>
    <p className="settings-note">Export profiles, themes, shortcuts, SSH definitions, tasks and workspaces. Stored provider keys and profile environment variables are excluded. Review commands before sharing a backup.</p>
    <button className="settings-btn" onClick={async () => { const ok = await window.termflow.clipboard.writeText(create()); setMessage(ok ? 'Backup copied.' : 'Clipboard unavailable.') }}>Copy backup</button>
    <button className="settings-btn" onClick={() => { const blob = new Blob([create()], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'termflow-backup.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setMessage('Backup download requested.') }}>Download backup</button>
    <p><label>Import a backup file <input type="file" accept="application/json,.json" aria-label="Backup file" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2_000_000) { setMessage('Backup exceeds 2 MB.'); return } setText(await file.text()); setPreview(null) }} /></label></p>
    <textarea className="backup-text" aria-label="Backup JSON" placeholder="Or paste backup JSON here" value={text} onChange={e => { setText(e.target.value); setPreview(null) }} />
    <button className="settings-btn" disabled={!text || busy} onClick={() => { try { setPreview(parseBackup(text)); setMessage('') } catch (error) { setMessage((error as Error).message) } }}>Preview import</button>
    {preview && <div className="backup-preview"><p>Replace saved configuration with {preview.settings.profiles.length} profiles, {preview.settings.providerProfiles.length} providers, {preview.commands.length} tasks and {preview.workspaces.length} workspaces.</p><p>New-session permission default: {preview.settings.defaultAgentPermissionMode}. All imported schedules will be paused.</p>
      <button className="settings-btn settings-btn-primary" disabled={busy} onClick={() => void apply()}>Apply import</button><button className="settings-btn" onClick={() => setPreview(null)}>Cancel</button></div>}
    {message && <p role="status">{message}</p>}
  </section>
}

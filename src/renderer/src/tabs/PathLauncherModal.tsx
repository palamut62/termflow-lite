import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Bot, FolderOpen, TerminalSquare, X } from 'lucide-react'
import { mergeProfiles, providerProfileId } from '../../../shared/profiles'
import { useSettingsStore } from '../store/settingsStore'
import { useTerminalStore } from '../store/terminalStore'

export function PathLauncherModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const shells = useSettingsStore((s) => s.shells)
  const settings = useSettingsStore((s) => s.settings)
  const options = useMemo(() => [
    ...shells.map((shell) => ({ id: shell.id, name: shell.name, group: 'Shells' })),
    ...mergeProfiles(settings.profiles).map((profile) => ({ id: profile.id, name: profile.name, group: 'Profiles' })),
    ...settings.providerProfiles.map((provider) => ({ id: providerProfileId(provider.id), name: provider.name, group: 'Providers' }))
  ], [settings.profiles, settings.providerProfiles, shells])
  const [profileId, setProfileId] = useState(options[0]?.id ?? settings.defaultProfileId)
  const [cwd, setCwd] = useState('')

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="settings-backdrop path-launch-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div className="path-launch-panel" role="dialog" aria-modal="true" aria-label="Open terminal at folder">
        <header className="settings-header">
          <span className="settings-header-title"><TerminalSquare size={16} /> Open terminal at folder</span>
          <button className="settings-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>
        <div className="path-launch-content">
          <label className="path-launch-label" htmlFor="path-launch-profile"><Bot size={14} /> Shell, agent or provider</label>
          <select id="path-launch-profile" className="settings-input settings-select path-launch-select" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            {['Shells', 'Profiles', 'Providers'].map((group) => (
              <optgroup label={group} key={group}>
                {options.filter((option) => option.group === group).map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
              </optgroup>
            ))}
          </select>
          <label className="path-launch-label" htmlFor="path-launch-cwd"><FolderOpen size={14} /> Working directory</label>
          <div className="path-launch-row">
            <input id="path-launch-cwd" className="settings-input" value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="C:\\projects\\my-app" autoFocus />
            <button className="settings-btn" onClick={async () => { const path = await window.termflow.dialog.openDir(); if (path) setCwd(path) }}><FolderOpen size={13} /> Browse</button>
          </div>
        </div>
        <div className="path-launch-actions">
          <button className="settings-btn" onClick={onClose}>Cancel</button>
          <button className="settings-btn settings-btn-primary" disabled={!cwd.trim() || !profileId} onClick={() => { useTerminalStore.getState().addTab(profileId, true, cwd.trim()); onClose() }}>Open</button>
        </div>
      </div>
    </div>,
    document.body
  )
}

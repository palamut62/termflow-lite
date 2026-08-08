import { Eye, EyeOff, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CustomAgentDef, ShellKind } from '../../../shared/types'
import { useAppStore } from '../store/appStore'
import { useModalClose } from '../hooks/useModalClose'
import { PROFILES } from '../profiles'
import ConfirmModal from './ConfirmModal'

const SECRET_RE = /KEY|TOKEN|SECRET|PASSWORD/i

type Tab = 'profiles' | 'settings' | 'config'

// Bundled profiles that carry a startup command are the ones worth overriding
// (name / command / extra flags). `claude` and `pwsh` are treated identically.
const builtInProfiles = PROFILES.filter((profile) => profile.startupCommand)

const emptyProfile = (): CustomAgentDef => ({
  id: crypto.randomUUID(), name: 'New Profile', command: '', fullPermissionArgs: '', color: '#2f80ff'
})

function initialProfiles(saved: CustomAgentDef[]): CustomAgentDef[] {
  const overrides = new Map(saved.filter((item) => item.kind).map((item) => [item.kind, item]))
  const builtIns = builtInProfiles.map((profile) => overrides.get(profile.kind) ?? ({
    id: `builtin:${profile.kind}`,
    kind: profile.kind,
    name: profile.label,
    command: profile.startupCommand ?? profile.kind,
    fullPermissionArgs: profile.bypassArgs ?? '',
    color: profile.color
  }))
  return [...builtIns, ...saved.filter((item) => !item.kind)]
}

const THEMES = ['dark', 'light', 'dark-daltonized', 'light-daltonized']
const NOTIF_CHANNELS = ['iterm2', 'terminal_bell', 'iterm2_with_bell', 'notifications_disabled']

interface EnvRow {
  key: string
  value: string
}

export default function ProfileModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  useModalClose(onClose)
  const [tab, setTab] = useState<Tab>('profiles')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  // config (.claude.json)
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [theme, setTheme] = useState('dark')
  const [notifChannel, setNotifChannel] = useState('iterm2')
  const [autoUpdates, setAutoUpdates] = useState(true)
  const [verbose, setVerbose] = useState(false)

  // Terminal profiles (name + startup command + extra flags)
  const appSettings = useAppStore((s) => s.settings)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const [profiles, setProfiles] = useState<CustomAgentDef[]>(() => initialProfiles(appSettings.customAgents))
  const [pendingDelete, setPendingDelete] = useState<CustomAgentDef | null>(null)
  const hiddenProfileKinds = appSettings.hiddenAgentKinds ?? []

  const patchProfile = (id: string, patch: Partial<CustomAgentDef>): void => {
    setProfiles((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const deleteProfile = (id: string): void => {
    const next = profiles.filter((item) => item.id !== id)
    setProfiles(next)
    void updateSettings({ customAgents: next })
  }

  const restoreProfile = (kind: ShellKind): void => {
    void updateSettings({ hiddenAgentKinds: hiddenProfileKinds.filter((k) => k !== kind) })
  }

  // settings (.claude/settings.json)
  const [settings, setSettings] = useState<Record<string, unknown>>({})
  const [model, setModel] = useState('')
  const [envRows, setEnvRows] = useState<EnvRow[]>([])
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [includeCoAuthoredBy, setIncludeCoAuthoredBy] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await window.termflow.agentConfig.read('config')
        setConfig(cfg)
        if (typeof cfg.theme === 'string') setTheme(cfg.theme)
        if (typeof cfg.preferredNotifChannel === 'string') setNotifChannel(cfg.preferredNotifChannel as string)
        if (typeof cfg.autoUpdates === 'boolean') setAutoUpdates(cfg.autoUpdates)
        if (typeof cfg.verbose === 'boolean') setVerbose(cfg.verbose)
      } catch (e) {
        setError((e as Error).message || 'Failed to read .claude.json')
      }
      try {
        const st = await window.termflow.agentConfig.read('settings')
        setSettings(st)
        if (typeof st.model === 'string') setModel(st.model)
        if (st.env && typeof st.env === 'object' && !Array.isArray(st.env)) {
          setEnvRows(Object.entries(st.env as Record<string, unknown>).map(([key, value]) => ({ key, value: String(value) })))
        }
        if (typeof st.includeCoAuthoredBy === 'boolean') setIncludeCoAuthoredBy(st.includeCoAuthoredBy)
      } catch (e) {
        setError((e as Error).message || 'Failed to read settings.json')
      }
    })()
  }, [])

  const configPreview = { ...config, theme, preferredNotifChannel: notifChannel, autoUpdates, verbose }
  const settingsEnv = envRows.reduce<Record<string, string>>((acc, r) => {
    if (r.key.trim()) acc[r.key.trim()] = r.value
    return acc
  }, {})
  const settingsPreview = { ...settings, model, env: settingsEnv, includeCoAuthoredBy }

  const saveConfig = async (): Promise<void> => {
    setError('')
    setSaved('')
    try {
      const patch = { theme, preferredNotifChannel: notifChannel, autoUpdates, verbose }
      const merged = await window.termflow.agentConfig.write('config', patch)
      setConfig(merged)
      setSaved('Saved — restart claude terminals to apply')
    } catch (e) {
      setError((e as Error).message || 'Failed to write .claude.json')
    }
  }

  const saveSettings = async (): Promise<void> => {
    setError('')
    setSaved('')
    try {
      const patch = { model, env: settingsEnv, includeCoAuthoredBy }
      const merged = await window.termflow.agentConfig.write('settings', patch)
      setSettings(merged)
      setSaved('Saved — restart claude terminals to apply')
    } catch (e) {
      setError((e as Error).message || 'Failed to write settings.json')
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" style={{ width: 560, maxWidth: '92vw', padding: 0, display: 'flex', flexDirection: 'column' }} onMouseDown={(e) => e.stopPropagation()}>
        <header className="workbench-head">
          <div>
            <h3>Profiles</h3>
            <span>Terminal profiles & Claude Code config files</span>
          </div>
          <button className="hbtn" onClick={onClose}><X size={16} /></button>
        </header>

        <div className="tab-bar" style={{ display: 'flex', gap: 6, padding: '10px 15px 0' }}>
          <button className={`tb-btn ${tab === 'profiles' ? 'active' : ''}`} onClick={() => setTab('profiles')}>Profiles</button>
          <button className={`tb-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>Settings (.claude/settings.json)</button>
          <button className={`tb-btn ${tab === 'config' ? 'active' : ''}`} onClick={() => setTab('config')}>Config (.claude.json)</button>
        </div>

        <div className="acfg-body">
          {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
          {saved && <div style={{ color: 'var(--success)', fontSize: 12 }}>{saved}</div>}

          {tab === 'profiles' && (
            <>
              <p className="help-intro">Every profile is just a name plus a startup command — add your own CLIs (grok, qoder, pwsh...) and they show up in the New Terminal menu.</p>
              <div className="provider-list">
                {profiles.map((profile) => (
                  <section className="provider-card" key={profile.id}>
                    <div className="provider-card-head">
                      <input value={profile.name} onChange={(e) => patchProfile(profile.id, { name: e.target.value })} aria-label="Profile name" />
                      <input type="color" value={profile.color} onChange={(e) => patchProfile(profile.id, { color: e.target.value })} aria-label="Profile color" />
                      {profile.kind ? (
                        <span className="kind-tag" title="Built-in profile">Built-in</span>
                      ) : (
                        <button className="hbtn danger" title="Delete profile" aria-label={`Delete ${profile.name}`} onClick={() => setPendingDelete(profile)}><Trash2 size={14} /></button>
                      )}
                    </div>
                    <div className="provider-fields">
                      <label>Startup command<input value={profile.command} onChange={(e) => patchProfile(profile.id, { command: e.target.value })} placeholder="claude, pwsh, grok..." /></label>
                      <label>Extra flags<input value={profile.fullPermissionArgs ?? ''} onChange={(e) => patchProfile(profile.id, { fullPermissionArgs: e.target.value })} placeholder="--dangerously-skip-permissions" /></label>
                    </div>
                  </section>
                ))}
              </div>
              <button className="btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setProfiles((items) => [...items, emptyProfile()])}><Plus size={13} />Add profile</button>
              {hiddenProfileKinds.length > 0 && (
                <div className="hidden-agents">
                  <span className="help-intro">Hidden profiles:</span>
                  {hiddenProfileKinds.map((kind) => {
                    const hidden = builtInProfiles.find((p) => p.kind === kind)
                    return (
                      <button key={kind} className="btn" onClick={() => restoreProfile(kind)}>
                        {hidden?.label ?? kind} — Restore
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {tab === 'settings' && (
            <>
              <label className="acfg-field">
                Model
                <input className="acfg-input" value={model} placeholder="claude-sonnet-5" onChange={(e) => setModel(e.target.value)} />
              </label>

              <div className="acfg-field">
                <span>Environment variables</span>
                <div className="acfg-env-list">
                  {envRows.map((row, i) => {
                    const secret = SECRET_RE.test(row.key)
                    const show = revealed[i] === true
                    return (
                      <div key={i} className="acfg-env-row">
                        <input placeholder="KEY" value={row.key}
                          onChange={(e) => setEnvRows((rows) => rows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))} />
                        <input placeholder="value" value={row.value} type={secret && !show ? 'password' : 'text'}
                          onChange={(e) => setEnvRows((rows) => rows.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))} />
                        {secret ? (
                          <button className="acfg-iconbtn" title={show ? 'Hide' : 'Show'} onClick={() => setRevealed((r) => ({ ...r, [i]: !show }))}>
                            {show ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        ) : <span />}
                        <button className="acfg-iconbtn danger" title="Remove" onClick={() => setEnvRows((rows) => rows.filter((_, idx) => idx !== i))}><Trash2 size={14} /></button>
                      </div>
                    )
                  })}
                </div>
                <button className="btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setEnvRows((rows) => [...rows, { key: '', value: '' }])}><Plus size={13} />Add variable</button>
              </div>

              <label className="acfg-check">
                <input type="checkbox" checked={includeCoAuthoredBy} onChange={(e) => setIncludeCoAuthoredBy(e.target.checked)} />
                Include Co-Authored-By in commits
              </label>

              <details className="acfg-raw">
                <summary>Raw JSON preview</summary>
                <pre>{JSON.stringify(settingsPreview, null, 2)}</pre>
              </details>
            </>
          )}

          {tab === 'config' && (
            <>
              <label className="acfg-field">
                Theme
                <select className="acfg-input" value={theme} onChange={(e) => setTheme(e.target.value)}>
                  {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>

              <label className="acfg-field">
                Preferred notification channel
                <select className="acfg-input" value={notifChannel} onChange={(e) => setNotifChannel(e.target.value)}>
                  {NOTIF_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label className="acfg-check">
                <input type="checkbox" checked={autoUpdates} onChange={(e) => setAutoUpdates(e.target.checked)} />
                Auto updates
              </label>

              <label className="acfg-check">
                <input type="checkbox" checked={verbose} onChange={(e) => setVerbose(e.target.checked)} />
                Verbose
              </label>

              <details className="acfg-raw">
                <summary>Raw JSON preview</summary>
                <pre>{JSON.stringify(configPreview, null, 2)}</pre>
              </details>
            </>
          )}
        </div>

        <div className="modal-actions" style={{ padding: '12px 15px', borderTop: '1px solid var(--border-soft)', marginTop: 0 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => {
              if (tab === 'profiles') void updateSettings({ customAgents: profiles }).then(onClose)
              else if (tab === 'settings') void saveSettings()
              else void saveConfig()
            }}
          >
            <Save size={13} />Save
          </button>
        </div>
      </div>
      {pendingDelete && (
        <ConfirmModal
          title="Delete profile?"
          message={`${pendingDelete.name} will be removed from TermFlow.`}
          confirmLabel="Delete profile"
          tone="danger"
          onConfirm={() => deleteProfile(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}

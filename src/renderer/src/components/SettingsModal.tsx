import { useEffect, useState } from 'react'
import {
  Palette,
  TerminalSquare,
  Bell,
  SlidersHorizontal,
  Monitor,
  RefreshCw,
  Highlighter,
  Wrench,
  X
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { TERMINAL_THEMES } from '../themes'
import type { EnvEntry, HighlightRule, SshProfile } from '../../../shared/types'
import PromptModal, { type PromptField } from './PromptModal'
import CredentialVaultSection from './CredentialVaultSection'
import { useModalClose } from '../hooks/useModalClose'

interface Props {
  onClose: () => void
}

const BORDER_COLORS = [
  { label: 'Yellow', value: '#f5e642' },
  { label: 'Blue', value: '#2f80ff' },
  { label: 'Green', value: '#3fb950' },
  { label: 'Purple', value: '#b48ead' },
  { label: 'Red', value: '#ff4d4f' }
]

const SCROLLBACK = [1000, 5000, 10000, 50000, 100000]
const FONT_FAMILIES = [
  "'Cascadia Mono', 'JetBrains Mono', Consolas, monospace",
  "'JetBrains Mono', Consolas, monospace",
  "'Fira Code', Consolas, monospace",
  "Consolas, 'Courier New', monospace",
  "'Source Code Pro', Consolas, monospace"
]

const HIGHLIGHT_COLORS = ['#ff4d4f', '#f6c343', '#3fb950', '#2f80ff', '#b48ead', '#ff6b6b', '#6dd98a']

// Secrets (API keys, tokens) must never sit readable in a settings screen —
// show head…tail so entries stay recognizable without leaking on screenshares.
function maskEnvValue(value: string): string {
  if (value === '••••••••') return value // already masked by main process
  if (value.length <= 12) return value
  return `${value.slice(0, 6)}…${value.slice(-4)}`
}

// Settings: Appearance + Performance + Terminal Theme & Font (PRD §17.2, §20.1)
export default function SettingsModal({ onClose }: Props): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.updateSettings)
  const highlightRules = useAppStore((s) => s.highlightRules)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const [activeTab, setActiveTab] = useState<
    | 'appearance'
    | 'terminal'
    | 'notifications'
    | 'behavior'
    | 'system'
    | 'updates'
    | 'highlights'
    | 'developer'
  >('appearance')
  const [rulePrompt, setRulePrompt] = useState<{ fields: PromptField[] } | null>(null)
  const [envVars, setEnvVars] = useState<EnvEntry[]>([])
  const [sshProfiles, setSshProfiles] = useState<SshProfile[]>([])
  const [envKey, setEnvKey] = useState('')
  const [envValue, setEnvValue] = useState('')
  const [sshName, setSshName] = useState('')
  const [sshHost, setSshHost] = useState('')
  const [sshUser, setSshUser] = useState('')
  const [sshPort, setSshPort] = useState('22')
  const [sshKeyPath, setSshKeyPath] = useState('')
  const [sshJumpHost, setSshJumpHost] = useState('')
  const [updateStatus, setUpdateStatus] = useState<{ status: string; detail?: string }>({ status: 'idle' })
  useModalClose(onClose)

  const reloadDeveloper = async (): Promise<void> => {
    if (!activeWorkspaceId) return
    const [nextEnv, nextSsh] = await Promise.all([
      window.termflow.envVars.list(activeWorkspaceId),
      window.termflow.sshProfiles.list(activeWorkspaceId)
    ])
    setEnvVars(nextEnv)
    setSshProfiles(nextSsh)
    useAppStore.setState({ sshProfiles: nextSsh })
  }

  useEffect(() => {
    if (activeTab === 'developer') reloadDeveloper()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeWorkspaceId])

  useEffect(() => window.termflow.updates.onStatus(setUpdateStatus), [])

  const categories = [
    { key: 'appearance' as const, label: 'Appearance', Icon: Palette },
    { key: 'terminal' as const, label: 'Terminal', Icon: TerminalSquare },
    { key: 'notifications' as const, label: 'Notifications', Icon: Bell },
    { key: 'behavior' as const, label: 'Behavior', Icon: SlidersHorizontal },
    { key: 'system' as const, label: 'System', Icon: Monitor },
    { key: 'updates' as const, label: 'Updates', Icon: RefreshCw },
    { key: 'highlights' as const, label: 'Highlights', Icon: Highlighter },
    { key: 'developer' as const, label: 'Developer', Icon: Wrench }
  ]

  const activeLabel = categories.find((c) => c.key === activeTab)?.label ?? ''

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: '92vw', height: '78vh', display: 'flex', flexDirection: 'column' }}>
        <h3>Settings</h3>

        <div className="settings-layout">
          {/* Category sidebar */}
          <div className="settings-sidebar">
            {categories.map(({ key, label, Icon }) => (
              <button
                key={key}
                className={`settings-nav-item${activeTab === key ? ' active' : ''}`}
                onClick={() => setActiveTab(key)}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {/* Category content */}
          <div className="settings-content">
            <h4>{activeLabel}</h4>

        {/* Appearance */}
        {activeTab === 'appearance' && (
          <>
            <div className="field">
              <label>Theme</label>
              <select value={settings.theme} onChange={(e) => update({ theme: e.target.value as typeof settings.theme })}>
                <option value="system">System</option>
                <option value="vscode-dark">VS Code Dark</option>
                <option value="vscode-light">VS Code Light</option>
                <option value="one-dark-pro">One Dark Pro</option>
                <option value="tokyo-night">Tokyo Night</option>
              </select>
            </div>

            <div className="field">
              <label>Window transparency: {settings.transparency >= 100 ? 'Off' : `${100 - settings.transparency}%`}</label>
              <input type="range" min={45} max={100} value={settings.transparency}
                onChange={(e) => update({ transparency: Number(e.target.value) })} style={{ width: '100%' }} />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Applies to the workspace, terminals, menus, settings, and all in-app dialogs.</p>
            </div>

            <div className="field">
              <label>Active terminal border color</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {BORDER_COLORS.map((c) => (
                  <button key={c.value} onClick={() => update({ activeBorderColor: c.value })} title={c.label}
                    style={{ width: 30, height: 30, borderRadius: 8, background: c.value,
                      border: settings.activeBorderColor === c.value ? '2px solid var(--text-primary)' : '2px solid transparent' }} />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Notifications */}
        {activeTab === 'notifications' && (
          <>
            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.notificationsEnabled} style={{ width: 'auto' }}
                  onChange={(e) => update({ notificationsEnabled: e.target.checked })} />
                Desktop notifications
              </label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Fires even while TermFlow is minimized or running in the tray. Click a notification to jump to its terminal.
              </p>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 8, opacity: settings.notificationsEnabled ? 1 : 0.5 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.notifyOnLongCommand} disabled={!settings.notificationsEnabled} style={{ width: 'auto' }}
                    onChange={(e) => update({ notifyOnLongCommand: e.target.checked })} />
                  Long command finished
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.notifyOnError} disabled={!settings.notificationsEnabled} style={{ width: 'auto' }}
                    onChange={(e) => update({ notifyOnError: e.target.checked })} />
                  Error detected
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={settings.notifyOnAgentWaiting} disabled={!settings.notificationsEnabled} style={{ width: 'auto' }}
                    onChange={(e) => update({ notifyOnAgentWaiting: e.target.checked })} />
                  Terminal waiting for input
                </label>
              </div>
              {settings.notifyOnLongCommand && (
                <div style={{ marginTop: 8, opacity: settings.notificationsEnabled ? 1 : 0.5 }}>
                  <label>Long command threshold</label>
                  <select value={settings.longCommandThresholdMs} disabled={!settings.notificationsEnabled}
                    onChange={(e) => update({ longCommandThresholdMs: Number(e.target.value) })}>
                    {[10000, 30000, 60000, 120000, 300000].map((n) => (
                      <option key={n} value={n}>{n < 60000 ? `${n / 1000}s` : `${n / 60000}m`}</option>
                    ))}
                  </select>
                </div>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 12 }}>
                <input type="checkbox" checked={settings.terminalBell} style={{ width: 'auto' }}
                  onChange={(e) => update({ terminalBell: e.target.checked })} />
                Terminal bell sound
              </label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Plays a chime when a terminal rings the bell — how claude/codex signal a finished task.
              </p>
            </div>
          </>
        )}

        {/* Behavior */}
        {activeTab === 'behavior' && (
          <>
            <div className="field" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={false} disabled style={{ width: 'auto' }} />
                GPU acceleration (disabled for stable terminal resizing)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.infoPanelDefaultOpen} style={{ width: 'auto' }} onChange={(e) => update({ infoPanelDefaultOpen: e.target.checked })} />
                Open info panel (process/context) by default on new windows
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.shellIntegration} style={{ width: 'auto' }} onChange={(e) => update({ shellIntegration: e.target.checked })} />
                Shell integration (exit-code marks, command duration) — PowerShell / pwsh / Git Bash, applies to new terminals
              </label>
            </div>

            <div className="field">
              <label>Passive terminal render interval (ms)</label>
              <select value={settings.passiveThrottleMs} onChange={(e) => update({ passiveThrottleMs: Number(e.target.value) })}>
                {[100, 250, 500, 1000].map((n) => (<option key={n} value={n}>{n} ms</option>))}
              </select>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.agentAutoApprove} style={{ width: 'auto' }}
                  onChange={(e) => update({ agentAutoApprove: e.target.checked })} />
                Launch profiles with full permissions (bypass approvals)
              </label>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Claude Code <code>--dangerously-skip-permissions</code>, Codex{' '}
                <code>--dangerously-bypass-approvals-and-sandbox</code>
              </p>
            </div>

          </>
        )}

        {/* System */}
        {activeTab === 'system' && (
          <>
            <div className="field" style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.startAtLogin} style={{ width: 'auto' }} onChange={(e) => update({ startAtLogin: e.target.checked })} />
                Start TermFlow with Windows
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.minimizeToTray} style={{ width: 'auto' }} onChange={(e) => update({ minimizeToTray: e.target.checked })} />
                Keep running in the system tray when closed
              </label>
            </div>
          </>
        )}

        {/* Updates */}
        {activeTab === 'updates' && (
          <>
            <div className="field">
              <label>Application updates</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" style={{ width: 'auto' }} checked={settings.autoUpdate} onChange={(e) => update({ autoUpdate: e.target.checked })} />Automatic</label>
                <select value={settings.updateChannel} onChange={(e) => update({ updateChannel: e.target.value as 'stable' | 'beta' })}><option value="stable">Stable channel</option><option value="beta">Beta channel</option></select>
                <button className="btn" onClick={() => window.termflow.updates.check(settings.updateChannel)}>Check now</button>
              </div>
              <div style={{ marginTop: 6, color: updateStatus.status === 'error' ? 'var(--danger)' : 'var(--text-muted)', fontSize: 10, overflowWrap: 'anywhere' }}>
                Status: {updateStatus.status === 'no-releases'
                  ? 'No published releases found on GitHub yet'
                  : `${updateStatus.status}${updateStatus.detail ? ` · ${updateStatus.detail.slice(0, 160)}` : ''}`}
              </div>
              {updateStatus.status === 'ready' && <button className="btn primary" style={{ marginTop: 7 }} onClick={() => window.termflow.updates.install()}>Restart and install update</button>}
            </div>
          </>
        )}

        {/* Terminal tab */}
        {activeTab === 'terminal' && (
          <>
            <div className="field">
              <label>Scrollback lines</label>
              <select value={settings.scrollback} onChange={(e) => update({ scrollback: Number(e.target.value) })}>
                {SCROLLBACK.map((n) => (<option key={n} value={n}>{n.toLocaleString()} lines</option>))}
              </select>
            </div>

            <div className="field">
              <label>tmux prefix key</label>
              <select value={settings.prefixKey} onChange={(e) => update({ prefixKey: e.target.value as 'ctrl+a' | 'ctrl+b' })}>
                <option value="ctrl+a">Ctrl+A</option>
                <option value="ctrl+b">Ctrl+B</option>
              </select>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Press the prefix, then a command key (% split, &quot;, z zoom, c new window, ? help).
                Pressing it twice sends the key itself to the terminal.
              </p>
            </div>

            <div className="field">
              <label>New terminal opens</label>
              <select
                value={settings.newTerminalTarget}
                onChange={(e) => update({ newTerminalTarget: e.target.value as 'pane' | 'window' })}
              >
                <option value="pane">As a pane in the current window (tiled)</option>
                <option value="window">As a new window (tab)</option>
              </select>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Tiled keeps every terminal visible side by side, like tmux. Window tabs stay available either way.
              </p>
            </div>

            <div className="field">
              <label>Editor command</label>
              <input
                type="text"
                value={settings.editorCommand}
                placeholder='code -g "{path}:{line}:{col}"'
                onChange={(e) => update({ editorCommand: e.target.value })}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Runs when you click a file path in terminal output. Placeholders:{' '}
                <code>{'{path}'}</code>, <code>{'{line}'}</code>, <code>{'{col}'}</code>.
                Leave empty to use the system default application.
              </p>
            </div>

            <div className="field">
              <label>Terminal Theme</label>
              <select value={settings.terminalTheme} onChange={(e) => update({ terminalTheme: e.target.value })}>
                {TERMINAL_THEMES.map((t) => (<option key={t.name} value={t.name}>{t.name}</option>))}
              </select>
            </div>

            <div className="field">
              <label>Font Family</label>
              <select value={settings.fontFamily} onChange={(e) => update({ fontFamily: e.target.value })}>
                {FONT_FAMILIES.map((f) => (<option key={f} value={f}>{f}</option>))}
              </select>
            </div>

            <div className="field">
              <label>Font Size: {settings.fontSize}px</label>
              <input type="range" min={10} max={24} value={settings.fontSize}
                onChange={(e) => update({ fontSize: Number(e.target.value) })} style={{ width: '100%' }} />
            </div>

            <div className="field">
              <label>Line Height: {settings.lineHeight.toFixed(1)}</label>
              <input type="range" min={1.0} max={2.0} step={0.1} value={settings.lineHeight}
                onChange={(e) => update({ lineHeight: Number(e.target.value) })} style={{ width: '100%' }} />
              {settings.lineHeight > 1.0 && (
                <p style={{ fontSize: 10, color: 'var(--warning)', marginTop: 4 }}>
                  Values above 1.0 open gaps between rows — TUI frames (claude, opencode…) will look dashed.
                </p>
              )}
            </div>

            <div className="field">
              <label>Cursor Style</label>
              <select value={settings.cursorStyle} onChange={(e) => update({ cursorStyle: e.target.value as 'block' | 'underline' | 'bar' })}>
                <option value="block">Block</option>
                <option value="underline">Underline</option>
                <option value="bar">Bar</option>
              </select>
            </div>

            <div className="field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={settings.cursorBlink} style={{ width: 'auto' }}
                  onChange={(e) => update({ cursorBlink: e.target.checked })} />
                Cursor blink
              </label>
            </div>
          </>
        )}

        {/* Highlights tab */}
        {activeTab === 'highlights' && (
          <>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>Highlight Rules</span>
              <button
                className="btn primary"
                onClick={() =>
                  setRulePrompt({
                    fields: [
                      { key: 'pattern', label: 'Regex pattern', required: true, placeholder: 'error|failed|TODO' },
                      { key: 'label', label: 'Label', placeholder: 'Build errors' }
                    ]
                  })
                }
              >
                Add Rule
              </button>
            </div>

            {highlightRules.map((rule) => (
              <div key={rule.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderBottom: '1px solid var(--border-soft)'
              }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: rule.color, flex: 'none' }} />
                <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {rule.label || rule.pattern}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>/{rule.pattern}/{rule.flags}</span>
                <button className="hbtn" title="Delete" onClick={async () => {
                  await window.termflow.highlightRules.remove(rule.id)
                  const wsId = useAppStore.getState().activeWorkspaceId
                  const rules = await window.termflow.highlightRules.list(wsId || undefined)
                  useAppStore.setState({ highlightRules: rules })
                }} style={{ color: 'var(--danger)' }}>×</button>
              </div>
            ))}
            {highlightRules.length === 0 && (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                No highlight rules defined
              </div>
            )}
          </>
        )}

        {activeTab === 'developer' && (
          <>
            <CredentialVaultSection activeWorkspaceId={activeWorkspaceId} />

            <div className="field">
              <label>Workspace Environment (plain, per workspace)</label>
              <div className="path-pick">
                <input value={envKey} onChange={(e) => setEnvKey(e.target.value)} placeholder="KEY" />
                <input value={envValue} onChange={(e) => setEnvValue(e.target.value)} placeholder="value" />
                <button
                  className="btn"
                  disabled={!activeWorkspaceId || !envKey.trim()}
                  onClick={async () => {
                    if (!activeWorkspaceId || !envKey.trim()) return
                    await window.termflow.envVars.create({
                      workspaceId: activeWorkspaceId,
                      key: envKey.trim(),
                      value: envValue,
                      masked: true
                    })
                    setEnvKey('')
                    setEnvValue('')
                    await reloadDeveloper()
                  }}
                >
                  Add
                </button>
              </div>
              <div className="env-list">
                {envVars.map((entry) => (
                  <div key={entry.id} className="env-row">
                    <span className="env-key" title={entry.key}>{entry.key}</span>
                    <span className="env-value">{maskEnvValue(entry.value)}</span>
                    <button className="hbtn danger" title="Delete" aria-label={`Delete ${entry.key}`} onClick={async () => {
                      await window.termflow.envVars.remove(entry.id)
                      await reloadDeveloper()
                    }}><X size={12} /></button>
                  </div>
                ))}
                {envVars.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>No environment variables for this workspace yet.</p>}
              </div>
            </div>

            <div className="field">
              <label>SSH Profiles</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 72px auto', gap: 8 }}>
                <input value={sshName} onChange={(e) => setSshName(e.target.value)} placeholder="Name" />
                <input value={sshHost} onChange={(e) => setSshHost(e.target.value)} placeholder="Host" />
                <input value={sshUser} onChange={(e) => setSshUser(e.target.value)} placeholder="User" />
                <input value={sshPort} onChange={(e) => setSshPort(e.target.value)} placeholder="Port" />
                <button
                  className="btn"
                  disabled={!activeWorkspaceId || !sshName.trim() || !sshHost.trim() || !sshUser.trim()}
                  onClick={async () => {
                    if (!activeWorkspaceId || !sshName.trim() || !sshHost.trim() || !sshUser.trim()) return
                    await window.termflow.sshProfiles.create({
                      workspaceId: activeWorkspaceId,
                      name: sshName.trim(),
                      host: sshHost.trim(),
                      user: sshUser.trim(),
                      port: Number(sshPort) || 22,
                      authType: sshKeyPath.trim() ? 'key' : 'agent',
                      keyPath: sshKeyPath.trim() || undefined,
                      jumpHost: sshJumpHost.trim() || undefined
                    })
                    setSshName('')
                    setSshHost('')
                    setSshUser('')
                    setSshPort('22')
                    setSshKeyPath('')
                    setSshJumpHost('')
                    await reloadDeveloper()
                  }}
                >
                  Add
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                <input value={sshKeyPath} onChange={(e) => setSshKeyPath(e.target.value)} placeholder="Key path (optional)" />
                <input value={sshJumpHost} onChange={(e) => setSshJumpHost(e.target.value)} placeholder="Jump host (optional)" />
              </div>
              <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
                {sshProfiles.map((profile) => (
                  <div key={profile.id} className="info-row">
                    <span>{profile.name}</span>
                    <span className="v">{profile.user}@{profile.host}:{profile.port}</span>
                    <button className="hbtn" title="Delete" onClick={async () => {
                      await window.termflow.sshProfiles.remove(profile.id)
                      await reloadDeveloper()
                    }}>x</button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 12 }}>
              WebGL / scrollback changes apply to new terminals.
            </p>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
      {rulePrompt && (
        <PromptModal
          title="Add Highlight Rule"
          fields={rulePrompt.fields}
          submitLabel="Add Rule"
          onClose={() => setRulePrompt(null)}
          onSubmit={async (values) => {
            const wsId = useAppStore.getState().activeWorkspaceId
            await window.termflow.highlightRules.create({
              pattern: values.pattern,
              flags: 'gi',
              color: HIGHLIGHT_COLORS[0],
              label: values.label || values.pattern,
              workspaceId: wsId,
              notifyOnMatch: false
            })
            const rules = await window.termflow.highlightRules.list(wsId || undefined)
            useAppStore.setState({ highlightRules: rules })
          }}
        />
      )}
    </div>
  )
}

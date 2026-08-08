import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  Plus,
  Bot,
  Settings,
  Search,
  ChevronDown,
  Radio,
  Activity
  ,MoreHorizontal
  ,FolderOpen
  ,CircleHelp
  ,Trash2
  ,FileSearch
  ,PanelLeftOpen
  ,Puzzle
  ,SlidersHorizontal
  ,Pencil
  ,LayoutGrid
} from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { PROFILES } from '../profiles'
import CustomCommandModal from './CustomCommandModal'
import DeveloperWorkbench from './DeveloperWorkbench'
// Rarely-opened heavy modals: code-split out of the startup bundle.
const GlobalSearchModal = lazy(() => import('./GlobalSearchModal'))
const PluginManagerModal = lazy(() => import('./PluginManagerModal'))
const ProviderManagerModal = lazy(() => import('./ProviderManagerModal'))
import ConfirmModal from './ConfirmModal'
import ProfileModal from './ProfileModal'
import type { AiProviderProfile, ShellKind } from '../../../shared/types'

type PendingProfileDelete = { name: string; custom: boolean; id?: string; kind?: ShellKind }

interface Props {
  onOpenSettings: () => void
  onOpenPalette: () => void
  onOpenHelp: () => void
  onOpenTerminalLauncher: () => void
  onOpenProviderManager: () => void
}

function useOutside(cb: () => void): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) cb()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [cb])
  return ref
}

export default function Toolbar({ onOpenSettings, onOpenPalette, onOpenHelp, onOpenTerminalLauncher, onOpenProviderManager }: Props): React.JSX.Element {
  const addTerminal = useAppStore((s) => s.addTerminal)
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId)
  const broadcastEnabled = useAppStore((s) => s.broadcastEnabled)
  const toggleBroadcast = useAppStore((s) => s.toggleBroadcast)
  const tileAllWindows = useAppStore((s) => s.tileAllWindows)
  const sshProfiles = useAppStore((s) => s.sshProfiles)
  const launchSshProfile = useAppStore((s) => s.launchSshProfile)
  const providerProfiles = useAppStore((s) => s.settings.providerProfiles)
  const customAgents = useAppStore((s) => s.settings.customAgents)
  const hiddenAgentKinds = useAppStore((s) => s.settings.hiddenAgentKinds)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const profileOverrides = new Map(customAgents.filter((agent) => agent.kind).map((agent) => [agent.kind, agent]))

  const [termMenu, setTermMenu] = useState(false)
  const [moreMenu, setMoreMenu] = useState(false)
  const [customModal, setCustomModal] = useState(false)
  const [globalSearchModal, setGlobalSearchModal] = useState(false)
  const [workbench, setWorkbench] = useState(false)
  const [plugins, setPlugins] = useState(false)
  const [providerManagerId, setProviderManagerId] = useState<string | null>(null)
  const [pendingProfileDelete, setPendingProfileDelete] = useState<PendingProfileDelete | null>(null)
  const [pendingProviderDelete, setPendingProviderDelete] = useState<AiProviderProfile | null>(null)
  const [profileModal, setProfileModal] = useState(false)
  const termRef = useOutside(() => setTermMenu(false))
  const moreRef = useOutside(() => setMoreMenu(false))

  const create = (kind: ShellKind): void => {
    setTermMenu(false)
    if (kind === 'custom') setCustomModal(true)
    else addTerminal(kind)
  }

  // Plain shells (no startup command) vs. profiles that launch a command.
  // Both are equal-status profiles; the split only groups the menu.
  const shells = PROFILES.filter((p) => !p.startupCommand)
  const commandProfiles = PROFILES.filter((p) => p.startupCommand && !(hiddenAgentKinds ?? []).includes(p.kind))
  const disabled = !activeWorkspaceId

  const openProfileEditor = (): void => {
    setTermMenu(false)
    setProfileModal(true)
  }

  const confirmProfileDelete = (): void => {
    const target = pendingProfileDelete
    if (!target) return
    if (target.custom) {
      void updateSettings({ customAgents: customAgents.filter((a) => a.id !== target.id) })
    } else if (profileOverrides.has(target.kind)) {
      void updateSettings({ customAgents: customAgents.filter((a) => a.kind !== target.kind) })
    } else if (target.kind) {
      void updateSettings({ hiddenAgentKinds: [...(hiddenAgentKinds ?? []), target.kind] })
    }
  }

  const confirmProviderDelete = (): void => {
    if (!pendingProviderDelete) return
    void updateSettings({ providerProfiles: providerProfiles.filter((p) => p.id !== pendingProviderDelete.id) })
  }

  return (
    <div className="toolbar">
      <div className="brand">
        <svg className="logo" viewBox="0 0 512 512" aria-hidden>
          <rect x="24" y="24" width="464" height="464" rx="104" fill="#20242c" stroke="#2f3440" strokeWidth="6" />
          <path d="M136 176l60 60l-60 60" fill="none" stroke="#2f80ff" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M256 316h96" fill="none" stroke="#f5e642" strokeWidth="34" strokeLinecap="round" />
        </svg>
        <span className="tb-label">TermFlow</span>
      </div>

      <div className="tb-group" ref={termRef} style={{ position: 'relative' }}>
        <div className="split-btn">
          <button
            className="tb-btn primary split-main"
            disabled={disabled}
            title="New window (CMD)"
            onClick={() => {
              setTermMenu(false)
              addTerminal('cmd')
            }}
          >
            <Plus size={15} /> <span className="tb-label">New Terminal</span>
          </button>
          <button
            className="tb-btn primary split-caret"
            disabled={disabled}
            title="Select terminal type"
            onClick={() => setTermMenu((v) => !v)}
          >
            <ChevronDown size={13} />
          </button>
        </div>
        {termMenu && (
          <div className="menu" style={{ top: 36, left: 0 }}>
            <div className="menu-label">Shells</div>
            <div className="menu-item" onClick={() => { setTermMenu(false); onOpenTerminalLauncher() }}>
              <FolderOpen size={14} color="var(--accent)" />
              Open terminal at folder...
            </div>
            <div className="menu-sep" />
            {shells.map((p) => (
              <div key={p.kind} className="menu-item" onClick={() => create(p.kind)}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color }} />
                {p.label}
              </div>
            ))}
            <div className="menu-sep" />
            <div className="menu-label">SSH Profiles</div>
            {sshProfiles.length === 0 && <div className="menu-empty">No SSH profiles</div>}
            {sshProfiles.map((profile) => (
              <div
                key={profile.id}
                className="menu-item"
                onClick={() => {
                  setTermMenu(false)
                  launchSshProfile(profile)
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 4, background: '#7b68ee' }} />
                {profile.name}
              </div>
            ))}
            <div className="menu-sep" />
            <div className="menu-label">Command Profiles</div>
            {commandProfiles.map((p) => {
              const override = profileOverrides.get(p.kind)
              return (
              <div key={p.kind} className="menu-item" onClick={() => {
                setTermMenu(false)
                addTerminal(p.kind, {
                  name: override?.name ?? p.label,
                  startupCommand: override?.command ?? p.startupCommand,
                  bypassArgs: override?.fullPermissionArgs ?? p.bypassArgs
                })
              }}>
                <Bot size={14} color={override?.color ?? p.color} />
                {override?.name ?? p.label}
                <span className="row-actions">
                  <button title="Edit profile" aria-label={`Edit ${override?.name ?? p.label}`} onClick={(e) => { e.stopPropagation(); openProfileEditor() }}><Pencil size={13} /></button>
                  <button className="danger" title="Delete profile" aria-label={`Delete ${override?.name ?? p.label}`} onClick={(e) => { e.stopPropagation(); setTermMenu(false); setPendingProfileDelete({ name: override?.name ?? p.label, custom: false, kind: p.kind }) }}><Trash2 size={13} /></button>
                </span>
              </div>
              )
            })}
            {customAgents.filter((agent) => !agent.kind).map((a) => (
              <div key={a.id} className="menu-item" onClick={() => {
                setTermMenu(false)
                addTerminal('custom', { name: a.name, startupCommand: a.command, cleanProviderEnv: true })
              }}>
                <Bot size={14} color={a.color} />
                {a.name}
                <span className="row-actions">
                  <button title="Edit profile" aria-label={`Edit ${a.name}`} onClick={(e) => { e.stopPropagation(); openProfileEditor() }}><Pencil size={13} /></button>
                  <button className="danger" title="Delete profile" aria-label={`Delete ${a.name}`} onClick={(e) => { e.stopPropagation(); setTermMenu(false); setPendingProfileDelete({ name: a.name, custom: true, id: a.id }) }}><Trash2 size={13} /></button>
                </span>
              </div>
            ))}
            <div className="menu-item" onClick={() => { setTermMenu(false); setProfileModal(true) }}>
              <Plus size={14} /> Add profile...
            </div>
            <div className="menu-sep" />
            <div className="menu-label">AI Providers</div>
            {providerProfiles.map((provider) => (
              <div key={provider.id} className="menu-item" onClick={() => {
                setTermMenu(false)
                const env: Record<string, string> = {}
                if (provider.baseUrlEnv && provider.baseUrl) env[provider.baseUrlEnv] = provider.baseUrl
                if (provider.modelEnv && provider.model) env[provider.modelEnv] = provider.model
                // Route full-permission flags through the bypass mechanism (not
                // baked into the command) so they respect the auto-approve
                // setting and the node shows the "bypass" badge like agents do.
                addTerminal('custom', { name: provider.name, startupCommand: provider.command, env, bypassArgs: provider.fullPermissionArgs || undefined })
              }}>
                <Bot size={14} color={provider.color} />
                {provider.name}
                <span className="row-actions">
                  <button title="Edit provider" aria-label={`Edit ${provider.name}`} onClick={(e) => { e.stopPropagation(); setTermMenu(false); setProviderManagerId(provider.id) }}><Pencil size={13} /></button>
                  <button className="danger" title="Delete provider" aria-label={`Delete ${provider.name}`} onClick={(e) => { e.stopPropagation(); setTermMenu(false); setPendingProviderDelete(provider) }}><Trash2 size={13} /></button>
                </span>
              </div>
            ))}
            <div className="menu-item" onClick={() => { setTermMenu(false); onOpenProviderManager() }}>
              <Settings size={14} /> Configure providers...
            </div>
          </div>
        )}
      </div>


      <div className="spacer" />

      <button className="tb-btn" title="Command Palette (Ctrl+K)" aria-label="Command Palette" onClick={onOpenPalette}>
        <Search size={15} />
      </button>

      <button
        className={`tb-btn danger ${disabled ? 'disabled' : ''}`}
        title="Close all terminals"
        aria-label="Close all terminals"
        disabled={disabled}
        onClick={() => { if (disabled) return; window.dispatchEvent(new CustomEvent('termflow:close-all-terminals')) }}
      >
        <Trash2 size={15} />
      </button>

      <div className="tb-group" ref={moreRef} style={{ position: 'relative' }}>
        <button className="tb-btn" title="More" aria-label="More actions" onClick={() => setMoreMenu((v) => !v)}>
          <MoreHorizontal size={15} />
        </button>
        {moreMenu && (
          <div className="menu" style={{ top: 36, right: 0 }}>
            <div className="menu-label">Terminals</div>
            <div
              className={`menu-item ${disabled ? 'disabled' : ''} ${broadcastEnabled ? 'active' : ''}`}
              title="Broadcast input to all terminals in group"
              onClick={() => { if (disabled) return; toggleBroadcast() }}
            >
              <Radio size={14} color={broadcastEnabled ? 'var(--accent)' : undefined} />
              Broadcast
              {broadcastEnabled && <span style={{ marginLeft: 'auto' }}>✓</span>}
            </div>
            <div
              className={`menu-item danger ${disabled ? 'disabled' : ''}`}
              title="Close all terminals"
              onClick={() => { if (disabled) return; setMoreMenu(false); window.dispatchEvent(new CustomEvent('termflow:close-all-terminals')) }}
            >
              <Trash2 size={14} />
              Close All
            </div>
            <div
              className={`menu-item ${disabled ? 'disabled' : ''}`}
              title="Merge every window into one tiled window"
              onClick={() => { if (disabled) return; setMoreMenu(false); tileAllWindows() }}
            >
              <LayoutGrid size={14} />
              Tile all windows into one
            </div>
            <div
              className="menu-item"
              title="Search all terminals"
              onClick={() => { setMoreMenu(false); setGlobalSearchModal(true) }}
            >
              <FileSearch size={14} />
              Global Search
            </div>

            <div className="menu-sep" />
            <div className="menu-label">Profiles</div>
            <div
              className="menu-item"
              title="Terminal profiles"
              onClick={() => { setMoreMenu(false); setProfileModal(true) }}
            >
              <SlidersHorizontal size={14} />
              Profiles
            </div>

            <div className="menu-sep" />
            <div className="menu-label">Developer</div>
            <div
              className={`menu-item ${disabled ? 'disabled' : ''}`}
              title="Developer Workbench"
              onClick={() => { if (disabled) return; setMoreMenu(false); setWorkbench(true) }}
            >
              <PanelLeftOpen size={14} />
              Workbench
            </div>
            <div
              className={`menu-item ${disabled ? 'disabled' : ''}`}
              title="Command plugins and extensions"
              onClick={() => { if (disabled) return; setMoreMenu(false); setPlugins(true) }}
            >
              <Puzzle size={14} />
              Plugins / Extensions
            </div>
            <div
              className={`menu-item ${disabled ? 'disabled' : ''}`}
              title="Developer Center"
              onClick={() => { if (disabled) return; setMoreMenu(false); window.dispatchEvent(new CustomEvent('termflow:open-developer-center')) }}
            >
              <Activity size={14} />
              Developer Center
            </div>

            <div className="menu-sep" />
            <div
              className="menu-item"
              title="Help"
              onClick={() => { setMoreMenu(false); onOpenHelp() }}
            >
              <CircleHelp size={14} />
              Help
            </div>
          </div>
        )}
      </div>

      <button className="tb-btn" title="Settings" aria-label="Open Settings" onClick={onOpenSettings}>
        <Settings size={15} />
      </button>

      {customModal && (
        <CustomCommandModal
          onClose={() => setCustomModal(false)}
          onSubmit={(cmd) => {
            setCustomModal(false)
            addTerminal('custom', { startupCommand: cmd, name: cmd.split(' ')[0] || 'Custom Command' })
          }}
        />
      )}
      {globalSearchModal && <Suspense fallback={null}><GlobalSearchModal onClose={() => setGlobalSearchModal(false)} /></Suspense>}
      {workbench && <DeveloperWorkbench onClose={() => setWorkbench(false)} />}
      {plugins && <Suspense fallback={null}><PluginManagerModal onClose={() => setPlugins(false)} /></Suspense>}
      {providerManagerId !== null && <Suspense fallback={null}><ProviderManagerModal initialProviderId={providerManagerId} onClose={() => setProviderManagerId(null)} /></Suspense>}
      {pendingProfileDelete && (
        <ConfirmModal
          title="Delete profile?"
          message={`${pendingProfileDelete.name} will be removed from the New Terminal menu.`}
          confirmLabel="Delete profile"
          tone="danger"
          onConfirm={confirmProfileDelete}
          onClose={() => setPendingProfileDelete(null)}
        />
      )}
      {pendingProviderDelete && (
        <ConfirmModal
          title="Delete AI provider?"
          message={`${pendingProviderDelete.name} will be removed from TermFlow.`}
          confirmLabel="Delete provider"
          tone="danger"
          onConfirm={confirmProviderDelete}
          onClose={() => setPendingProviderDelete(null)}
        />
      )}
      {profileModal && <ProfileModal onClose={() => setProfileModal(false)} />}
    </div>
  )
}

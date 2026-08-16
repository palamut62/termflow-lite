import { ShieldCheck } from 'lucide-react'
import type { AgentPermissionMode } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { Field, Select } from './Settings'

const OPTIONS = [
  { value: 'safe', label: 'Safe - read-only / plan mode' },
  { value: 'workspace', label: 'Workspace - project writes with approvals' },
  { value: 'full', label: 'Full Access - no sandbox or approvals' }
]

export function AgentSecuritySettings(): React.JSX.Element {
  const mode = useSettingsStore((state) => state.settings.defaultAgentPermissionMode)
  const update = useSettingsStore((state) => state.update)
  return <div className="settings-section">
    <h2><ShieldCheck size={18} /> Agent Security</h2>
    <p className="settings-section-description">The selected policy is pinned when a new agent tab starts. Existing sessions are never silently elevated by a settings change.</p>
    <Field label="Default permission mode" hint="Workspace is recommended for normal development">
      <Select value={mode} options={OPTIONS} onChange={(value) => { void update({ defaultAgentPermissionMode: value as AgentPermissionMode }) }} />
    </Field>
    <div className="agent-security-grid">
      <article><strong>Safe</strong><span>Codex read-only sandbox. Claude plan mode. No file modifications.</span></article>
      <article><strong>Workspace</strong><span>Codex is confined to the active project. Claude keeps native manual approvals enabled.</span></article>
      <article><strong>Full Access</strong><span>Disables the agent sandbox and approval prompts. Use only in trusted projects.</span></article>
      <article><strong>OpenCode</strong><span>Safe and Workspace fail closed until a verified OpenCode permission contract is available.</span></article>
    </div>
  </div>
}

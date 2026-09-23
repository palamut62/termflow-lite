import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react'
import { Bot, Info, Keyboard, Palette, Server, ShieldCheck, SquareTerminal, UserRound, X } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { AppearanceSettings } from './AppearanceSettings'
import { TerminalSettings } from './TerminalSettings'
import { ProfileSettings } from './ProfileSettings'
import { KeyboardSettings } from './KeyboardSettings'
import { AboutSettings } from './AboutSettings'
import { ProviderSettings } from './ProviderSettings'
import { SshSettings } from './SshSettings'
import { AgentSecuritySettings } from './AgentSecuritySettings'
import { ProfileHealthSettings } from './ProfileHealthSettings'
import { WorkspaceSettings } from './WorkspaceSettings'
import { BackupSettings } from './BackupSettings'

type SectionId = 'appearance' | 'terminal' | 'profiles' | 'providers' | 'agent-security' | 'ssh' | 'keyboard' | 'about' | 'health' | 'workspaces' | 'backup'

const SECTIONS: { id: SectionId; label: string; icon: ReactNode; keywords: string }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} />, keywords: 'theme font size family weight ligatures line height letter spacing cursor blink gpu webgl rendering inline images opacity blur window border corner radius tab height padding custom theme' },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={14} />, keywords: 'default profile startup directory scrollback bell copy on select right click clickable paths confirm before close restore session tray quake hotkey hide on blur' },
  { id: 'profiles', label: 'Profiles', icon: <UserRound size={14} />, keywords: 'custom command profiles arguments icon color startup command starting directory default model permissions environment variables' },
  { id: 'health', label: 'Profile Health', icon: <ShieldCheck size={14} />, keywords: 'profile health check missing cli' },
  { id: 'workspaces', label: 'Workspaces', icon: <SquareTerminal size={14} />, keywords: 'project workspaces folders' },
  { id: 'backup', label: 'Backup & Restore', icon: <Server size={14} />, keywords: 'backup restore import export json' },
  { id: 'providers', label: 'Providers', icon: <Bot size={14} />, keywords: 'ai providers api key base url model cli command permissions' },
  { id: 'agent-security', label: 'Agent Security', icon: <ShieldCheck size={14} />, keywords: 'agent security permission mode safe workspace full access' },
  { id: 'ssh', label: 'SSH', icon: <Server size={14} />, keywords: 'ssh connections host user port identity file key jump host proxyjump remote directory command persistent tmux screen multiplexer forward agent extra arguments' },
  { id: 'keyboard', label: 'Keyboard', icon: <Keyboard size={14} />, keywords: 'keyboard shortcuts keybindings hotkeys' },
  { id: 'about', label: 'About', icon: <Info size={14} />, keywords: 'about updates automatic update version license product owner' }
]

/**
 * Settings modal (Faz 6, PRD §33): 5 bölüm — Appearance, Terminal, Profiles,
 * Keyboard, About. Backdrop tıklaması ve Escape kapatır; KeyboardSettings
 * kayıt modundayken Esc'i document capture'da yutar, bu listener tetiklenmez.
 */
export function Settings(): React.JSX.Element {
  const closeSettings = useSettingsStore((s) => s.closeSettings)
  const [section, setSection] = useState<SectionId>('appearance')
  const [query, setQuery] = useState('')
  // Every word must appear in the section label or its field keywords.
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const visibleSections = SECTIONS.filter((s) => {
    const haystack = `${s.label} ${s.keywords}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
  const panelRef = useRef<HTMLDivElement>(null)

  // Modal focus management: opening the modal does NOT blur the xterm
  // textarea, whose keydown handler swallows events (Escape included) before
  // they bubble to this document listener — Escape could never close the
  // modal. Focus the panel instead so keys target the modal subtree.
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closeSettings()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [closeSettings])

  return (
    <div
      className="settings-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeSettings()
      }}
    >
      <div className="settings-panel" role="dialog" aria-label="Settings" ref={panelRef} tabIndex={-1}>
        <header className="settings-header">
          <span className="settings-header-title">Settings</span>
          <button className="settings-icon-btn" onClick={closeSettings} aria-label="Close settings" title="Close (Esc)">
            <X size={16} />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            <input
              className="settings-input settings-search"
              type="search"
              value={query}
              placeholder="Search settings"
              aria-label="Search settings"
              onChange={(e) => {
                const next = e.target.value
                setQuery(next)
                // Jump to the first match so the result is visible immediately.
                const nextWords = next.trim().toLowerCase().split(/\s+/).filter(Boolean)
                const first = SECTIONS.find((s) => nextWords.every((word) => `${s.label} ${s.keywords}`.toLowerCase().includes(word)))
                if (nextWords.length > 0 && first) setSection(first.id)
              }}
            />
            {visibleSections.length === 0 && <div className="settings-search-empty">No matching settings</div>}
            {visibleSections.map((s) => (
              <button
                key={s.id}
                className={`settings-nav-item${s.id === section ? ' settings-nav-item-active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                {s.icon}
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {section === 'appearance' && <AppearanceSettings />}
            {section === 'terminal' && <TerminalSettings />}
            {section === 'profiles' && <ProfileSettings />}
            {section === 'health' && <ProfileHealthSettings />}
            {section === 'workspaces' && <WorkspaceSettings />}
            {section === 'backup' && <BackupSettings />}
            {section === 'providers' && <ProviderSettings />}
            {section === 'agent-security' && <AgentSecuritySettings />}
            {section === 'ssh' && <SshSettings />}
            {section === 'keyboard' && <KeyboardSettings />}
            {section === 'about' && <AboutSettings />}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---- Ortak form kontrolleri (CSS variable tabanlı) ---- */

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="settings-field">
      <div className="settings-field-info">
        <div className="settings-field-label">{label}</div>
        {hint && <div className="settings-field-hint">{hint}</div>}
      </div>
      <div className="settings-field-control">{children}</div>
    </div>
  )
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  // Extra classes (e.g. settings-input-wide) extend the base style instead of replacing it.
  const { className, ...rest } = props
  return <input type="text" {...rest} className={className ? `settings-input ${className}` : 'settings-input'} />
}

interface NumberInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

export function NumberInput({ value, onChange, min, max, step = 1, className }: NumberInputProps): React.JSX.Element {
  const handleChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const raw = parseFloat(e.target.value)
    if (!Number.isFinite(raw)) return
    const clamped = Math.min(max ?? raw, Math.max(min ?? raw, raw))
    // step 0.05 gibi ondalık adımlarda kayan nokta kalıntısını yuvarla.
    onChange(step >= 1 ? Math.round(clamped) : Math.round(clamped * 100) / 100)
  }
  return (
    <input
      type="number"
      className={`settings-input settings-number ${className ?? ''}`.trim()}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={handleChange}
    />
  )
}

interface SelectOption {
  value: string
  label: string
}

export function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: SelectOption[] }): React.JSX.Element {
  return (
    <select className="settings-input settings-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`settings-toggle${checked ? ' settings-toggle-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="settings-toggle-knob" />
    </button>
  )
}

interface ColorPickerProps {
  /** '#rrggbb' veya '' = tema default */
  value: string
  onChange: (value: string) => void
  /** Boş değere dönen "Default" butonu. */
  onReset?: () => void
  showReset?: boolean
}

/**
 * Renk seçici: swatch (input[type=color]) + hex text girişi. Text girişi
 * serbest yazılır, yalnızca geçerli '#rrggbb' dışarıya uygulanır.
 */
export function ColorPicker({ value, onChange, onReset, showReset = false }: ColorPickerProps): React.JSX.Element {
  const [draft, setDraft] = useState(value)

  useEffect(() => setDraft(value), [value])

  return (
    <span className="settings-color-picker">
      <input
        type="color"
        className="settings-color-input"
        value={value || '#000000'}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Pick color"
      />
      <input
        type="text"
        className="settings-input settings-color-hex"
        value={draft}
        placeholder="Default"
        spellCheck={false}
        onChange={(e) => {
          const v = e.target.value.trim()
          setDraft(v)
          if (v === '' || /^#[0-9a-f]{6}$/i.test(v)) onChange(v)
        }}
      />
      {showReset && (
        <button className="settings-btn settings-btn-small" onClick={onReset}>
          Default
        </button>
      )}
    </span>
  )
}

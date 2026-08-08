import { useEffect, useState } from 'react'
import type { ChangeEvent, InputHTMLAttributes, ReactNode } from 'react'
import { Info, Keyboard, Palette, SquareTerminal, UserRound, X } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'
import { AppearanceSettings } from './AppearanceSettings'
import { TerminalSettings } from './TerminalSettings'
import { ProfileSettings } from './ProfileSettings'
import { KeyboardSettings } from './KeyboardSettings'
import { AboutSettings } from './AboutSettings'

type SectionId = 'appearance' | 'terminal' | 'profiles' | 'keyboard' | 'about'

const SECTIONS: { id: SectionId; label: string; icon: ReactNode }[] = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={14} /> },
  { id: 'terminal', label: 'Terminal', icon: <SquareTerminal size={14} /> },
  { id: 'profiles', label: 'Profiles', icon: <UserRound size={14} /> },
  { id: 'keyboard', label: 'Keyboard', icon: <Keyboard size={14} /> },
  { id: 'about', label: 'About', icon: <Info size={14} /> }
]

/**
 * Settings modal (Faz 6, PRD §33): 5 bölüm — Appearance, Terminal, Profiles,
 * Keyboard, About. Backdrop tıklaması ve Escape kapatır; KeyboardSettings
 * kayıt modundayken Esc'i document capture'da yutar, bu listener tetiklenmez.
 */
export function Settings(): React.JSX.Element {
  const closeSettings = useSettingsStore((s) => s.closeSettings)
  const [section, setSection] = useState<SectionId>('appearance')

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
      <div className="settings-panel" role="dialog" aria-label="Settings">
        <header className="settings-header">
          <span className="settings-header-title">Settings</span>
          <button className="settings-icon-btn" onClick={closeSettings} aria-label="Close settings" title="Close (Esc)">
            <X size={16} />
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            {SECTIONS.map((s) => (
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
  return <input type="text" className="settings-input" {...props} />
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

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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

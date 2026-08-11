import { useEffect, useState } from 'react'
import { DEFAULT_SETTINGS } from '../../../shared/types'
import { normalizeShortcut } from '../shortcuts'
import { useSettingsStore } from '../store/settingsStore'

interface ActionDef {
  id: string
  label: string
}

const ACTIONS: ActionDef[] = [
  { id: 'new-tab', label: 'New Tab' },
  { id: 'close-tab', label: 'Close Tab' },
  { id: 'next-tab', label: 'Next Tab' },
  { id: 'prev-tab', label: 'Previous Tab' },
  { id: 'search', label: 'Search' },
  { id: 'settings', label: 'Settings' },
  { id: 'font-increase', label: 'Increase Font Size' },
  { id: 'font-decrease', label: 'Decrease Font Size' },
  { id: 'font-reset', label: 'Reset Font Size' },
  { id: 'toggle-broadcast', label: 'Toggle Broadcast Input' }
]

/** 'ctrl+shift+t' → 'Ctrl+Shift+T' görüntü formatı. */
function formatShortcut(shortcut: string): string {
  return shortcut
    .split('+')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('+')
}

/** Klavye kısayolları (PRD §40): her action için Change/Clear + Reset all. */
export function KeyboardSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const [recording, setRecording] = useState<string | null>(null)

  // Kayıt modu: document CAPTURE fazında dinler — window'daki App kısayol
  // handler'ından ÖNCE çalışır, stopPropagation ile eşleşen eylemler tetiklenmez.
  useEffect(() => {
    if (!recording) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setRecording(null) // Esc = iptal
        return
      }
      const normalized = normalizeShortcut(e)
      if (!normalized) return // yalnızca modifier veya desteklenmeyen tuş
      void update({ shortcuts: { ...settings.shortcuts, [normalized]: recording } })
      setRecording(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [recording, settings.shortcuts, update])

  const clearShortcut = (shortcut: string): void => {
    const next = { ...settings.shortcuts }
    delete next[shortcut]
    void update({ shortcuts: next })
  }

  return (
    <section>
      <div className="settings-section-title">Shortcuts</div>
      <div className="settings-hint">
        "Change"e tıklayıp kombinasyona basın. Esc iptal eder; Clear bağlamayı boşaltır.
      </div>
      {ACTIONS.map((action) => {
        const shortcut = Object.entries(settings.shortcuts).find(([, act]) => act === action.id)?.[0] ?? ''
        return (
          <div className="settings-shortcut-row" key={action.id}>
            <span className="settings-shortcut-label">{action.label}</span>
            <span className="settings-shortcut-bind">
              {recording === action.id ? (
                <span className="settings-kbd settings-kbd-recording">Press keys...</span>
              ) : shortcut ? (
                <span className="settings-kbd">{formatShortcut(shortcut)}</span>
              ) : (
                <span className="settings-kbd settings-kbd-empty">Unassigned</span>
              )}
            </span>
            <button
              className="settings-btn settings-btn-small"
              onClick={() => setRecording(action.id)}
              disabled={recording !== null}
            >
              Change
            </button>
            <button
              className="settings-btn settings-btn-small"
              onClick={() => clearShortcut(shortcut)}
              disabled={!shortcut || recording === action.id}
            >
              Clear
            </button>
          </div>
        )
      })}
      <div className="settings-shortcut-actions">
        <button className="settings-btn" onClick={() => void update({ shortcuts: { ...DEFAULT_SETTINGS.shortcuts } })}>
          Reset All
        </button>
      </div>
    </section>
  )
}

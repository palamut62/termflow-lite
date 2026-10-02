import { useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'

const TIPS = [
  'Ctrl+Up / Ctrl+Down jumps between commands. Right-click a command block to copy its output or rerun it.',
  'Ctrl+Shift+P opens the task palette with your package.json scripts, Git and Docker tasks.',
  'Ctrl+Shift+H searches every command you ran, across folders and profiles.',
  'Click a location like src/app.ts:42:7 in compiler output to open the file at that line.',
  'Split the terminal from the tab bar, then press Ctrl+Alt+B to type into every pane at once.',
  'Settings > Appearance has Mica / Acrylic backdrops, cursor trails and a retro CRT overlay.',
  'A command that runs longer than 10 seconds in a background tab notifies you when it finishes.',
  'Wrapped in the status bar shows your stats and badges. Nothing leaves your machine.'
]

/**
 * İlk açılışta bir kez gösterilen, kapatılabilir ipucu kartı. Karşılama ekranı
 * değildir: terminal hemen kullanılabilir, kart köşede durur.
 */
export function TipCard(): React.JSX.Element | null {
  const showTips = useSettingsStore((s) => s.settings.showTips)
  const [index, setIndex] = useState(0)
  if (!showTips) return null
  const dismiss = (): void => void useSettingsStore.getState().update({ showTips: false })
  return (
    <aside className="tip-card" aria-label="Tip">
      <Lightbulb size={14} className="tip-card-icon" />
      <div className="tip-card-body">
        <p key={index} className="tip-card-text">{TIPS[index]}</p>
        <div className="tip-card-actions">
          <span className="tip-card-count">{index + 1}/{TIPS.length}</span>
          <button className="tip-card-btn" onClick={() => setIndex((i) => (i + 1) % TIPS.length)}>Next tip</button>
          <button className="tip-card-btn" onClick={dismiss}>Got it</button>
        </div>
      </div>
      <button className="toast-close" onClick={dismiss} aria-label="Dismiss tips"><X size={12} /></button>
    </aside>
  )
}

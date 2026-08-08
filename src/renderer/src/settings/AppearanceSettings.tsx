import { Minus, Plus } from 'lucide-react'
import { getTheme, THEMES } from '../themes/themes'
import { useSettingsStore } from '../store/settingsStore'
import type { ThemeColors } from '../../../shared/types'
import { ColorPicker, Field, NumberInput, Select, TextInput, Toggle } from './Settings'

const FONT_SUGGESTIONS = [
  'Cascadia Mono',
  'Cascadia Code',
  'Consolas',
  'JetBrains Mono',
  'Fira Code',
  'Hack',
  'Meslo LG M',
  'Source Code Pro',
  'Ubuntu Mono',
  'DejaVu Sans Mono',
  'monospace'
]

const FONT_WEIGHTS = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']

const PADDING_PRESETS = [0, 4, 8, 12, 16, 20, 24]

/** Custom Theme Editor'deki 20 renk satırı (PRD §27). */
const THEME_COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'foreground', label: 'Foreground' },
  { key: 'cursor', label: 'Cursor' },
  { key: 'selection', label: 'Selection' },
  { key: 'black', label: 'Black' },
  { key: 'red', label: 'Red' },
  { key: 'green', label: 'Green' },
  { key: 'yellow', label: 'Yellow' },
  { key: 'blue', label: 'Blue' },
  { key: 'magenta', label: 'Magenta' },
  { key: 'cyan', label: 'Cyan' },
  { key: 'white', label: 'White' },
  { key: 'brightBlack', label: 'Bright Black' },
  { key: 'brightRed', label: 'Bright Red' },
  { key: 'brightGreen', label: 'Bright Green' },
  { key: 'brightYellow', label: 'Bright Yellow' },
  { key: 'brightBlue', label: 'Bright Blue' },
  { key: 'brightMagenta', label: 'Bright Magenta' },
  { key: 'brightCyan', label: 'Bright Cyan' },
  { key: 'brightWhite', label: 'Bright White' }
]

/** Mini tema önizlemesi: bg dolgusu + fg yazı + 8 base ANSI renk noktası. */
function ThemePreview({ colors }: { colors: ThemeColors }): React.JSX.Element {
  const dots = [
    colors.black,
    colors.red,
    colors.green,
    colors.yellow,
    colors.blue,
    colors.magenta,
    colors.cyan,
    colors.white
  ]
  return (
    <div className="theme-preview" style={{ background: colors.background }}>
      <div className="theme-preview-fg" style={{ color: colors.foreground }}>
        Aa
      </div>
      <div className="theme-preview-colors">
        {dots.map((c, i) => (
          <span key={i} className="theme-preview-dot" style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}

/** Appearance: tema + custom theme editor + font + cursor + window (PRD §27-§32). */
export function AppearanceSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)

  // Custom tema düzenleyici her zaman tam 20 renkle çalışır; yoksa dark palet.
  const customColors = settings.customTheme ?? getTheme('dark').colors

  return (
    <>
      <section>
        <div className="settings-section-title">Theme</div>
        <div className="settings-theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-card${t.id === settings.themeId ? ' theme-card-active' : ''}`}
              onClick={() => void update({ themeId: t.id })}
            >
              <ThemePreview colors={t.id === 'custom' ? customColors : t.colors} />
              <span className="theme-card-name">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      {settings.themeId === 'custom' && (
        <section>
          <div className="settings-section-title">Custom Theme</div>
          <div className="settings-color-list">
            {THEME_COLOR_FIELDS.map((f) => (
              <div className="settings-color-row" key={f.key}>
                <span className="settings-color-label">{f.label}</span>
                <ColorPicker
                  value={customColors[f.key]}
                  onChange={(v) => void update({ customTheme: { ...customColors, [f.key]: v } })}
                />
              </div>
            ))}
          </div>
          <button className="settings-btn" onClick={() => void update({ customTheme: null })}>
            Reset to Dark
          </button>
        </section>
      )}

      <section>
        <div className="settings-section-title">Font</div>
        <Field label="Font Family">
          <TextInput
            className="settings-input-wide"
            value={settings.fontFamily}
            onChange={(e) => void update({ fontFamily: e.target.value })}
          />
        </Field>
        <div className="settings-chips">
          {FONT_SUGGESTIONS.map((name) => (
            <button
              key={name}
              className="settings-chip"
              onClick={() =>
                void update({ fontFamily: name.includes(' ') ? `'${name}', monospace` : name })
              }
            >
              {name}
            </button>
          ))}
        </div>
        <Field label="Font Size" hint="8-32">
          <span className="settings-stepper">
            <button
              className="settings-icon-btn"
              onClick={() => void update({ fontSize: Math.max(8, settings.fontSize - 1) })}
              aria-label="Decrease font size"
            >
              <Minus size={12} />
            </button>
            <NumberInput
              className="settings-number-sm"
              value={settings.fontSize}
              min={8}
              max={32}
              onChange={(v) => void update({ fontSize: v })}
            />
            <button
              className="settings-icon-btn"
              onClick={() => void update({ fontSize: Math.min(32, settings.fontSize + 1) })}
              aria-label="Increase font size"
            >
              <Plus size={12} />
            </button>
          </span>
        </Field>
        <Field label="Font Weight">
          <Select
            value={settings.fontWeight}
            options={FONT_WEIGHTS.map((w) => ({ value: w, label: w }))}
            onChange={(v) => void update({ fontWeight: v })}
          />
        </Field>
        <Field label="Line Height" hint="0.8-2.0">
          <NumberInput value={settings.lineHeight} min={0.8} max={2} step={0.05} onChange={(v) => void update({ lineHeight: v })} />
        </Field>
        <Field label="Letter Spacing" hint="px; yalnızca UI metinlerine uygulanır — xterm canvas renderer desteklemez">
          <NumberInput value={settings.letterSpacing} min={-1} max={10} onChange={(v) => void update({ letterSpacing: v })} />
        </Field>
        <Field label="Ligatures" hint="yalnızca UI metinleri — xterm canvas'ı desteklemez">
          <Toggle checked={settings.fontLigatures} onChange={(v) => void update({ fontLigatures: v })} label="Ligatures" />
        </Field>
      </section>

      <section>
        <div className="settings-section-title">Cursor</div>
        <Field label="Style">
          <Select
            value={settings.cursorStyle}
            options={[
              { value: 'block', label: 'Block' },
              { value: 'bar', label: 'Bar' },
              { value: 'underline', label: 'Underline' }
            ]}
            onChange={(v) => void update({ cursorStyle: v as 'block' | 'bar' | 'underline' })}
          />
        </Field>
        <Field label="Blink">
          <Toggle checked={settings.cursorBlink} onChange={(v) => void update({ cursorBlink: v })} label="Cursor blink" />
        </Field>
        <Field label="Color" hint="boş = tema default">
          <ColorPicker
            value={settings.cursorColor}
            showReset
            onChange={(v) => void update({ cursorColor: v })}
            onReset={() => void update({ cursorColor: '' })}
          />
        </Field>
        <Field label="Width" hint="1-4 (bar cursor için)">
          <NumberInput value={settings.cursorWidth} min={1} max={4} onChange={(v) => void update({ cursorWidth: v })} />
        </Field>
      </section>

      <section>
        <div className="settings-section-title">Window</div>
        <Field label="Opacity" hint={`%${settings.opacity}`}>
          <input
            type="range"
            className="settings-range"
            min={60}
            max={100}
            step={1}
            value={settings.opacity}
            onChange={(e) => void update({ opacity: Number(e.target.value) })}
            aria-label="Window opacity"
          />
        </Field>
        <Field label="Blur" hint="yarı saydam arka plana blur ekler">
          <Toggle checked={settings.blur} onChange={(v) => void update({ blur: v })} label="Blur" />
        </Field>
        <Field label="Terminal Padding">
          <span className="settings-chips">
            {PADDING_PRESETS.map((p) => (
              <button
                key={p}
                className={`settings-chip${settings.terminalPadding === p ? ' settings-chip-active' : ''}`}
                onClick={() => void update({ terminalPadding: p })}
              >
                {p}px
              </button>
            ))}
            <NumberInput
              className="settings-number-sm"
              value={settings.terminalPadding}
              min={0}
              max={48}
              onChange={(v) => void update({ terminalPadding: v })}
            />
          </span>
        </Field>
        <Field label="Tab Height" hint="28-48">
          <NumberInput value={settings.tabHeight} min={28} max={48} onChange={(v) => void update({ tabHeight: v })} />
        </Field>
      </section>
    </>
  )
}

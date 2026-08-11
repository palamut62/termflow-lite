import { resolveDefaultProfileId, useSettingsStore } from '../store/settingsStore'
import { Field, NumberInput, Select, TextInput, Toggle } from './Settings'

const SCROLLBACK_OPTIONS = [
  { value: '1000', label: '1,000 lines' },
  { value: '5000', label: '5,000 lines' },
  { value: '10000', label: '10,000 lines' },
  { value: '50000', label: '50,000 lines' },
  { value: '100000', label: '100,000 lines' }
]

/** Terminal bölümü (PRD §34): default profile, startup directory, scrollback
 *  ve davranış toggle'ları. Scrollback, settings:set IPC'sinde main tarafa
 *  setScrollback ile anında uygulanır (ipc/settings.ts). */
export function TerminalSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const shells = useSettingsStore((s) => s.shells)
  const update = useSettingsStore((s) => s.update)

  // Aktif default profile'i makinede gerçekten var olanlarla çöz — select
  // değeri her zaman geçerli bir seçenek göstersin (boot'taki davranışla aynı).
  const activeDefaultId = resolveDefaultProfileId(settings, shells)

  const profileOptions = [
    ...shells.map((s) => ({ value: s.id, label: s.name })),
    ...settings.profiles.map((p) => ({ value: p.id, label: `${p.name} (custom)` }))
  ]

  return (
    <>
      <section>
        <div className="settings-section-title">Profiles &amp; Startup</div>
        <Field label="Default Profile">
          <Select
            value={activeDefaultId}
            options={profileOptions}
            onChange={(v) => void update({ defaultProfileId: v })}
          />
        </Field>
        <Field label="Startup Directory">
          <span className="settings-inline">
            <Select
              value={settings.startupDirectory}
              options={[
                { value: 'home', label: 'Home' },
                { value: 'last', label: 'Last Used' },
                { value: 'custom', label: 'Custom' }
              ]}
              onChange={(v) => void update({ startupDirectory: v as 'home' | 'last' | 'custom' })}
            />
            {settings.startupDirectory === 'custom' && (
              <TextInput
                className="settings-input-wide"
                placeholder="C:\path\..."
                value={settings.customStartupDirectory}
                onChange={(e) => void update({ customStartupDirectory: e.target.value })}
              />
            )}
          </span>
        </Field>
      </section>

      <section>
        <div className="settings-section-title">Terminal</div>
        <Field label="Scrollback" hint="mevcut oturumların ring buffer'ına da anında uygulanır">
          <Select
            value={String(settings.scrollback)}
            options={SCROLLBACK_OPTIONS}
            onChange={(v) => void update({ scrollback: Number(v) })}
          />
        </Field>
        <Field label="Bell">
          <Toggle checked={settings.bell} onChange={(v) => void update({ bell: v })} label="Bell" />
        </Field>
        <Field label="Copy on Select">
          <Toggle checked={settings.copyOnSelect} onChange={(v) => void update({ copyOnSelect: v })} label="Copy on select" />
        </Field>
        <Field label="Right Click">
          <Select
            value={settings.rightClickBehavior}
            options={[
              { value: 'context-menu', label: 'Context Menu' },
              { value: 'paste', label: 'Paste' }
            ]}
            onChange={(v) => void update({ rightClickBehavior: v as 'context-menu' | 'paste' })}
          />
        </Field>
        <Field label="Confirm Before Close">
          <Toggle checked={settings.confirmBeforeClose} onChange={(v) => void update({ confirmBeforeClose: v })} label="Confirm before close" />
        </Field>
        <Field
          label="Restore Session on Startup"
          hint="Açık sekmeler ve split düzeni yeniden açılışta geri yüklenir; process'ler yeniden başlatılır."
        >
          <Toggle
            checked={settings.restoreSession}
            onChange={(v) => void update({ restoreSession: v })}
            label="Restore session on startup"
          />
        </Field>
      </section>

      <section>
        <div className="settings-section-title">Quake Mode</div>
        <Field label="Quake Mode" hint="Global kısayolla ekranın üstünden açılıp kapanan pencere.">
          <Toggle checked={settings.quakeMode} onChange={(v) => void update({ quakeMode: v })} label="Quake mode" />
        </Field>
        <Field label="Hotkey" hint="Electron accelerator formatı (ör. F12, Ctrl+`)">
          <TextInput
            placeholder="F12"
            value={settings.quakeHotkey}
            disabled={!settings.quakeMode}
            onChange={(e) => void update({ quakeHotkey: e.target.value })}
          />
        </Field>
        <Field label="Hide on Blur">
          <Toggle
            checked={settings.quakeHideOnBlur}
            onChange={(v) => void update({ quakeHideOnBlur: v })}
            label="Hide on blur"
            disabled={!settings.quakeMode}
          />
        </Field>
        <Field label="Height" hint="çalışma alanının yüzdesi">
          <NumberInput
            value={settings.quakeHeightPercent}
            min={20}
            max={100}
            step={5}
            onChange={(v) => void update({ quakeHeightPercent: v })}
          />
        </Field>
      </section>
    </>
  )
}

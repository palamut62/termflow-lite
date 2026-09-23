import type { UpdateStatus } from '../../../shared/types'
import { useSettingsStore } from '../store/settingsStore'
import { useUpdateStore } from '../store/updateStore'
import { Field, Toggle } from './Settings'

/** Durum -> kullanıcıya gösterilecek metin. */
function statusText(status: UpdateStatus): string {
  switch (status.state) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `New version found: v${status.version ?? '?'}`
    case 'not-available':
      return 'You are up to date.'
    case 'downloading':
      return `Downloading… ${status.percent ?? 0}%`
    case 'downloaded':
      return `v${status.version ?? '?'} downloaded — restart to install.`
    case 'error':
      return status.error ?? 'Update check failed.'
    default:
      return status.error ?? ''
  }
}

/**
 * Hakkında bölümü: uygulama bilgisi, otomatik güncelleme, tech stack,
 * ürün sahibi ve lisans. Dış linkler yeni sekmede açılır (main tarafı
 * shell.openExternal'e yönlendirir).
 */
export function AboutSettings(): React.JSX.Element {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  // Durum kaynağı merkezi store (abonelik StatusBar'da tek yerden kurulur).
  const status = useUpdateStore((s) => s.status)

  const busy = status.state === 'checking' || status.state === 'downloading'

  return (
    <section>
      <div className="about-hero">
        <div className="about-title">TermFlow Lite</div>
        <div className="about-slogan">Minimal. Fast. Customizable.</div>
        <div className="about-version">Version {__APP_VERSION__}</div>
      </div>

      <div className="settings-section-title">Updates</div>
      <div className="about-update">
        <div className="about-update-actions">
          <button
            className="settings-btn"
            disabled={busy}
            onClick={async () => useUpdateStore.getState().setStatus(await window.termflow.updater.check())}
          >
            Check for updates
          </button>
          {status.state === 'available' && (
            <button
              className="settings-btn settings-btn-primary"
              onClick={() => void window.termflow.updater.download()}
            >
              Download
            </button>
          )}
          {status.state === 'downloaded' && (
            <button
              className="settings-btn settings-btn-primary"
              onClick={() => void window.termflow.updater.install()}
            >
              Restart and install
            </button>
          )}
        </div>
        {statusText(status) && (
          <div className={`about-update-status${status.state === 'error' ? ' settings-error' : ''}`}>
            {statusText(status)}
          </div>
        )}
      </div>
      <Field label="Automatic Update Check" hint="quietly checks for a new version on startup">
        <Toggle
          checked={settings.autoCheckUpdates}
          onChange={(autoCheckUpdates) => void update({ autoCheckUpdates })}
          label="Automatic update check"
        />
      </Field>

      <p className="about-description">
        A lightweight, fast and customizable terminal for developers. Tabs and splits,
        a full theme system (including a custom theme editor), custom and provider profiles,
        and keyboard shortcuts that fit your daily workflow.
      </p>

      <div className="settings-section-title">Tech Stack</div>
      <div className="about-stack">Electron · React · TypeScript · xterm.js · node-pty</div>

      <div className="settings-section-title">Product Owner</div>
      <div className="about-owner">Umut Çelik (palamut62)</div>
      <div className="about-links">
        <a href="https://x.com/palamut62" target="_blank" rel="noopener noreferrer">
          X / Twitter
        </a>
        <a href="https://github.com/palamut62" target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
      </div>

      <div className="settings-section-title">License</div>
      <div className="about-license">MIT License</div>
    </section>
  )
}

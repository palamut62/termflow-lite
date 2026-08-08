/**
 * Hakkında bölümü: uygulama bilgisi, tech stack, ürün sahibi ve lisans.
 * Dış linkler yeni sekmede açılır (main tarafı shell.openExternal'e yönlendirir).
 */
export function AboutSettings(): React.JSX.Element {
  return (
    <section>
      <div className="about-hero">
        <div className="about-title">TermFlow Lite</div>
        <div className="about-slogan">Minimal. Fast. Customizable.</div>
        <div className="about-version">Version {__APP_VERSION__}</div>
      </div>

      <p className="about-description">
        Hafif, hızlı ve özelleştirilebilir bir Windows terminali. Çoklu sekmeler,
        tam tema sistemi (custom theme editor dahil), özel profiller ve
        klavye kısayolları ile günlük iş akışınıza uyar.
      </p>

      <div className="settings-section-title">Tech Stack</div>
      <div className="about-stack">Electron · React · TypeScript · xterm.js · node-pty</div>

      <div className="settings-section-title">Product Owner</div>
      <div className="about-owner">Ürün Sahibi: Umut Çelik</div>
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

import { useEffect, useRef, useState } from 'react'
import { Award, Download, RotateCcw, Sparkles, X } from 'lucide-react'
import { useStatsStore } from '../store/statsStore'
import { useToastStore } from '../store/toastStore'
import { achievements, busiestHour, longestStreak, topEntries } from '../fun/stats'
import { formatDuration } from '../terminal/shellIntegration'

/** Gezinme/temizlik komutları "en çok kullanılan araç" listesini boğmasın. */
const TRIVIAL_TOOLS = new Set(['cd', 'ls', 'dir', 'cls', 'clear', 'pwd', 'exit', 'echo', 'll'])

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/**
 * "TermFlow Wrapped": yerel sayaçlardan kullanım özeti + rozetler. Kart PNG
 * olarak kaydedilebilir; veri cihazdan çıkmaz.
 */
export function Wrapped(): React.JSX.Element {
  const stats = useStatsStore((s) => s.stats)
  const hide = useStatsStore((s) => s.hide)
  const cardRef = useRef<HTMLDivElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hide])

  const tools = topEntries(Object.fromEntries(Object.entries(stats.tools).filter(([t]) => !TRIVIAL_TOOLS.has(t))), 5)
  const projects = topEntries(stats.projects, 4)
  const maxTool = Math.max(1, ...tools.map(([, n]) => n))
  const maxHour = Math.max(1, ...stats.hours)
  const peak = busiestHour(stats.hours)
  const activeDays = Object.keys(stats.days).length
  const streak = longestStreak(stats.days)
  const successRate = stats.timedCommands > 0 ? Math.round(((stats.timedCommands - stats.failures) / stats.timedCommands) * 100) : null
  const badges = achievements(stats)
  const earned = badges.filter((b) => b.earned).length

  const save = async (): Promise<void> => {
    const card = cardRef.current
    if (!card) return
    setSaving(true)
    try {
      const r = card.getBoundingClientRect()
      const path = await window.termflow.window.saveSnapshot({ x: r.left, y: r.top, width: r.width, height: r.height }, 'termflow-wrapped.png')
      if (path) useToastStore.getState().show('Saved your TermFlow Wrapped card.', 'success')
    } catch {
      useToastStore.getState().show('Could not save the image.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="palette-backdrop wrapped-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) hide() }}>
      <div className="wrapped" role="dialog" aria-label="TermFlow Wrapped">
        <div className="wrapped-card" ref={cardRef}>
          <header className="wrapped-head">
            <Sparkles size={16} />
            <div>
              <div className="wrapped-title">Your TermFlow, so far</div>
              <div className="wrapped-sub">since {new Date(stats.since).toLocaleDateString()}</div>
            </div>
          </header>

          {stats.commands === 0 ? (
            <p className="wrapped-empty">Nothing yet. Run a few commands and come back.</p>
          ) : (
            <>
              <div className="wrapped-numbers">
                <div><strong>{stats.commands.toLocaleString()}</strong><span>commands</span></div>
                <div><strong>{activeDays}</strong><span>active days</span></div>
                <div><strong>{streak}</strong><span>day streak</span></div>
                <div><strong>{successRate === null ? '-' : `${successRate}%`}</strong><span>success rate</span></div>
              </div>

              <section className="wrapped-section">
                <div className="wrapped-label">Top tools</div>
                {tools.map(([tool, n], i) => (
                  <div className="wrapped-bar" key={tool}>
                    <span className="wrapped-bar-name">{tool}</span>
                    <span className="wrapped-bar-track">
                      <span className="wrapped-bar-fill" style={{ width: `${(n / maxTool) * 100}%`, animationDelay: `${i * 60}ms` }} />
                    </span>
                    <span className="wrapped-bar-count">{n}</span>
                  </div>
                ))}
              </section>

              <section className="wrapped-section">
                <div className="wrapped-label">
                  When you work{peak !== null && <em> · busiest at {hourLabel(peak)}</em>}
                </div>
                <div className="wrapped-hours" aria-label="Commands per hour">
                  {stats.hours.map((n, h) => (
                    <span key={h} title={`${hourLabel(h)}: ${n}`} style={{ height: `${Math.max(4, (n / maxHour) * 100)}%` }} className={h === peak ? 'wrapped-hour-peak' : undefined} />
                  ))}
                </div>
              </section>

              <div className="wrapped-row">
                {projects.length > 0 && (
                  <section className="wrapped-section">
                    <div className="wrapped-label">Top projects</div>
                    <ol className="wrapped-list">{projects.map(([name, n]) => <li key={name}>{name} <small>{n}</small></li>)}</ol>
                  </section>
                )}
                {stats.longest && (
                  <section className="wrapped-section">
                    <div className="wrapped-label">Longest wait</div>
                    <div className="wrapped-longest">{formatDuration(stats.longest.durationMs)} <small>{stats.longest.tool}</small></div>
                    <div className="wrapped-label wrapped-label-gap">Time measured</div>
                    <div className="wrapped-longest">{formatDuration(stats.timedMs)}</div>
                  </section>
                )}
              </div>
            </>
          )}

          <section className="wrapped-section">
            <div className="wrapped-label">Badges · {earned}/{badges.length}</div>
            <div className="wrapped-badges">
              {badges.map((b) => (
                <span key={b.id} className={`wrapped-badge${b.earned ? ' wrapped-badge-earned' : ''}`} title={b.description}>
                  <Award size={12} />{b.title}
                </span>
              ))}
            </div>
          </section>
          <footer className="wrapped-foot">TermFlow Lite · counts only, never leaves your machine</footer>
        </div>

        <div className="wrapped-actions">
          {confirmReset ? (
            <>
              <span className="wrapped-confirm">Reset all stats?</span>
              <button className="settings-btn" onClick={() => { useStatsStore.getState().reset(); setConfirmReset(false) }}>Reset</button>
              <button className="settings-btn" onClick={() => setConfirmReset(false)}>Cancel</button>
            </>
          ) : (
            <button className="settings-btn" onClick={() => setConfirmReset(true)}><RotateCcw size={12} />Reset</button>
          )}
          <span className="status-spacer" />
          <button className="settings-btn" disabled={saving} onClick={() => void save()}><Download size={12} />Save as PNG</button>
          <button className="settings-icon-btn" onClick={hide} aria-label="Close" title="Close (Esc)"><X size={14} /></button>
        </div>
      </div>
    </div>
  )
}

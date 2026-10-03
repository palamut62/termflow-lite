import { useEffect, useRef, useState } from 'react'
import { Download, RotateCcw, X } from 'lucide-react'
import { useStatsStore } from '../store/statsStore'
import { useSettingsStore } from '../store/settingsStore'
import { useToastStore } from '../store/toastStore'
import { achievements, busiestHour, longestStreak, topEntries } from '../fun/stats'
import { formatDuration } from '../terminal/shellIntegration'

/** Gezinme/temizlik komutları "en çok kullanılan araç" listesini boğmasın. */
const TRIVIAL_TOOLS = new Set(['cd', 'ls', 'dir', 'cls', 'clear', 'pwd', 'exit', 'echo', 'll'])

/** Inner width of the ASCII card, in monospace cells. */
const W = 62
const BAR = 30
const NAME = 16
/** Rows of the hourly chart; each row holds 8 eighth-blocks. */
const CHART_ROWS = 4
const EIGHTHS = ' ▁▂▃▄▅▆▇█'

type Tone = 'dim' | 'fg' | 'strong' | 'accent' | 'green' | 'yellow' | 'cyan' | 'magenta' | 'red'
/** One run of text in one color; `title` becomes a tooltip. */
type Seg = [text: string, tone?: Tone, title?: string]
type Line = Seg[]

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

const width = (line: Line): number => line.reduce((sum, [text]) => sum + [...text].length, 0)

function fit(text: string, size: number): string {
  const chars = [...text]
  return chars.length <= size ? text.padEnd(size + text.length - chars.length) : `${chars.slice(0, size - 1).join('')}…`
}

/** `│ ` + content padded to the card width + ` │`. */
function row(...segs: Seg[]): Line {
  return [['│ ', 'dim'], ...segs, [' '.repeat(Math.max(0, W - width(segs))), 'fg'], [' │', 'dim']]
}

/** `│ ── title ─────── │`: a section rule. */
function rule(title: string, extra?: Seg): Line {
  const head: Seg[] = [['── ', 'dim'], [title, 'accent'], ...(extra ? [extra] : []), [' ', 'dim']]
  return row(...head, ['─'.repeat(Math.max(0, W - width(head))), 'dim'])
}

const edge = (left: string, right: string): Line => [[`${left}${'─'.repeat(W + 2)}${right}`, 'dim']]
const blank = (): Line => row()

/**
 * "TermFlow Wrapped": yerel sayaçlardan kullanım özeti + rozetler, terminal
 * çıktısı gibi ASCII olarak çizilir (kutu çizgileri, blok çubuklar, temanın
 * ANSI renkleri, terminal fontu). Kart PNG olarak kaydedilebilir; veri
 * cihazdan çıkmaz.
 */
export function Wrapped(): React.JSX.Element {
  const stats = useStatsStore((s) => s.stats)
  const hide = useStatsStore((s) => s.hide)
  const fontFamily = useSettingsStore((s) => s.settings.fontFamily)
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

  const since = new Date(stats.since).toLocaleDateString()
  const lines: Line[] = [edge('┌', '┐')]
  lines.push(row(['❯ ', 'green'], ['termflow wrapped', 'strong'], [' '.repeat(Math.max(1, W - 18 - since.length - 6)), 'fg'], ['since ', 'dim'], [since, 'cyan']))
  lines.push(edge('├', '┤'))

  if (stats.commands === 0) {
    lines.push(blank(), row(['Nothing yet. Run a few commands and come back.', 'dim']), blank())
  } else {
    const cells: Array<[string, string, Tone]> = [
      ['COMMANDS', stats.commands.toLocaleString(), 'strong'],
      ['ACTIVE DAYS', String(activeDays), 'strong'],
      ['DAY STREAK', String(streak), 'strong'],
      ['SUCCESS', successRate === null ? '-' : `${successRate}%`, successRate === null ? 'dim' : successRate >= 80 ? 'green' : successRate >= 50 ? 'yellow' : 'red']
    ]
    const col = Math.floor(W / cells.length)
    lines.push(blank())
    lines.push(row(...cells.map(([label]): Seg => [fit(label, col), 'dim'])))
    lines.push(row(...cells.map(([, value, tone]): Seg => [fit(value, col), tone])))
    lines.push(blank())

    lines.push(rule('top tools'))
    for (const [tool, n] of tools) {
      const filled = Math.max(1, Math.round((n / maxTool) * BAR))
      // Thin bars: full blocks would fill the whole cell and merge row into row.
      lines.push(row([fit(tool, NAME), 'fg'], [' ', 'fg'], ['━'.repeat(filled), 'cyan'], ['━'.repeat(BAR - filled), 'dim'], [` ${String(n).padStart(5)}`, 'dim']))
    }
    lines.push(blank())

    lines.push(rule('when you work', peak !== null ? [` · busiest at ${hourLabel(peak)}`, 'dim'] : undefined))
    // Each hour is a one-cell bar plus a gap; it fills in eighth-blocks from the bottom row up.
    for (let r = CHART_ROWS - 1; r >= 0; r--) {
      const segs: Seg[] = stats.hours.map((n, h): Seg => {
        const eighths = Math.round((n / maxHour) * CHART_ROWS * 8)
        const fill = Math.max(0, Math.min(8, eighths - r * 8))
        if (fill === 0) return r === 0 ? ['· ', 'dim', `${hourLabel(h)}: ${n}`] : ['  ', 'fg']
        return [`${EIGHTHS[fill]} `, h === peak ? 'yellow' : 'accent', `${hourLabel(h)}: ${n}`]
      })
      lines.push(row(...segs))
    }
    lines.push(row(['00      04      08      12      16      20    23', 'dim']))
    lines.push(blank())

    const half = Math.floor(W / 2) - 1
    if (projects.length > 0 || stats.longest) {
      const left = projects.length > 0 ? '── top projects ' : ''
      const right = stats.longest ? '── longest wait ' : ''
      lines.push(row([left.padEnd(half, left ? '─' : ' '), 'accent'], ['  ', 'fg'], [right.padEnd(W - half - 2, right ? '─' : ' '), 'accent']))
      const leftRows: Line[] = projects.map(([name, n], i) => [[`${i + 1}. `, 'dim'], [fit(name, half - 9), 'fg'], [String(n).padStart(5), 'dim']])
      const rightRows: Line[] = stats.longest
        ? [
            [[formatDuration(stats.longest.durationMs), 'yellow'], [`  ${stats.longest.tool}`, 'dim']],
            [['measured ', 'dim'], [formatDuration(stats.timedMs), 'fg']]
          ]
        : []
      for (let i = 0; i < Math.max(leftRows.length, rightRows.length); i++) {
        const l = leftRows[i] ?? []
        lines.push(row(...l, [' '.repeat(Math.max(0, half - width(l))), 'fg'], ['  ', 'fg'], ...(rightRows[i] ?? [])))
      }
      lines.push(blank())
    }
  }

  lines.push(rule('badges', [` ${earned}/${badges.length}`, earned ? 'yellow' : 'dim']))
  // Three badges per line, each "[x] Title" in a fixed column.
  const badgeCol = Math.floor(W / 3)
  for (let i = 0; i < badges.length; i += 3) {
    lines.push(row(...badges.slice(i, i + 3).flatMap((b): Seg[] => [
      [b.earned ? '[x] ' : '[ ] ', b.earned ? 'green' : 'dim', b.description],
      [fit(b.title, badgeCol - 4), b.earned ? 'strong' : 'dim', b.description]
    ])))
  }
  lines.push(edge('├', '┤'))
  lines.push(row(['counts only, never leaves your machine', 'dim'], [' '.repeat(W - 38 - 13), 'fg'], ['TermFlow Lite', 'accent']))
  lines.push(edge('└', '┘'))

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
        <div className="wrapped-card" ref={cardRef} style={{ fontFamily }}>
          <pre className="wrapped-screen">
            {lines.map((line, i) => (
              <div className="wrapped-line" key={i} style={{ '--i': i } as React.CSSProperties}>
                {line.map(([text, tone = 'fg', title], j) => (
                  <span key={j} className={`wa-${tone}`} title={title}>{text}</span>
                ))}
              </div>
            ))}
          </pre>
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

import type { IDecoration, IDisposable, IMarker, Terminal } from '@xterm/xterm'
import type { ShellIntegration } from './shellIntegration'

/** Önerinin gösterilmesi için yazılmış en az karakter sayısı. */
const MIN_PREFIX = 2

/**
 * Geçmişten (en yeni önce) yazılan önekle başlayan ilk farklı komut.
 * Çok satırlı komutlar önerilmez.
 */
export function findSuggestion(prefix: string, history: readonly string[]): string | null {
  if (prefix.trim().length < MIN_PREFIX) return null
  for (const command of history) {
    if (command.length > prefix.length && command.startsWith(prefix) && !command.includes('\n')) return command
  }
  return null
}

/**
 * fish tarzı gri satır içi öneri. Öneri, imlecin hemen sağında bir xterm
 * dekorasyonu olarak çizilir (hücre başına bir span, ızgaraya oturur); kabuğa
 * hiçbir şey yazılmaz. → ya da End ile kabul edilince kalan kısım PTY'ye
 * gönderilir. Kabuğun kendi tahmini varsa (PSReadLine) hiç devreye girmez.
 */
export class InlineSuggest implements IDisposable {
  private deco: IDecoration | null = null
  private marker: IMarker | null = null
  private remainder = ''
  private frame = 0
  private readonly subs: IDisposable[] = []

  constructor(
    private readonly term: Terminal,
    private readonly shell: ShellIntegration,
    private readonly opts: {
      enabled: () => boolean
      history: () => readonly string[]
      accept: (text: string) => void
    }
  ) {
    this.subs.push(term.onCursorMove(() => this.schedule()))
    this.subs.push(term.onData(() => this.clear()))
  }

  private schedule(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.update()
    })
  }

  private clear(): void {
    this.deco?.dispose()
    this.marker?.dispose()
    this.deco = null
    this.marker = null
    this.remainder = ''
  }

  private update(): void {
    this.clear()
    if (!this.opts.enabled() || !this.shell.active || this.shell.nativePrediction) return
    const input = this.shell.pendingInput()
    if (!input) return
    const suggestion = findSuggestion(input.text, this.opts.history())
    if (!suggestion) return
    const buf = this.term.buffer.active
    const room = this.term.cols - buf.cursorX
    const remainder = suggestion.slice(input.text.length)
    if (room <= 1 || !remainder) return
    const shown = remainder.slice(0, room - 1)
    const marker = this.term.registerMarker(0)
    if (!marker) return
    const deco = this.term.registerDecoration({ marker, x: buf.cursorX, width: shown.length, layer: 'top' })
    if (!deco) {
      marker.dispose()
      return
    }
    deco.onRender((el) => {
      if (el.dataset.ready) return
      el.dataset.ready = '1'
      el.classList.add('inline-suggest')
      // Dekorasyon kabı canvas fontunu miras almaz; terminal fontu açıkça verilir.
      el.style.fontFamily = this.term.options.fontFamily ?? 'monospace'
      el.style.fontSize = `${this.term.options.fontSize ?? 13}px`
      el.style.lineHeight = `${el.clientHeight}px`
      const cellWidth = el.clientWidth / Math.max(1, shown.length)
      for (const char of shown) {
        const span = document.createElement('span')
        span.textContent = char
        span.style.width = `${cellWidth}px`
        el.appendChild(span)
      }
    })
    this.marker = marker
    this.deco = deco
    this.remainder = remainder
  }

  /** Klavye işleyicisinden çağrılır; öneri kabul edildiyse true (tuş yutulur). */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.remainder || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false
    if (e.key !== 'ArrowRight' && e.key !== 'End') return false
    const text = this.remainder
    this.clear()
    this.opts.accept(text)
    return true
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.clear()
    for (const sub of this.subs) sub.dispose()
  }
}

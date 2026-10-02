import type { IDecoration, IDisposable, IMarker, Terminal } from '@xterm/xterm'

/**
 * OSC 133 (semantic prompt) istemcisi. Kabuk tarafındaki script'ler
 * (resources/shell-integration) her komut için A (prompt), B (girdi), C (çıktı
 * başlıyor) ve D;<exit> (bitti) gönderir; burada bunlar komut bloklarına
 * dönüşür: sol kenarda durum çizgisi, uzun/başarısız komutlarda süre ve exit
 * rozeti, Ctrl+Up/Down ile komutlar arası gezinme ve blok bazlı kopyalama.
 */

export type BlockStatus = 'running' | 'success' | 'error' | 'cancelled'

export interface CommandBlock {
  id: number
  prompt: IMarker
  input?: IMarker
  inputX: number
  output?: IMarker
  end?: IMarker
  command: string
  startedAt?: number
  finishedAt?: number
  exitCode?: number
}

export interface FinishedCommand {
  command: string
  exitCode: number
  durationMs: number
}

const MAX_BLOCKS = 500
/** Bu süreden kısa ve başarılı komutlara rozet konmaz (gürültü olmasın). */
export const BADGE_MIN_MS = 2000

export function blockStatus(exitCode: number | undefined): BlockStatus {
  if (exitCode === undefined) return 'running'
  if (exitCode === 0) return 'success'
  // 130 = SIGINT (Ctrl+C); PowerShell'de iptal edilen native komutlar -1073741510.
  if (exitCode === 130 || exitCode === -1073741510) return 'cancelled'
  return 'error'
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`
  const m = Math.floor(s / 60)
  const rest = Math.round(s % 60)
  if (m < 60) return `${m}m ${rest}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

/** OSC 633;E komut satırı kaçışlarını çözer (\\ ve \xHH). */
export function decodeCommandLine(value: string): string {
  return value.replace(/\\(\\|x([0-9a-fA-F]{2}))/g, (_m, all: string, hex?: string) =>
    hex ? String.fromCharCode(Number.parseInt(hex, 16)) : all
  )
}

export function badgeText(exitCode: number, durationMs: number): string {
  const status = blockStatus(exitCode)
  const parts: string[] = []
  if (status === 'error') parts.push(`✗ ${exitCode}`)
  else if (status === 'cancelled') parts.push('⊘')
  else parts.push('✓')
  parts.push(formatDuration(durationMs))
  return parts.join(' ')
}

export class ShellIntegration implements IDisposable {
  private readonly subs: IDisposable[] = []
  private readonly blocks: CommandBlock[] = []
  private current: CommandBlock | null = null
  private running: IDecoration | null = null
  private nextId = 1
  /** Kabuk en az bir OSC 133 gönderdiyse true (gezinme/menü yalnızca o zaman). */
  active = false

  constructor(
    private readonly term: Terminal,
    private readonly onFinished: (cmd: FinishedCommand) => void
  ) {
    this.subs.push(term.parser.registerOscHandler(133, (data) => this.handle133(data)))
    this.subs.push(term.parser.registerOscHandler(633, (data) => {
      if (data.startsWith('E;') && this.current) this.current.command = decodeCommandLine(data.slice(2)).trim()
      // Kabuğun kendi satır içi tahmini var (PSReadLine PredictionSource): ikinci bir öneri çizilmez.
      if (data === 'P;TermFlowPrediction=1') this.nativePrediction = true
      return true
    }))
  }

  /** Kabuk zaten satır içi öneri gösteriyor mu (PSReadLine prediction). */
  nativePrediction = false

  /**
   * Prompt'ta yazılmakta olan komut: imleç girdi satırında ve satırın sonundaysa
   * B işaretinden imlece kadar olan metin; aksi halde null (öneri gösterilmez).
   */
  pendingInput(): { text: string; line: number } | null {
    const block = this.current
    if (!block?.input || block.startedAt !== undefined || block.input.isDisposed) return null
    const buf = this.term.buffer.active
    if (buf.type !== 'normal') return null
    const line = buf.baseY + buf.cursorY
    if (line !== block.input.line || buf.cursorX < block.inputX) return null
    const row = buf.getLine(line)
    if (!row) return null
    if (row.translateToString(true, buf.cursorX).length > 0) return null
    return { text: row.translateToString(false, block.inputX, buf.cursorX), line }
  }

  private cursorLine(): number {
    const buf = this.term.buffer.active
    return buf.baseY + buf.cursorY
  }

  private handle133(data: string): boolean {
    this.active = true
    const [kind, arg] = data.split(';')
    if (kind === 'A') this.onPromptStart()
    else if (kind === 'B') this.onInputStart()
    else if (kind === 'C') this.onCommandStart()
    else if (kind === 'D') this.onCommandEnd(arg)
    return true
  }

  private onPromptStart(): void {
    const marker = this.term.registerMarker(0)
    if (!marker) return
    const block: CommandBlock = { id: this.nextId++, prompt: marker, inputX: 0, command: '' }
    this.blocks.push(block)
    while (this.blocks.length > MAX_BLOCKS) {
      const old = this.blocks.shift()
      for (const m of [old?.prompt, old?.input, old?.output, old?.end]) m?.dispose()
    }
    this.current = block
  }

  private onInputStart(): void {
    if (!this.current) return
    this.current.input = this.term.registerMarker(0) ?? undefined
    this.current.inputX = this.term.buffer.active.cursorX
  }

  /** C gelmeyen kabuklarda (PSReadLine yok) Enter anı başlangıç sayılır. */
  noteEnter(): void {
    const block = this.current
    if (!block || block.startedAt !== undefined || !block.input) return
    block.startedAt = performance.now()
  }

  private onCommandStart(): void {
    const block = this.current
    if (!block) return
    block.startedAt = performance.now()
    block.output = this.term.registerMarker(0) ?? undefined
    if (!block.command) block.command = this.readCommand(block)
    this.running?.dispose()
    this.running = this.decorate(block.prompt, 1, 'running') ?? null
  }

  private onCommandEnd(arg: string | undefined): void {
    this.running?.dispose()
    this.running = null
    const block = this.current
    this.current = null
    if (!block || block.startedAt === undefined) return
    if (!block.command) block.command = this.readCommand(block)
    // Boş satır ya da argümansız D (bilinmeyen sonuç): blok çizilmez.
    if (!block.command || arg === undefined || arg === '') return
    const exitCode = Number.parseInt(arg, 10)
    if (!Number.isFinite(exitCode)) return
    block.exitCode = exitCode
    block.finishedAt = performance.now()
    block.end = this.term.registerMarker(0) ?? undefined
    const durationMs = Math.round(block.finishedAt - block.startedAt)
    const endLine = block.end?.line ?? this.cursorLine()
    const height = Math.max(1, endLine - block.prompt.line)
    const status = blockStatus(exitCode)
    this.decorate(block.prompt, height, status)
    if (status !== 'success' || durationMs >= BADGE_MIN_MS) this.badge(block.prompt, badgeText(exitCode, durationMs), status)
    this.onFinished({ command: block.command, exitCode, durationMs })
  }

  /** Prompt satırındaki komut metni (B konumundan C/imleç satırına kadar). */
  private readCommand(block: CommandBlock): string {
    const buf = this.term.buffer.active
    const from = block.input?.line ?? block.prompt.line
    const to = Math.max(from, (block.output?.line ?? this.cursorLine()) - 1)
    let text = ''
    for (let y = from; y <= to; y++) {
      const line = buf.getLine(y)
      if (!line) continue
      const chunk = line.translateToString(true, y === from ? block.inputX : 0)
      text += y > from && !line.isWrapped ? `\n${chunk}` : chunk
    }
    return text.trim()
  }

  private decorate(marker: IMarker, height: number, status: BlockStatus): IDecoration | undefined {
    const deco = this.term.registerDecoration({ marker, x: 0, width: 1, height, layer: 'top' })
    deco?.onRender((el) => {
      el.classList.add('cmd-gutter', `cmd-gutter-${status}`)
    })
    return deco
  }

  private badge(marker: IMarker, text: string, status: BlockStatus): void {
    const width = Math.min(this.term.cols, text.length + 2)
    const deco = this.term.registerDecoration({ marker, anchor: 'right', x: 0, width, layer: 'top' })
    deco?.onRender((el) => {
      // xterm sağa yaslamayı `right` ile yapar ama dekorasyon kabının genişliği
      // yoktur; konum ekran genişliğinden açıkça hesaplanır.
      const screen = this.term.element?.querySelector<HTMLElement>('.xterm-screen')
      if (screen && this.term.cols > 0) {
        const cell = screen.clientWidth / this.term.cols
        el.style.right = ''
        el.style.left = `${Math.max(0, this.term.cols - width) * cell}px`
      }
      if (el.dataset.ready) return
      el.dataset.ready = '1'
      el.classList.add('cmd-badge', `cmd-badge-${status}`)
      el.textContent = text
    })
  }

  private promptLines(): number[] {
    return this.blocks.filter((b) => !b.prompt.isDisposed && b.prompt.line >= 0).map((b) => b.prompt.line)
  }

  /** Ctrl+Up/Down: görünümün üstündeki önceki/sonraki prompt'a kaydır. */
  navigate(direction: -1 | 1): boolean {
    if (!this.active) return false
    const top = this.term.buffer.active.viewportY
    const lines = this.promptLines()
    const target = direction < 0
      ? [...lines].reverse().find((l) => l < top)
      : lines.find((l) => l > top)
    if (target === undefined) {
      if (direction > 0) this.term.scrollToBottom()
      return true
    }
    this.term.scrollToLine(target)
    this.flash(target)
    return true
  }

  private flash(line: number): void {
    const marker = this.term.registerMarker(line - (this.term.buffer.active.baseY + this.term.buffer.active.cursorY))
    if (!marker) return
    const deco = this.term.registerDecoration({ marker, x: 0, width: this.term.cols, layer: 'bottom' })
    deco?.onRender((el) => el.classList.add('cmd-nav-flash'))
    setTimeout(() => {
      deco?.dispose()
      marker.dispose()
    }, 700)
  }

  /** Bir buffer satırını kapsayan tamamlanmış ya da çalışan blok. */
  blockAt(line: number): CommandBlock | null {
    let found: CommandBlock | null = null
    for (const block of this.blocks) {
      if (block.prompt.isDisposed || block.prompt.line > line) continue
      if (!block.command) continue
      found = block
    }
    if (!found) return null
    const endLine = found.end?.line ?? this.cursorLine()
    return line <= endLine ? found : null
  }

  /** Bloğun çıktısı (komut satırı hariç). */
  outputOf(block: CommandBlock): string {
    const buf = this.term.buffer.active
    const from = block.output?.line ?? (block.input?.line ?? block.prompt.line) + 1
    const to = (block.end?.line ?? this.cursorLine()) - 1
    const lines: string[] = []
    for (let y = from; y <= to; y++) {
      const line = buf.getLine(y)
      if (!line) continue
      const text = line.translateToString(true)
      if (line.isWrapped && lines.length) lines[lines.length - 1] += text
      else lines.push(text)
    }
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return lines.join('\n')
  }

  /** Ekrandaki bir fare konumunun buffer satırı. */
  lineAtClientY(clientY: number): number | null {
    const screen = this.term.element?.querySelector<HTMLElement>('.xterm-screen')
    if (!screen || this.term.rows === 0) return null
    const rect = screen.getBoundingClientRect()
    const row = Math.floor((clientY - rect.top) / (rect.height / this.term.rows))
    if (row < 0 || row >= this.term.rows) return null
    return this.term.buffer.active.viewportY + row
  }

  dispose(): void {
    this.running?.dispose()
    for (const sub of this.subs) sub.dispose()
    for (const block of this.blocks) for (const m of [block.prompt, block.input, block.output, block.end]) m?.dispose()
    this.blocks.length = 0
  }
}

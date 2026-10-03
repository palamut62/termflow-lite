// Website demo of the agent character: the app's own engine, bundled by
// `npm run build:site` into website/companion.js. A mock agent terminal on
// the left, the character panel on the right; visitors pick a character,
// a state and a style, or let it tour the states on its own.

import { CHARACTERS, CharacterEngine, type CharacterKind, type CharacterState, type CharacterStyle } from '../src/renderer/src/components/characterEngine'
import { STATE_LABELS } from '../src/renderer/src/components/characterState'

type DemoState = 'working' | 'thinking' | 'waiting' | 'done' | 'error' | 'tired' | 'angry' | 'sleeping'

interface Script {
  state: CharacterState
  tired?: boolean
  label: string
  line: string
  terminal: Array<[string, string?]>
}

const SCRIPTS: Record<DemoState, Script> = {
  working: { state: 'working', label: STATE_LABELS.working, line: 'Editing upload.ts', terminal: [['> add a retry to the upload', 'muted'], ['⏺ Read(src/upload.ts)'], ['⏺ Update(src/upload.ts)'], ['  ⎿  Updated upload.ts (+12)', 'muted']] },
  thinking: { state: 'thinking', label: STATE_LABELS.thinking, line: 'Weighing the options.', terminal: [['> why does the upload fail on slow networks?', 'muted'], ['✻ Thinking...', 'warn']] },
  waiting: { state: 'waiting', label: STATE_LABELS.waiting, line: 'Waiting for your go-ahead.', terminal: [['⏺ Bash(npm test)'], ['  Do you want to proceed?', 'warn'], ['  ❯ 1. Yes'], ['    2. No', 'muted']] },
  done: { state: 'done', label: STATE_LABELS.done, line: 'All done!', terminal: [['⏺ Bash(npm test)'], ['  ⎿  42 passed', 'ok'], ['⏺ The retry is in and every test passes.']] },
  error: { state: 'error', label: STATE_LABELS.error, line: 'Something went wrong.', terminal: [['⏺ Bash(npm run build)'], ['  ⎿  Error: Cannot find module ./config', 'bad']] },
  tired: { state: 'working', tired: true, label: 'Tired but working', line: 'Editing upload.ts (long session)', terminal: [['⏺ Update(src/upload.ts)'], ['⏺ Update(src/retry.ts)'], ['⏺ Update(src/upload.test.ts)'], ['  ...an hour of edits later', 'muted']] },
  angry: { state: 'angry', label: STATE_LABELS.angry, line: 'This error again?!', terminal: [['  ⎿  Error: Cannot find module ./config', 'bad'], ['⏺ Bash(npm run build)'], ['  ⎿  Error: Cannot find module ./config', 'bad']] },
  sleeping: { state: 'sleeping', label: STATE_LABELS.sleeping, line: 'zzz...', terminal: [['⏺ Done. Anything else?'], ['', 'muted'], ['  (no input for a while)', 'muted']] }
}

const TOUR: DemoState[] = ['working', 'thinking', 'waiting', 'done', 'tired', 'error', 'angry', 'sleeping']
const TOUR_MS = 5200
const FRAME_MS = 42

function mount(root: HTMLElement): void {
  const canvas = root.querySelector('canvas')
  const ctx = canvas?.getContext('2d')
  const term = root.querySelector<HTMLElement>('[data-demo-terminal]')
  const status = root.querySelector<HTMLElement>('[data-demo-status]')
  if (!canvas || !ctx || !term) return
  const reduce = matchMedia('(prefers-reduced-motion: reduce)')

  let kind: CharacterKind = 'ember'
  let style: CharacterStyle = 'ascii'
  let demo: DemoState = 'working'
  let touring = true
  let tourAt = performance.now()
  let engine = new CharacterEngine(kind)
  let width = 0
  let height = 0
  let visible = false
  let last = 0

  const press = (group: 'demoState' | 'demoKind' | 'demoStyle', value: string): void => {
    const attr = `data-${group.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
    root.querySelectorAll<HTMLButtonElement>(`[${attr}]`).forEach((button) => button.setAttribute('aria-pressed', String(button.dataset[group] === value)))
  }
  const script = (): Script => SCRIPTS[demo]
  const showTerminal = (): void => {
    // textContent only: the demo never builds HTML from strings.
    term.replaceChildren(...script().terminal.map(([text, tone]) => {
      const line = document.createElement('div')
      line.textContent = text || ' '
      if (tone) line.className = `t-${tone}`
      return line
    }))
    const label = `${CHARACTERS[kind].name}: ${script().label}`
    canvas.setAttribute('aria-label', label)
    if (status) status.textContent = label
  }
  const apply = (): void => {
    const s = script()
    engine.setState(s.state, !!s.tired)
    showTerminal()
    press('demoState', demo)
    press('demoKind', kind)
    press('demoStyle', style)
  }
  const paint = (): void => {
    if (!width || !height) return
    const s = script()
    engine.paint(ctx, width, height, style, [`${CHARACTERS[kind].name} / ${s.label}`, s.line])
  }
  const still = (): void => {
    engine.step(0, false)
    paint()
  }
  const measure = (): void => {
    const box = canvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    width = box.width
    height = box.height
    canvas.width = Math.max(1, Math.round(width * dpr))
    canvas.height = Math.max(1, Math.round(height * dpr))
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    still()
  }

  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!button) return
    const { demoState, demoKind, demoStyle } = button.dataset
    if (demoState && demoState in SCRIPTS) {
      demo = demoState as DemoState
      touring = false
    }
    if (demoKind && demoKind in CHARACTERS && demoKind !== kind) {
      kind = demoKind as CharacterKind
      engine = new CharacterEngine(kind)
    }
    if (demoStyle === 'ascii' || demoStyle === 'pixel') style = demoStyle
    apply()
    still()
  })

  const tick = (time: number): void => {
    requestAnimationFrame(tick)
    if (!visible || document.hidden || time - last < FRAME_MS) return
    const dt = last ? Math.min((time - last) / 1000, 0.08) : 0
    last = time
    // The tour is motion too, so reduced motion keeps the picked state.
    if (touring && !reduce.matches && time - tourAt > TOUR_MS) {
      tourAt = time
      demo = TOUR[(TOUR.indexOf(demo) + 1) % TOUR.length]
      apply()
    }
    if (reduce.matches) return
    engine.step(dt, true)
    paint()
  }

  new ResizeObserver(measure).observe(canvas)
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting
    // Coming back into view resumes without a jump.
    last = 0
  }).observe(root)
  reduce.addEventListener('change', still)
  void document.fonts?.ready.then(still)
  apply()
  measure()
  requestAnimationFrame(tick)
}

document.querySelectorAll<HTMLElement>('[data-companion-demo]').forEach(mount)

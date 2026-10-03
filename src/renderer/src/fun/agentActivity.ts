// What an agent is doing right now, read from its terminal output: the tool
// lines Claude Code (`⏺ Read(src/app.ts)`, `⏺ Bash(npm test)`) and Codex
// (`• Ran npm test`, `• Edited src/app.ts (+3 -1)`, `└ Read app.ts`) print.
// The agent animation uses it to act out the real work and say a short line
// about it. Kept out of any store: output can be heavy and must not cause
// React renders; the animation reads it once per frame.

export type ActivityKind = 'read' | 'edit' | 'write' | 'run' | 'test' | 'search' | 'web' | 'plan' | 'delegate' | 'think'

export interface AgentActivity {
  kind: ActivityKind
  /** File name, command or pattern the agent is working on ('' if none). */
  target: string
  at: number
}

const ANSI = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])/g
const CURSOR_JUMP = /\x1b\[\d*(?:;\d*)?[Hf]/g

// Claude Code: "⏺ Read(src/app.ts)", "● Update(src/a.ts)", "⏺ Bash(npm test)".
const CLAUDE_TOOL = /^[\s│]*[⏺●]\s*([A-Za-z][A-Za-z ]{1,24}?)(?:\((.*?)\)?)?\s*$/
// Codex: "• Ran npm test", "• Edited src/app.ts (+3 -1)", "• Updated Plan", "• Explored".
const CODEX_ACTION = /^[\s│]*[•◦]\s*(Ran|Running|Edited|Editing|Added|Deleted|Updated Plan|Updated|Read|Reading|Explored|Exploring|Searched|Searching|Called)\b\s*(.*)$/
// Codex sub-steps under "Explored": "└ Read app.ts", "├ Search foo".
const CODEX_STEP = /^[\s│]*[└├]\s*(Read|Search|List|Ran)\s+(.*)$/
// Claude Code 2.x: "● Reading src/app.ts", "Reading 1 file…", "Read 1 file", "● Update(src/a.ts)".
// Its TUI redraws with cursor moves, so these are searched anywhere in a chunk, not per line;
// a bare verb only counts with the bullet, the ellipsis or a count, so the echoed prompt
// ("❯ Read the file ...") does not.
const CLAUDE_V2 = /[⏺●]\s*(Reading|Read|Searching|Searched|Listing|Listed|Editing|Edited|Writing|Wrote|Updating|Updated|Update|Edit|Write|Running|Fetching|Fetched|Bash|Grep|Glob)\b[ (]+([^\s()…]+)|\b(Reading|Searching|Listing|Editing|Writing|Updating|Running|Fetching) ([^\s()…]+(?: files?| patterns?)?)…|\b(Read|Searched for|Listed|Edited|Wrote|Updated|Ran) \d+ (?:files?|patterns?|director(?:y|ies)|commands?)\b/g
const CLAUDE_V2_KINDS: Record<string, ActivityKind> = {
  reading: 'read', read: 'read', searching: 'search', searched: 'search', 'searched for': 'search', listing: 'search', listed: 'search', grep: 'search', glob: 'search',
  editing: 'edit', edited: 'edit', updating: 'edit', updated: 'edit', update: 'edit', edit: 'edit',
  writing: 'write', wrote: 'write', write: 'write', running: 'run', bash: 'run', fetching: 'web', fetched: 'web'
}
const TEST_COMMAND = /\b(?:test|tests|vitest|jest|pytest|mocha|playwright|go test|cargo test)\b/i

const CLAUDE_TOOLS: Record<string, ActivityKind> = {
  read: 'read', write: 'write', edit: 'edit', update: 'edit', multiedit: 'edit', notebookedit: 'edit',
  bash: 'run', grep: 'search', glob: 'search', search: 'search', ls: 'search', list: 'search',
  webfetch: 'web', fetch: 'web', websearch: 'web', 'web search': 'web',
  task: 'delegate', agent: 'delegate', todowrite: 'plan', 'update todos': 'plan'
}

function basename(path: string): string {
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path
}

/** Short, display-ready target: file names lose their folders, long commands get cut. */
function cleanTarget(kind: ActivityKind, raw: string): string {
  let target = raw.trim().replace(/^["'`]|["'`]$/g, '').replace(/\s+\([+-]\d+\s+[+-]\d+\)$/, '')
  if (kind === 'read' || kind === 'edit' || kind === 'write') target = basename(target.split(/[\s,]/)[0] ?? target)
  if (kind === 'search') target = target.split(',')[0].replace(/^pattern:\s*/i, '').replace(/^["']|["']$/g, '')
  if (kind === 'web') target = target.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
  return target.length > 26 ? `${target.slice(0, 25)}…` : target
}

function classify(kind: ActivityKind, target: string): AgentActivity {
  const finalKind: ActivityKind = kind === 'run' && TEST_COMMAND.test(target) ? 'test' : kind
  return { kind: finalKind, target: cleanTarget(finalKind, target), at: 0 }
}

/**
 * Terminal output as plain text. TUIs like Claude Code 2.x draw spaces as
 * cursor-forward moves and jump between rows, so a cursor jump becomes a line
 * break and every other escape sequence a space.
 */
function plainText(chunk: string): string {
  return chunk.replace(CURSOR_JUMP, '\n').replace(ANSI, ' ').replace(/ {2,}/g, ' ')
}

/** The last agent action in a chunk of output, or null if it shows none. */
export function parseActivity(chunk: string): AgentActivity | null {
  let found: AgentActivity | null = null
  for (const rawLine of plainText(chunk).split(/\r?\n|\r/)) {
    const line = rawLine.trimEnd()
    if (!line) continue
    const claude = CLAUDE_TOOL.exec(line)
    if (claude) {
      const kind = CLAUDE_TOOLS[claude[1].trim().toLowerCase()]
      if (kind) found = classify(kind, claude[2] ?? '')
      continue
    }
    const codex = CODEX_ACTION.exec(line)
    if (codex) {
      const verb = codex[1]
      const kind: ActivityKind = /^Ran|^Running/.test(verb) ? 'run'
        : verb === 'Updated Plan' ? 'plan'
          : /^(Edited|Editing|Added|Deleted|Updated)$/.test(verb) ? 'edit'
            : /^(Searched|Searching)$/.test(verb) ? 'search'
              : verb === 'Called' ? 'web'
                : 'read'
      found = classify(kind, codex[2])
      continue
    }
    const step = CODEX_STEP.exec(line)
    if (step) {
      found = classify(step[1] === 'Ran' ? 'run' : step[1] === 'Read' ? 'read' : 'search', step[2])
      continue
    }
    for (const match of line.matchAll(CLAUDE_V2)) {
      const kind = CLAUDE_V2_KINDS[(match[1] ?? match[3] ?? match[5]).toLowerCase()]
      // Summaries ("Read 1 file", "Reading 2 files…") give the kind, not a file name.
      const target = match[2] ?? match[4] ?? ''
      // A bulleted verb needs a real target ("Bash(npm test)", a path), not prose like "Reading is ...".
      if (match[1] && !match[0].includes('(') && !/[./\\:]/.test(target)) continue
      if (kind) found = classify(kind, /^\d/.test(target) ? '' : target)
    }
  }
  return found
}

// ---- Busy pulse ----
// Whether an agent is working, read from its own busy indicator rather than
// from the prompt: Claude Code and Codex keep redrawing their input box and
// status line even when idle, so "output arrived" means nothing. While busy,
// both animate a spinner line ("✻ Sautéing… (5s · ↓ 120 tokens · thinking)",
// "• Working (3s • esc to interrupt)") about ten times a second; a finished
// turn prints "✻ Cooked for 8s" / "Worked for 1m 2s".

const BUSY = /[✢✳✶✻✽·*•]\s*[A-Z]\p{L}+…|[A-Z]\p{L}+ing…|…\s*\(|↓\s*\d+\s*tokens|esc to interrupt|running \w+ hooks|^\s*[✢✳✶✻✽*·]\s*\d*\s*$/u
const THINKING = /(?:^|[\s·(])thinking(?:\)|\s*$)/
const TURN_END = /\b[A-Z][a-z]+ for (?:\d+h )?(?:\d+m )?\d+s\b/

export interface AgentPulse {
  /** Last time the busy spinner was seen. */
  busyAt?: number
  /** Last time the spinner said it was thinking. */
  thinkingAt?: number
  /** Last time a turn ended ("Cooked for 8s"). */
  endAt?: number
}

const pulses = new Map<string, AgentPulse>()

/** Updates `pulse` from one output chunk. */
export function readPulse(pulse: AgentPulse, chunk: string, now: number): void {
  const text = plainText(chunk)
  if (BUSY.test(text)) pulse.busyAt = now
  if (THINKING.test(text)) pulse.thinkingAt = now
  if (TURN_END.test(text)) pulse.endAt = now
}

/** The agent's busy pulse, or undefined if it never showed a busy indicator. */
export function agentPulse(tabId: string): AgentPulse | undefined {
  return pulses.get(tabId)
}

// ---- Per-tab state (no store, no re-render) ----

const latest = new Map<string, AgentActivity>()

/** Feed an agent tab's output chunk; remembers its latest action. */
export function noteAgentOutput(tabId: string, chunk: string, now = Date.now()): void {
  const activity = parseActivity(chunk)
  if (activity) latest.set(tabId, { ...activity, at: now })
  const pulse = pulses.get(tabId) ?? {}
  readPulse(pulse, chunk, now)
  if (pulse.busyAt !== undefined || pulse.endAt !== undefined) pulses.set(tabId, pulse)
}

/** The agent's latest action, or null if it showed none in the last `maxAgeMs`. */
export function currentActivity(tabId: string, now = Date.now(), maxAgeMs = 25_000): AgentActivity | null {
  const activity = latest.get(tabId)
  return activity && now - activity.at <= maxAgeMs ? activity : null
}

export function forgetActivity(tabId: string): void {
  latest.delete(tabId)
  pulses.delete(tabId)
}

const FACTS: Record<ActivityKind, (target: string) => string> = {
  read: (t) => (t ? `Reading ${t}` : 'Reading the code'),
  edit: (t) => (t ? `Editing ${t}` : 'Editing files'),
  write: (t) => (t ? `Writing ${t}` : 'Writing a new file'),
  run: (t) => (t ? `Running ${t}` : 'Running a command'),
  test: (t) => (t ? `Running ${t}` : 'Running the tests'),
  search: (t) => (t ? `Searching "${t}"` : 'Searching the code'),
  web: (t) => (t ? `Looking up ${t}` : 'Looking things up'),
  plan: () => 'Updating the plan',
  delegate: () => 'Briefing a helper',
  think: () => 'Thinking...'
}

const QUIPS: Record<ActivityKind, string[]> = {
  read: ['Every file is a clue.', 'Reading the map first.'],
  edit: ['Measure twice, edit once.', 'One careful change.'],
  write: ['Fresh file, fresh start.'],
  run: ['Pressing the big button.', 'Let us see what it says.'],
  test: ['Stand back, it may erupt!', 'Fingers crossed.'],
  search: ['Digging for clues.', 'It is in here somewhere.'],
  web: ['Checking the docs.'],
  plan: ['Ticking boxes.'],
  delegate: ['Calling in backup.'],
  think: ['Hmm, let me think.', 'Connecting the dots.']
}

/** How long a new action is always announced plainly before any quip. */
const FACT_FIRST_MS = 6000

/**
 * The short line the critter says about its work. Mostly the plain fact
 * ("Editing app.ts"); every third window (~5 s) a little quip instead, but
 * never in the first seconds of a new action (`now` is the current time).
 */
export function activityLine(activity: AgentActivity | null, tick: number, now?: number): string {
  const kind = activity?.kind ?? 'think'
  const window = Math.floor(Math.max(0, tick) / 45)
  const fresh = activity !== null && now !== undefined && now - activity.at < FACT_FIRST_MS
  if (window % 3 === 2 && !fresh) {
    const quips = QUIPS[kind]
    return quips[Math.floor(window / 3) % quips.length]
  }
  return FACTS[kind](activity?.target ?? '')
}

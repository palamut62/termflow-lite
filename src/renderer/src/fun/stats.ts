/**
 * Yerel kullanım istatistikleri ("TermFlow Wrapped"). Gizlilik: komutun
 * yalnızca ilk kelimesi (araç adı: git, npm, ...) ve sayaçlar tutulur; argüman,
 * yol ya da çıktı asla saklanmaz. Hiçbir veri makineden çıkmaz.
 */

export interface UsageStats {
  version: 1
  since: number
  commands: number
  failures: number
  /** Komut başına ölçülen süreler (shell integration). */
  timedCommands: number
  timedMs: number
  tools: Record<string, number>
  hours: number[]
  days: Record<string, number>
  projects: Record<string, number>
  longest: { tool: string; durationMs: number } | null
  agentSessions: number
}

export interface Achievement {
  id: string
  title: string
  description: string
  earned: boolean
}

const MAX_TOOLS = 80
const MAX_PROJECTS = 60
const MAX_DAYS = 400

export function emptyStats(now = Date.now()): UsageStats {
  return {
    version: 1,
    since: now,
    commands: 0,
    failures: 0,
    timedCommands: 0,
    timedMs: 0,
    tools: {},
    hours: Array.from({ length: 24 }, () => 0),
    days: {},
    projects: {},
    longest: null,
    agentSessions: 0
  }
}

/** Komutun araç adı: ilk kelime, yol ve uzantı olmadan; `sudo`/`npx` atlanır. */
export function toolOf(command: string): string {
  const words = command.trim().split(/\s+/)
  let word = words[0] ?? ''
  if ((word === 'sudo' || word === 'npx' || word === 'pnpx' || word === 'bunx' || word === '&') && words[1]) word = words[1]
  word = word.replace(/^['"&.]+|['"]+$/g, '')
  const base = word.split(/[\\/]/).pop() ?? word
  return base.toLowerCase().replace(/\.(exe|cmd|bat|ps1|sh)$/, '').slice(0, 32)
}

export function dayKey(at: number): string {
  const d = new Date(at)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function bump(record: Record<string, number>, key: string, max: number): Record<string, number> {
  const next = { ...record, [key]: (record[key] ?? 0) + 1 }
  const keys = Object.keys(next)
  if (keys.length <= max) return next
  // En az kullanılanı düşür (yeni eklenen hariç).
  const victim = keys.filter((k) => k !== key).sort((a, b) => next[a] - next[b])[0]
  if (victim) delete next[victim]
  return next
}

function projectOf(cwd: string): string {
  const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
  return parts[parts.length - 1] || cwd
}

export function recordCommand(stats: UsageStats, command: string, cwd: string, at = Date.now()): UsageStats {
  const tool = toolOf(command)
  if (!tool) return stats
  const hours = [...stats.hours]
  hours[new Date(at).getHours()]++
  let days = { ...stats.days, [dayKey(at)]: (stats.days[dayKey(at)] ?? 0) + 1 }
  const dayKeys = Object.keys(days).sort()
  if (dayKeys.length > MAX_DAYS) days = Object.fromEntries(dayKeys.slice(-MAX_DAYS).map((k) => [k, days[k]]))
  return {
    ...stats,
    commands: stats.commands + 1,
    tools: bump(stats.tools, tool, MAX_TOOLS),
    hours,
    days,
    projects: cwd ? bump(stats.projects, projectOf(cwd), MAX_PROJECTS) : stats.projects
  }
}

export function recordFinish(stats: UsageStats, command: string, exitCode: number, durationMs: number): UsageStats {
  const tool = toolOf(command)
  const longest = !stats.longest || durationMs > stats.longest.durationMs ? { tool, durationMs } : stats.longest
  return {
    ...stats,
    failures: stats.failures + (exitCode === 0 ? 0 : 1),
    timedCommands: stats.timedCommands + 1,
    timedMs: stats.timedMs + Math.max(0, durationMs),
    longest
  }
}

export function recordAgentSession(stats: UsageStats): UsageStats {
  return { ...stats, agentSessions: stats.agentSessions + 1 }
}

export function topEntries(record: Record<string, number>, n: number): [string, number][] {
  return Object.entries(record).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)
}

/** Ardışık aktif günlerin en uzun serisi. */
export function longestStreak(days: Record<string, number>): number {
  const sorted = Object.keys(days).filter((k) => days[k] > 0).sort()
  let best = 0
  let run = 0
  let prev: number | null = null
  for (const key of sorted) {
    const t = Date.parse(`${key}T00:00:00`)
    run = prev !== null && Math.round((t - prev) / 86_400_000) === 1 ? run + 1 : 1
    best = Math.max(best, run)
    prev = t
  }
  return best
}

export function busiestHour(hours: number[]): number | null {
  const max = Math.max(...hours)
  return max > 0 ? hours.indexOf(max) : null
}

const TOOLCHAINS = ['node', 'npm', 'pnpm', 'yarn', 'bun', 'deno', 'python', 'python3', 'pip', 'uv', 'cargo', 'go', 'dotnet', 'java', 'mvn', 'gradle', 'ruby', 'php', 'composer', 'docker']

export function achievements(stats: UsageStats): Achievement[] {
  const sum = (from: number, to: number): number => stats.hours.slice(from, to + 1).reduce((a, b) => a + b, 0)
  const toolchains = TOOLCHAINS.filter((t) => (stats.tools[t] ?? 0) > 0).length
  return [
    { id: 'hundred', title: 'Warming Up', description: 'Run 100 commands', earned: stats.commands >= 100 },
    { id: 'thousand', title: 'Shell Dweller', description: 'Run 1,000 commands', earned: stats.commands >= 1000 },
    { id: 'git', title: 'Commit Machine', description: 'Use git 100 times', earned: (stats.tools.git ?? 0) >= 100 },
    { id: 'night', title: 'Night Owl', description: '10 commands between midnight and 5 AM', earned: sum(0, 4) >= 10 },
    { id: 'early', title: 'Early Bird', description: '10 commands between 5 and 8 AM', earned: sum(5, 7) >= 10 },
    { id: 'polyglot', title: 'Polyglot', description: 'Use 5 different toolchains', earned: toolchains >= 5 },
    { id: 'marathon', title: 'Marathon', description: 'Wait out a 10-minute command', earned: (stats.longest?.durationMs ?? 0) >= 600_000 },
    { id: 'streak', title: 'On a Roll', description: 'Use the terminal 7 days in a row', earned: longestStreak(stats.days) >= 7 },
    { id: 'agents', title: 'Agent Pilot', description: 'Start 10 agent sessions', earned: stats.agentSessions >= 10 },
    { id: 'resilient', title: 'Resilient', description: 'Survive 50 failed commands', earned: stats.failures >= 50 }
  ]
}

export function parseStats(raw: string | null): UsageStats {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<UsageStats>) : null
    if (!parsed || parsed.version !== 1) return emptyStats()
    const base = emptyStats(parsed.since)
    return {
      ...base,
      ...parsed,
      hours: Array.isArray(parsed.hours) && parsed.hours.length === 24 ? parsed.hours : base.hours
    } as UsageStats
  } catch {
    return emptyStats()
  }
}

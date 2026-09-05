import type { AgentEventKind, AgentKind, AgentPermissionMode } from './types'
import { splitCommandLine, formatArguments } from './commandLine'

const ANSI = /\x1b(?:\[[0-?]*[ -\/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g

export interface ParsedAgentEvent {
  kind: AgentEventKind
  title: string
  detail?: string
}

export function agentKindForCommand(command: string | undefined): AgentKind | null {
  const first = (command ?? '').trim().match(/^"([^"]+)"|^(\S+)/)?.slice(1).find(Boolean)?.toLowerCase()
  const executable = first?.split(/[\\/]/).at(-1)?.replace(/\.(?:cmd|exe)$/, '')
  if (executable === 'claude') return 'claude'
  if (executable === 'codex') return 'codex'
  if (executable === 'opencode') return 'opencode'
  return null
}

export function permissionArgs(agent: AgentKind, mode: AgentPermissionMode): string[] {
  if (agent === 'codex') {
    if (mode === 'safe') return ['--sandbox', 'read-only', '--ask-for-approval', 'never']
    if (mode === 'workspace') return ['--sandbox', 'workspace-write', '--ask-for-approval', 'on-request']
    return ['--dangerously-bypass-approvals-and-sandbox']
  }
  if (agent === 'claude') {
    if (mode === 'safe') return ['--permission-mode', 'plan']
    if (mode === 'workspace') return ['--permission-mode', 'manual']
    return ['--dangerously-skip-permissions']
  }
  if (mode === 'full') return ['--auto']
  return []
}

export function applyAgentPermission(command: string, mode: AgentPermissionMode): string {
  const agent = agentKindForCommand(command)
  if (!agent) return command
  const [executable, ...args] = splitCommandLine(command)
  return formatArguments([executable, ...applyPermissionArgs(executable, args, mode)])
}

export function applyPermissionArgs(command: string, args: string[], mode: AgentPermissionMode): string[] {
  const agent = agentKindForCommand(command)
  if (!agent) return args
  if (agent === 'opencode' && mode !== 'full') throw new Error('OpenCode does not support Safe or Workspace mode. Choose a compatible agent or explicitly select Full access.')
  const clean: string[] = []
  const values = ['--sandbox', '--ask-for-approval', '--permission-mode', ...(agent === 'codex' ? ['-s', '-a'] : [])]
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') return [...clean, ...permissionArgs(agent, mode), ...args.slice(i)]
    if (['--dangerously-bypass-approvals-and-sandbox', '--dangerously-skip-permissions', '--allow-dangerously-skip-permissions', '--yolo', '--auto', '--full-auto'].includes(args[i])) continue
    if (values.includes(args[i])) { i++; continue }
    if (values.some(flag => args[i].startsWith(flag + '='))) continue
    clean.push(args[i])
  }
  return [...clean, ...permissionArgs(agent, mode)]
}

/** Converts provider TUI/hook output into small, secret-free status events. */
export function parseAgentOutput(agent: AgentKind, chunk: string): ParsedAgentEvent[] {
  const text = chunk.replace(ANSI, '').replace(/\r/g, '\n')
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const events: ParsedAgentEvent[] = []
  for (const line of lines.slice(-30)) {
    const lower = line.toLowerCase()
    if (/approval required|waiting for (?:permission|approval)|permission (?:required|request)|allow this|do you want to proceed/.test(lower)) {
      events.push({ kind: 'approval', title: 'Waiting for approval', detail: safeDetail(line) })
    } else if (/waiting for (your )?(input|answer)|answer the question|select an option/.test(lower)) {
      events.push({ kind: 'question', title: 'Waiting for input', detail: safeDetail(line) })
    } else if (/running tests?|npm test|pnpm test|pytest|vitest|playwright/.test(lower)) {
      events.push({ kind: 'tool', title: 'Running tests', detail: commandHint(line) })
    } else if (/reading|searching|exploring|inspecting/.test(lower)) {
      events.push({ kind: 'activity', title: 'Inspecting project' })
    } else if (/editing|writing|updated|modified|apply_patch/.test(lower)) {
      events.push({ kind: 'tool', title: 'Editing files' })
    } else if (/error|failed|failure|fatal/.test(lower) && !/0 failed|no failures/.test(lower)) {
      events.push({ kind: 'error', title: 'Agent reported an error', detail: safeDetail(line) })
    } else if (/completed|all tests passed|done\b|finished/.test(lower)) {
      events.push({ kind: 'completed', title: 'Task completed', detail: safeDetail(line) })
    } else if (agent === 'claude' && /hook/.test(lower)) {
      events.push({ kind: 'activity', title: 'Claude hook event', detail: safeDetail(line) })
    }
  }
  return dedupe(events)
}

function safeDetail(value: string): string {
  return value
    .replace(/(?:sk-|ghp_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_\-]{8,}/g, '************')
    .slice(0, 240)
}

function commandHint(value: string): string | undefined {
  const match = value.match(/(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[\w:-]+|pytest(?:\s+[^\s]+)?|vitest|playwright/i)
  return match?.[0]
}

function dedupe(events: ParsedAgentEvent[]): ParsedAgentEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = `${event.kind}:${event.title}:${event.detail ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

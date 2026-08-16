import type { AgentEventKind, AgentKind, AgentPermissionMode } from './types'

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
  if (agent === 'opencode' && mode !== 'full') {
    return 'echo TermFlow Lite: OpenCode Safe and Workspace modes are unavailable; select Full Access only if you trust this project.'
  }
  const stripped = command
    .replace(/\s+--dangerously-bypass-approvals-and-sandbox\b/g, '')
    .replace(/\s+--dangerously-skip-permissions\b/g, '')
    .replace(/\s+--auto\b/g, '')
    .replace(/\s+--sandbox\s+(?:read-only|workspace-write|danger-full-access)\b/g, '')
    .replace(/\s+--ask-for-approval\s+(?:untrusted|on-request|never)\b/g, '')
    .replace(/\s+--permission-mode\s+(?:acceptEdits|auto|bypassPermissions|manual|dontAsk|plan)\b/g, '')
  return `${stripped.trim()} ${permissionArgs(agent, mode).join(' ')}`.trim()
}

/** Converts provider TUI/hook output into small, secret-free status events. */
export function parseAgentOutput(agent: AgentKind, chunk: string): ParsedAgentEvent[] {
  const text = chunk.replace(ANSI, '').replace(/\r/g, '\n')
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  const events: ParsedAgentEvent[] = []
  for (const line of lines.slice(-30)) {
    const lower = line.toLowerCase()
    if (/permission|approval|required|allow this|do you want to proceed/.test(lower)) {
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

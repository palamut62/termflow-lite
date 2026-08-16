import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import type { AgentEvent } from '../../shared/types'

const MAX_EVENTS = 2000

export class AgentEventStore {
  private readonly file: string

  constructor(userData: string) {
    this.file = join(userData, 'agent-events.jsonl')
  }

  append(event: AgentEvent): void {
    if (!validEvent(event)) return
    mkdirSync(dirname(this.file), { recursive: true })
    appendFileSync(this.file, `${JSON.stringify(event)}\n`, 'utf8')
  }

  list(limit = 500): AgentEvent[] {
    if (!existsSync(this.file)) return []
    const lines = readFileSync(this.file, 'utf8').split('\n').filter(Boolean).slice(-MAX_EVENTS)
    const events: AgentEvent[] = []
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as AgentEvent
        if (validEvent(event)) events.push(event)
      } catch {
        // A torn final line must not hide older valid events.
      }
    }
    return events.slice(-Math.max(1, Math.min(limit, MAX_EVENTS)))
  }

  clear(): void {
    if (existsSync(this.file)) rmSync(this.file)
  }
}

function validEvent(value: AgentEvent): boolean {
  return !!value && typeof value.id === 'string' && typeof value.tabId === 'string'
    && ['claude', 'codex', 'opencode'].includes(value.agent)
    && ['session', 'activity', 'tool', 'approval', 'question', 'completed', 'error'].includes(value.kind)
    && typeof value.title === 'string' && value.title.length > 0 && value.title.length <= 240
    && (value.detail === undefined || (typeof value.detail === 'string' && value.detail.length <= 500))
    && typeof value.createdAt === 'number'
    && ['safe', 'workspace', 'full'].includes(value.permissionMode)
}

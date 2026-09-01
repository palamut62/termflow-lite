import { createReadStream, existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, join } from 'path'
import { createInterface } from 'readline'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { redactApiKeys } from '../shared/secretRedaction'
import type { AgentKind, AgentSession, AgentSessionRef } from '../shared/types'

const execFileAsync = promisify(execFile)
const sessionFiles = new Map<string, string>()

function textFromContent(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text : typeof record.content === 'string' ? record.content : ''
    if (text.trim()) return text.trim()
  }
  return ''
}

function cleanTitle(value: string, fallback: string): string {
  const oneLine = value.replace(/\s+/g, ' ').trim()
  return oneLine ? oneLine.slice(0, 100) : fallback
}

function timestampFrom(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export async function jsonlMetadata(file: string, agent: 'claude' | 'codex'): Promise<Pick<AgentSession, 'id' | 'title' | 'cwd' | 'createdAt'> | null> {
  let id = agent === 'claude' ? basename(file, '.jsonl') : ''
  let cwd: string | undefined
  let title = ''
  let createdAt: number | undefined
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      let item: Record<string, any>
      try { item = JSON.parse(line) as Record<string, any> } catch { continue }
      createdAt ??= timestampFrom(item.timestamp)
      if (agent === 'claude') {
        if (typeof item.sessionId === 'string') id = item.sessionId
        if (!cwd && typeof item.cwd === 'string') cwd = item.cwd
        if (!title && item.type === 'user') title = textFromContent(item.message?.content)
      } else {
        if (item.type === 'session_meta') {
          if (typeof item.payload?.id === 'string') id = item.payload.id
          if (typeof item.payload?.cwd === 'string') cwd = item.payload.cwd
          createdAt ??= timestampFrom(item.payload?.timestamp)
        }
        if (!title && item.type === 'response_item' && item.payload?.type === 'message' && item.payload?.role === 'user') {
          title = textFromContent(item.payload.content)
        }
      }
      if (id && cwd && title) break
    }
  } finally {
    lines.close()
  }
  return id ? { id, cwd, title: cleanTitle(title, `${agent === 'claude' ? 'Claude' : 'Codex'} session`), ...(createdAt ? { createdAt } : {}) } : null
}

async function jsonlFiles(root: string, maxCandidates: number): Promise<Array<{ path: string; updatedAt: number }>> {
  if (!existsSync(root)) return []
  const found: Array<{ path: string; updatedAt: number }> = []
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    await Promise.all(entries.map(async (entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return walk(path)
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) return
      const info = await stat(path).catch(() => null)
      if (info) found.push({ path, updatedAt: info.mtimeMs })
    }))
  }
  await walk(root)
  return found.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, maxCandidates)
}

export async function listJsonlSessions(agent: 'claude' | 'codex', limit: number): Promise<AgentSession[]> {
  const root = join(homedir(), agent === 'claude' ? '.claude/projects' : '.codex/sessions')
  const files = await jsonlFiles(root, Math.max(limit * 3, 60))
  const sessions: AgentSession[] = []
  for (const file of files) {
    const metadata = await jsonlMetadata(file.path, agent)
    if (metadata) {
      sessionFiles.set(`${agent}:${metadata.id}`, file.path)
      sessions.push({ agent, ...metadata, updatedAt: file.updatedAt })
    }
    if (sessions.length >= limit) break
  }
  return sessions
}

export async function listOpenCodeSessions(limit: number): Promise<AgentSession[]> {
  try {
    const executable = process.platform === 'win32' ? 'opencode.cmd' : 'opencode'
    const { stdout } = await execFileAsync(executable, ['session', 'list', '--format', 'json', '--max-count', String(limit)], {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024
    })
    const parsed = JSON.parse(stdout || '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value): AgentSession[] => {
      if (!value || typeof value !== 'object') return []
      const item = value as Record<string, unknown>
      const id = typeof item.id === 'string' ? item.id : typeof item.sessionID === 'string' ? item.sessionID : ''
      if (!id) return []
      const time = typeof item.time === 'object' && item.time ? item.time as Record<string, unknown> : {}
      const updated = typeof item.updatedAt === 'number' ? item.updatedAt : typeof time.updated === 'number' ? time.updated : Date.now()
      const created = typeof item.createdAt === 'number' ? item.createdAt : typeof time.created === 'number' ? time.created : undefined
      return [{
        agent: 'opencode',
        id,
        title: cleanTitle(typeof item.title === 'string' ? item.title : '', 'OpenCode session'),
        cwd: typeof item.directory === 'string' ? item.directory : typeof item.cwd === 'string' ? item.cwd : undefined,
        ...(created !== undefined ? { createdAt: created < 10_000_000_000 ? created * 1000 : created } : {}),
        updatedAt: updated < 10_000_000_000 ? updated * 1000 : updated
      }]
    }).slice(0, limit)
  } catch {
    return []
  }
}

interface HandoverMessage {
  role: 'User' | 'Assistant'
  text: string
}

const MAX_HANDOVER_MESSAGES = 12
const MAX_HANDOVER_MESSAGE_LENGTH = 5_000
// Handover metni PTY'ye yazılır. Hedef CLI başlatılamazsa aynı metin shell'e
// düşebileceği için cmd/PowerShell/bash komut ayraçlarını tamamen kaldırırız.
const SHELL_METACHARACTERS = /[&|;<>^`$(){}\[\]!%]/g
const FALLBACK_HANDOVER = 'Continue the existing work in this folder. Inspect the working tree and current files first, preserve completed work, then finish the remaining task.'

function handoverText(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const text = typeof record.text === 'string' ? record.text : typeof record.content === 'string' ? record.content : ''
    return text ? [text] : []
  }).join(' ')
}

function formatHandoverPrompt(agent: AgentKind, messages: HandoverMessage[]): string {
  const transcript = messages.slice(-MAX_HANDOVER_MESSAGES).map(({ role, text }) => {
    const safe = redactApiKeys(text)
      .replace(/[\x00-\x1f\x7f]/g, ' ')
      .replace(SHELL_METACHARACTERS, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1200)
    return `${role}: ${safe}`
  }).filter((line) => line.length > 6).join('. ').slice(-6500)
  if (!transcript) return FALLBACK_HANDOVER
  return `Continue this task from ${agent}. Do not redo completed work. Inspect the working tree, verify the current state, and finish what remains. Previous session: ${transcript}`
}

/** Son konuşma parçalarını tek satırlık, anahtarları maskelenmiş bir devir prompt'una dönüştürür. */
export async function handoverPromptFromFile(file: string, agent: 'claude' | 'codex'): Promise<string> {
  const messages: HandoverMessage[] = []
  const remember = (message: HandoverMessage): void => {
    messages.push({ ...message, text: message.text.slice(0, MAX_HANDOVER_MESSAGE_LENGTH) })
    if (messages.length > MAX_HANDOVER_MESSAGES) messages.shift()
  }
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      let item: Record<string, any>
      try { item = JSON.parse(line) as Record<string, any> } catch { continue }
      if (agent === 'claude' && (item.type === 'user' || item.type === 'assistant')) {
        const text = handoverText(item.message?.content)
        if (text) remember({ role: item.type === 'user' ? 'User' : 'Assistant', text })
      }
      if (agent === 'codex' && item.type === 'response_item' && item.payload?.type === 'message') {
        const role = item.payload.role === 'user' ? 'User' : item.payload.role === 'assistant' ? 'Assistant' : null
        const text = handoverText(item.payload.content)
        if (role && text) remember({ role, text })
      }
    }
  } finally {
    lines.close()
  }

  return formatHandoverPrompt(agent, messages)
}

export function handoverPromptFromOpenCodeExport(value: unknown): string {
  if (!value || typeof value !== 'object') return FALLBACK_HANDOVER
  const root = value as Record<string, unknown>
  if (!Array.isArray(root.messages)) return FALLBACK_HANDOVER
  const messages = root.messages.slice(-MAX_HANDOVER_MESSAGES).flatMap((value): HandoverMessage[] => {
    if (!value || typeof value !== 'object') return []
    const message = value as Record<string, unknown>
    const info = message.info && typeof message.info === 'object' ? message.info as Record<string, unknown> : {}
    const role = (info.role ?? message.role) === 'user' ? 'User' : (info.role ?? message.role) === 'assistant' ? 'Assistant' : null
    const text = handoverText(message.parts ?? message.content)
    return role && text ? [{ role, text: text.slice(0, MAX_HANDOVER_MESSAGE_LENGTH) }] : []
  })
  return formatHandoverPrompt('opencode', messages)
}

export async function buildAgentHandoverPrompt(session: AgentSessionRef): Promise<string> {
  if (session.agent === 'opencode') {
    try {
      const executable = process.platform === 'win32' ? 'opencode.cmd' : 'opencode'
      const { stdout } = await execFileAsync(executable, ['export', session.id], {
        timeout: 8000,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024
      })
      return handoverPromptFromOpenCodeExport(JSON.parse(stdout))
    } catch {
      return FALLBACK_HANDOVER
    }
  }
  let file = sessionFiles.get(`${session.agent}:${session.id}`)
  if (!file) {
    await listJsonlSessions(session.agent, 200)
    file = sessionFiles.get(`${session.agent}:${session.id}`)
  }
  return file
    ? handoverPromptFromFile(file, session.agent)
    : FALLBACK_HANDOVER
}

export async function listAgentSessions(agents: AgentKind[] = ['claude', 'codex', 'opencode'], limit = 80): Promise<AgentSession[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)))
  const results = await Promise.all(agents.map((agent) => agent === 'opencode'
    ? listOpenCodeSessions(safeLimit)
    : listJsonlSessions(agent, safeLimit)))
  return results.flat().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, safeLimit)
}

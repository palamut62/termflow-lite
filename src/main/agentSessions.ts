import { createReadStream, existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, join } from 'path'
import { createInterface } from 'readline'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AgentKind, AgentSession } from '../shared/types'

const execFileAsync = promisify(execFile)

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

export async function jsonlMetadata(file: string, agent: 'claude' | 'codex'): Promise<Pick<AgentSession, 'id' | 'title' | 'cwd'> | null> {
  let id = agent === 'claude' ? basename(file, '.jsonl') : ''
  let cwd: string | undefined
  let title = ''
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      let item: Record<string, any>
      try { item = JSON.parse(line) as Record<string, any> } catch { continue }
      if (agent === 'claude') {
        if (typeof item.sessionId === 'string') id = item.sessionId
        if (!cwd && typeof item.cwd === 'string') cwd = item.cwd
        if (!title && item.type === 'user') title = textFromContent(item.message?.content)
      } else {
        if (item.type === 'session_meta') {
          if (typeof item.payload?.id === 'string') id = item.payload.id
          if (typeof item.payload?.cwd === 'string') cwd = item.payload.cwd
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
  return id ? { id, cwd, title: cleanTitle(title, `${agent === 'claude' ? 'Claude' : 'Codex'} session`) } : null
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
    if (metadata) sessions.push({ agent, ...metadata, updatedAt: file.updatedAt })
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
      return [{
        agent: 'opencode',
        id,
        title: cleanTitle(typeof item.title === 'string' ? item.title : '', 'OpenCode session'),
        cwd: typeof item.directory === 'string' ? item.directory : typeof item.cwd === 'string' ? item.cwd : undefined,
        updatedAt: updated < 10_000_000_000 ? updated * 1000 : updated
      }]
    }).slice(0, limit)
  } catch {
    return []
  }
}

export async function listAgentSessions(agents: AgentKind[] = ['claude', 'codex', 'opencode'], limit = 80): Promise<AgentSession[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)))
  const results = await Promise.all(agents.map((agent) => agent === 'opencode'
    ? listOpenCodeSessions(safeLimit)
    : listJsonlSessions(agent, safeLimit)))
  return results.flat().sort((a, b) => b.updatedAt - a.updatedAt).slice(0, safeLimit)
}

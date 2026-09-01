import { ipcMain } from 'electron'
import { IPC, type AgentSessionsQuery } from '../../shared/ipc'
import type { AgentKind } from '../../shared/types'
import { buildAgentHandoverPrompt, listAgentSessions } from '../agentSessions'
import type { AgentSessionOwnershipStore } from '../storage/AgentSessionOwnershipStore'

const AGENTS: AgentKind[] = ['claude', 'codex', 'opencode']

export function registerAgentSessionsIpc(ownership: AgentSessionOwnershipStore): void {
  ipcMain.handle(IPC.AGENT_SESSIONS_LIST, async (_event, query: AgentSessionsQuery = {}) => {
    const agents = Array.isArray(query.agents)
      ? query.agents.filter((agent): agent is AgentKind => AGENTS.includes(agent as AgentKind))
      : AGENTS
    const limit = typeof query.limit === 'number' && Number.isFinite(query.limit) ? query.limit : 80
    return ownership.enrich(await listAgentSessions(agents, limit))
  })
  ipcMain.handle(IPC.AGENT_SESSION_HANDOVER, (_event, value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('invalid agent session')
    const session = value as { agent?: unknown; id?: unknown }
    if (!AGENTS.includes(session.agent as AgentKind) || typeof session.id !== 'string' || !/^[a-zA-Z0-9_-]{1,160}$/.test(session.id)) {
      throw new Error('invalid agent session')
    }
    return buildAgentHandoverPrompt({ agent: session.agent as AgentKind, id: session.id })
  })
}

import { ipcMain } from 'electron'
import { IPC, type AgentSessionsQuery } from '../../shared/ipc'
import type { AgentKind } from '../../shared/types'
import { listAgentSessions } from '../agentSessions'

const AGENTS: AgentKind[] = ['claude', 'codex', 'opencode']

export function registerAgentSessionsIpc(): void {
  ipcMain.handle(IPC.AGENT_SESSIONS_LIST, (_event, query: AgentSessionsQuery = {}) => {
    const agents = Array.isArray(query.agents)
      ? query.agents.filter((agent): agent is AgentKind => AGENTS.includes(agent as AgentKind))
      : AGENTS
    const limit = typeof query.limit === 'number' && Number.isFinite(query.limit) ? query.limit : 80
    return listAgentSessions(agents, limit)
  })
}

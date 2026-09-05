import { agentForProfile, mergeProfiles, providerProfileId } from '../../shared/profiles'
import type { AgentKind, AgentPermissionMode, AgentSession, AgentSessionRef, AppSettings, TerminalTab } from '../../shared/types'
import { useTerminalStore } from './store/terminalStore'
import { useHandoverStore } from './store/handoverStore'

const SESSION_MATCH_WINDOW_MS = 60_000

export interface AgentProfileOption {
  id: string
  name: string
  agent: AgentKind
}

export function agentProfileOptions(settings: AppSettings): AgentProfileOption[] {
  const profiles = mergeProfiles(settings.profiles).flatMap((profile) => {
    const agent = agentForProfile(settings, profile.id)
    return agent ? [{ id: profile.id, name: profile.name, agent }] : []
  })
  const providers = settings.providerProfiles.flatMap((provider) => {
    const id = providerProfileId(provider.id)
    const agent = agentForProfile(settings, id)
    return agent ? [{ id, name: provider.name, agent }] : []
  })
  return [...profiles, ...providers]
}

function sameCwd(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) return !left && !right
  return left.replace(/[\\/]+$/, '').toLowerCase() === right.replace(/[\\/]+$/, '').toLowerCase()
}

/** Aktif tabın oluşturduğu native session'ı zaman, cwd ve sahip profil bilgisiyle bulur. */
export function findSessionForTab(tab: TerminalTab, agent: AgentKind, sessions: AgentSession[]): AgentSessionRef | undefined {
  if (tab.resumeSession?.agent === agent) return tab.resumeSession
  const cwd = tab.cwd || tab.launchCwd
  return sessions
    .filter((session) => session.agent === agent && sameCwd(session.cwd, cwd))
    .filter((session) => Math.abs((session.createdAt ?? session.updatedAt) - tab.startedAt) <= SESSION_MATCH_WINDOW_MS)
    .sort((left, right) => {
      const leftOwner = left.profileId === tab.profileId ? 0 : 1
      const rightOwner = right.profileId === tab.profileId ? 0 : 1
      if (leftOwner !== rightOwner) return leftOwner - rightOwner
      return Math.abs((left.createdAt ?? left.updatedAt) - tab.startedAt) - Math.abs((right.createdAt ?? right.updatedAt) - tab.startedAt)
    })[0]
}

export async function continueAgentSession(
  session: AgentSessionRef,
  target: AgentProfileOption,
  cwd: string | undefined,
  permissionMode?: AgentPermissionMode
): Promise<string> {
  const store = useTerminalStore.getState()
  if (session.agent === target.agent) return store.resumeAgentSession(target.id, session, cwd, permissionMode)
  const prompt = await window.termflow.agentSessions.handover(session)
  const approved = await useHandoverStore.getState().review({ source: `${session.agent} / ${session.id}`, target: target.name, cwd, prompt })
  if (approved === null) return ''
  const id = store.addTab(target.id, true, cwd, approved, permissionMode)
  useHandoverStore.getState().track(id)
  return id
}

/** Aynı işi seçilen profil/provider ile yeni sekmede sürdürür; kaynak sekme geri dönüş için korunur. */
export async function switchActiveAgentProfile(tab: TerminalTab, target: AgentProfileOption, sourceAgent: AgentKind): Promise<void> {
  const sessions = await window.termflow.agentSessions.list({ agents: [sourceAgent], limit: 100 })
  const source = findSessionForTab(tab, sourceAgent, sessions)
  const cwd = tab.cwd || tab.launchCwd
  if (source) await continueAgentSession(source, target, cwd, tab.permissionMode)
  else {
    const prompt = 'Continue the existing work in this folder. Inspect the working tree and current files first, preserve completed work, then finish the remaining task.'
    const approved = await useHandoverStore.getState().review({ source: `${sourceAgent}: no matching transcript found`, target: target.name, cwd, prompt })
    if (approved !== null) {
      const id = useTerminalStore.getState().addTab(target.id, true, cwd, approved, tab.permissionMode)
      useHandoverStore.getState().track(id)
    }
  }
}

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname, normalize } from 'path'
import type { AgentKind, AgentSession, AgentSessionRef } from '../../shared/types'

const MATCH_WINDOW_MS = 60_000
const MAX_LAUNCHES = 300

export interface AgentLaunchRecord {
  agent: AgentKind
  profileId: string
  cwd?: string
  startedAt: number
  resumeSession?: AgentSessionRef
}

interface OwnershipData {
  version: 1
  owners: Record<string, string>
  launches: AgentLaunchRecord[]
}

const sessionKey = (session: AgentSessionRef): string => `${session.agent}:${session.id}`

function normalizedCwd(value: string | undefined): string {
  if (!value) return ''
  const cwd = normalize(value)
  return process.platform === 'win32' ? cwd.toLowerCase() : cwd
}

/**
 * Native CLI session kimliğini onu başlatan TermFlow profil/provider'ına bağlar.
 * API anahtarı veya transcript tutmaz; yalnızca profileId ve zaman/cwd ipucu kalıcıdır.
 */
export class AgentSessionOwnershipStore {
  private data: OwnershipData

  constructor(private readonly filePath: string) {
    this.data = this.load()
  }

  recordLaunch(record: AgentLaunchRecord): void {
    if (record.resumeSession?.agent === record.agent) {
      this.data.owners[sessionKey(record.resumeSession)] = record.profileId
      // Resume zaten kesin bir native session kimliğine bağlıdır; zaman/cwd
      // ipucunu kuyruğa eklemek sonraki alakasız session'ın onu sahiplenmesine yol açar.
      this.flush()
      return
    }
    this.data.launches = [...this.data.launches, { ...record }].slice(-MAX_LAUNCHES)
    this.flush()
  }

  enrich(sessions: AgentSession[]): AgentSession[] {
    let changed = false
    const claimedLaunches = new Set<number>()
    const enriched = sessions.map((session) => {
      const owned = this.data.owners[sessionKey(session)]
      const sessionStartedAt = session.createdAt ?? session.updatedAt
      let bestIndex = -1
      let bestDistance = Number.POSITIVE_INFINITY
      for (let index = 0; index < this.data.launches.length; index += 1) {
        const launch = this.data.launches[index]
        if (claimedLaunches.has(index) || launch.agent !== session.agent) continue
        if (owned && launch.profileId !== owned) continue
        if (normalizedCwd(launch.cwd) !== normalizedCwd(session.cwd)) continue
        const distance = Math.abs(sessionStartedAt - launch.startedAt)
        if (distance <= MATCH_WINDOW_MS && distance < bestDistance) {
          bestIndex = index
          bestDistance = distance
        }
      }
      // Önceki taramada owner yazılıp flush kesildiyse bile eşleşen launch kaydı
      // tek kullanımlık olarak tüketilir.
      if (owned) {
        if (bestIndex >= 0) claimedLaunches.add(bestIndex)
        return { ...session, profileId: owned }
      }
      if (bestIndex < 0) return { ...session }
      claimedLaunches.add(bestIndex)
      const profileId = this.data.launches[bestIndex].profileId
      this.data.owners[sessionKey(session)] = profileId
      changed = true
      return { ...session, profileId }
    })
    if (claimedLaunches.size > 0) {
      this.data.launches = this.data.launches.filter((_launch, index) => !claimedLaunches.has(index))
      changed = true
    }
    if (changed) this.flush()
    return enriched
  }

  private load(): OwnershipData {
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<OwnershipData>
      if (raw.version !== 1 || !raw.owners || typeof raw.owners !== 'object' || !Array.isArray(raw.launches)) throw new Error('invalid ownership data')
      return { version: 1, owners: { ...raw.owners }, launches: raw.launches.slice(-MAX_LAUNCHES) }
    } catch {
      return { version: 1, owners: {}, launches: [] }
    }
  }

  private flush(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmp = `${this.filePath}.tmp`
      writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8')
      renameSync(tmp, this.filePath)
    } catch (error) {
      console.warn('[agent-sessions] failed to persist profile ownership:', error)
    }
  }
}

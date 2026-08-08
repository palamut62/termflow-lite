import { app, ipcMain } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { nanoid } from 'nanoid'
import { IPC } from '../../../shared/types'
import { hasUnsafeKeys, safeFileId } from '../pathSafety'

/**
 * Task triggers (process_exit / timer) persisted one JSON file per workspace.
 * The workspace id becomes a filename, so it is validated as a single safe
 * path segment before it ever reaches `join()`.
 */

const MAX_TRIGGERS = 200

export function taskTriggersDir(): string {
  return join(app.getPath('userData'), 'task-triggers')
}

export function taskTriggersFile(workspaceId: string): string {
  const id = safeFileId(workspaceId)
  if (!id) throw new Error('Workspace id is invalid')
  return join(taskTriggersDir(), `${id}.json`)
}

export async function listTaskTriggers(workspaceId: unknown): Promise<unknown[]> {
  try {
    const parsed = JSON.parse(await readFile(taskTriggersFile(workspaceId as string), 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveTaskTrigger(trigger: unknown): Promise<{ id: string } | { error: string }> {
  const row = trigger && typeof trigger === 'object' && !Array.isArray(trigger) ? (trigger as Record<string, unknown>) : null
  if (!row || hasUnsafeKeys(row)) return { error: 'Missing workspace' }
  const workspaceId = safeFileId(row.workspaceId)
  if (!workspaceId) return { error: 'Missing workspace' }
  let id: string
  if (row.id === undefined || row.id === null || row.id === '') {
    id = nanoid()
  } else {
    const requested = safeFileId(row.id)
    if (!requested) return { error: 'Trigger id is invalid' }
    id = requested
  }
  const file = taskTriggersFile(workspaceId)
  await mkdir(taskTriggersDir(), { recursive: true })
  const existing = (await listTaskTriggers(workspaceId)) as Array<{ id: string }>
  if (existing.length >= MAX_TRIGGERS && !existing.some((t) => t?.id === id)) return { error: 'Too many triggers' }
  const saved = { ...row, workspaceId, id }
  const next = existing.some((t) => t?.id === id) ? existing.map((t) => (t?.id === id ? saved : t)) : [...existing, saved]
  await writeFile(file, JSON.stringify(next, null, 2), 'utf-8')
  return { id }
}

export async function deleteTaskTrigger(workspaceId: unknown, id: unknown): Promise<void> {
  const ws = safeFileId(workspaceId)
  if (!ws || typeof id !== 'string') return
  const existing = (await listTaskTriggers(ws)) as Array<{ id: string }>
  await mkdir(taskTriggersDir(), { recursive: true })
  await writeFile(taskTriggersFile(ws), JSON.stringify(existing.filter((t) => t?.id !== id), null, 2), 'utf-8')
}

export function registerTaskIpc(): void {
  ipcMain.handle(IPC.TASK_TRIGGER_LIST, (_e, workspaceId: string) => listTaskTriggers(workspaceId))
  ipcMain.handle(IPC.TASK_TRIGGER_SAVE, (_e, trigger: unknown) => saveTaskTrigger(trigger))
  ipcMain.handle(IPC.TASK_TRIGGER_DELETE, (_e, workspaceId: string, id: string) => deleteTaskTrigger(workspaceId, id))
}

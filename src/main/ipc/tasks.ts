import { existsSync, readFileSync, statSync } from 'fs'
import { isAbsolute, join } from 'path'
import { ipcMain } from 'electron'
import { IPC, type ProjectTask } from '../../shared/ipc'

export function readProjectTasks(cwd: string): ProjectTask[] {
  if (!isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) return []
  try {
    const parsed = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> }
    if (!parsed.scripts || typeof parsed.scripts !== 'object') return []
    return Object.entries(parsed.scripts)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
      .map(([name]) => ({ id: `npm:${name}`, label: `npm: ${name}`, command: `npm run ${name}`, source: 'package.json' }))
  } catch {
    return []
  }
}

export function registerTasksIpc(): void {
  ipcMain.handle(IPC.TASKS_DISCOVER, (_event, cwd: string): ProjectTask[] => {
    if (typeof cwd !== 'string') return []
    try {
      return readProjectTasks(cwd)
    } catch {
      return []
    }
  })
}

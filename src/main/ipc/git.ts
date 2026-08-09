import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { isAbsolute } from 'path'
import { promisify } from 'util'
import { ipcMain } from 'electron'
import { IPC, type GitStatus } from '../../shared/ipc'

const execFileAsync = promisify(execFile)

export function parseGitStatus(stdout: string): GitStatus {
  const lines = stdout.trimEnd().split(/\r?\n/)
  const header = lines[0]?.replace(/^##\s*/, '') ?? ''
  const branch = header.startsWith('No commits yet on ')
    ? header.slice('No commits yet on '.length).trim()
    : header.split('...')[0]?.split(' ')[0]?.trim() || 'HEAD'
  return { branch, changedFiles: lines.slice(1).filter(Boolean).length }
}

export function registerGitIpc(): void {
  ipcMain.handle(IPC.GIT_STATUS, async (_event, cwd: string): Promise<GitStatus | null> => {
    try {
      if (typeof cwd !== 'string' || !isAbsolute(cwd) || !existsSync(cwd) || !statSync(cwd).isDirectory()) return null
      const { stdout } = await execFileAsync('git', ['status', '--porcelain=v1', '--branch'], {
        cwd,
        windowsHide: true,
        timeout: 2500,
        maxBuffer: 256 * 1024
      })
      return parseGitStatus(stdout)
    } catch {
      return null
    }
  })
}

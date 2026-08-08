export interface CommandHistoryEntry { command: string; terminalId: string; cwd: string; createdAt: string }

const buffers = new Map<string, string>()
const key = (workspaceId: string): string => `termflow.commandHistory.${workspaceId}`

export function captureCommandInput(workspaceId: string, terminalId: string, cwd: string, data: string): void {
  let buffer = buffers.get(terminalId) ?? ''
  for (const char of data) {
    if (char === '\r' || char === '\n') {
      const command = buffer.trim()
      if (command) {
        const entries = readCommandHistory(workspaceId)
        entries.unshift({ command, terminalId, cwd, createdAt: new Date().toISOString() })
        localStorage.setItem(key(workspaceId), JSON.stringify(entries.slice(0, 500)))
      }
      buffer = ''
    } else if (char === '\u007f' || char === '\b') buffer = buffer.slice(0, -1)
    else if (char >= ' ') buffer += char
  }
  buffers.set(terminalId, buffer.slice(-4096))
}

export function readCommandHistory(workspaceId: string): CommandHistoryEntry[] {
  try { return JSON.parse(localStorage.getItem(key(workspaceId)) || '[]') as CommandHistoryEntry[] } catch { return [] }
}

export function clearCommandHistory(workspaceId: string): void { localStorage.removeItem(key(workspaceId)) }

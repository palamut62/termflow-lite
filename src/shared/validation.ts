import type {
  ShellKind,
  TermflowManifest,
  WorkspaceExport
} from './types'

const SHELLS = new Set<ShellKind>([
  'powershell', 'pwsh', 'cmd', 'wsl', 'gitbash', 'claude', 'codex', 'opencode',
  'ollama', 'ssh', 'custom'
])
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function text(value: unknown, max = 4096): string | undefined {
  return typeof value === 'string' && value.length <= max ? value : undefined
}

export function validateManifest(value: unknown): { data: TermflowManifest | null; errors: string[] } {
  const root = record(value)
  if (!root) return { data: null, errors: ['Manifest must be a JSON object.'] }
  const errors: string[] = []
  const limitedArray = (key: string): unknown[] => {
    const input = root[key]
    if (input === undefined) return []
    if (!Array.isArray(input)) {
      errors.push(`${key} must be an array.`)
      return []
    }
    if (input.length > 100) errors.push(`${key} cannot contain more than 100 items.`)
    return input.slice(0, 100)
  }

  const tasks = limitedArray('tasks').flatMap((item, index) => {
    const row = record(item)
    const name = text(row?.name, 120)
    const command = text(row?.command, 8192)
    const shell = row?.shell
    if (!row || !name?.trim() || !command?.trim() || (shell !== undefined && !SHELLS.has(shell as ShellKind))) {
      errors.push(`tasks[${index}] is invalid.`)
      return []
    }
    return [{ name: name.trim(), command, cwd: text(row.cwd, 1024), shell: shell as ShellKind | undefined }]
  })
  const agents = limitedArray('agents').flatMap((item, index) => {
    const row = record(item)
    const name = text(row?.name, 120)
    const kind = row?.kind
    if (!row || !name?.trim() || (kind !== undefined && !SHELLS.has(kind as ShellKind))) {
      errors.push(`agents[${index}] is invalid.`)
      return []
    }
    return [{ name: name.trim(), role: text(row.role, 120), kind: kind as ShellKind | undefined, command: text(row.command, 8192) }]
  })
  const env = limitedArray('env').flatMap((item, index) => {
    const row = record(item)
    const key = text(row?.key, 128)
    if (!row || !key || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      errors.push(`env[${index}] has an invalid key.`)
      return []
    }
    return [{ key, value: text(row.value, 8192), masked: typeof row.masked === 'boolean' ? row.masked : undefined }]
  })
  const snippets = limitedArray('snippets').flatMap((item, index) => {
    const row = record(item)
    const name = text(row?.name, 120)
    const command = text(row?.command, 8192)
    const scope = row?.scope
    if (!row || !name?.trim() || !command?.trim() || (scope !== undefined && scope !== 'workspace' && scope !== 'global')) {
      errors.push(`snippets[${index}] is invalid.`)
      return []
    }
    return [{ name: name.trim(), command, scope: scope as 'workspace' | 'global' | undefined }]
  })
  if (errors.length) return { data: null, errors }
  return { data: { name: text(root.name, 120), tasks, agents, env, snippets }, errors: [] }
}

function checkArray(
  root: Record<string, unknown>,
  key: 'nodes' | 'terminals',
  errors: string[],
  validateItem: (item: Record<string, unknown>, index: number) => string | null
): void {
  const input = root[key]
  if (!Array.isArray(input) || input.length > 1000) {
    errors.push(`${key} is missing or too large.`)
    return
  }
  input.forEach((item, index) => {
    const row = record(item)
    if (!row) {
      errors.push(`${key}[${index}] must be an object.`)
      return
    }
    const err = validateItem(row, index)
    if (err) errors.push(err)
  })
}

export function validateWorkspaceExport(value: unknown): { data: WorkspaceExport | null; errors: string[] } {
  const root = record(value)
  const workspace = record(root?.workspace)
  if (!root || root.schemaVersion !== 1 || !workspace) {
    return { data: null, errors: ['Unsupported or invalid workspace export.'] }
  }
  const name = text(workspace.name, 120)
  if (!name?.trim()) {
    return { data: null, errors: ['Workspace name is invalid.'] }
  }

  const errors: string[] = []

  // Windows only need identity + title + status. Geometry fields written by
  // pre-tmux builds (position/size/zIndex/isMaximized/...) are ignored, so old
  // export files still import cleanly.
  checkArray(root, 'nodes', errors, (row, index) => {
    if (
      !text(row.id, 128) ||
      !text(row.title, 512) ||
      typeof row.status !== 'string'
    ) {
      return `nodes[${index}] is invalid.`
    }
    return null
  })

  checkArray(root, 'terminals', errors, (row, index) => {
    if (
      !text(row.id, 128) ||
      !text(row.name, 512) ||
      typeof row.kind !== 'string' ||
      typeof row.shell !== 'string' ||
      !Array.isArray(row.args) ||
      typeof row.cwd !== 'string' ||
      typeof row.status !== 'string'
    ) {
      return `terminals[${index}] is invalid.`
    }
    return null
  })

  if (errors.length) return { data: null, errors }
  return { data: value as WorkspaceExport, errors: [] }
}

export function isValidSshProfile(profile: { host: string; user: string; port: number; jumpHost?: string }): boolean {
  const target = /^[A-Za-z0-9._:-]+$/
  return target.test(profile.host) && /^[A-Za-z0-9._-]+$/.test(profile.user) &&
    Number.isInteger(profile.port) && profile.port >= 1 && profile.port <= 65535 &&
    (!profile.jumpHost || /^[A-Za-z0-9._@:-]+$/.test(profile.jumpHost))
}

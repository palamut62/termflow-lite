import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'fs'
import { delimiter, dirname, extname, isAbsolute, join } from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { agentKindForCommand } from '../../shared/agentEvents'
import { splitCommandLine } from '../../shared/commandLine'
import type { CreateTerminalInput } from '../../shared/types'

const exec = promisify(execFile)
function isFile(path: string): boolean { try { return statSync(path).isFile() } catch { return false } }

export function isWindowsExecutable(file: string): boolean {
  let fd: number | undefined
  try {
    fd = openSync(file, 'r')
    const header = Buffer.alloc(64)
    if (readSync(fd, header, 0, 64, 0) !== 64 || header.toString('ascii', 0, 2) !== 'MZ') return false
    const signature = Buffer.alloc(4)
    return readSync(fd, signature, 0, 4, header.readUInt32LE(60)) === 4 && signature.equals(Buffer.from([80, 69, 0, 0]))
  } catch { return false }
  finally { if (fd !== undefined) closeSync(fd) }
}

export function executablePath(command: string): string {
  const paths = isAbsolute(command) ? [''] : [
    ...((process.env.Path || process.env.PATH || '').split(delimiter)),
    ...(process.platform === 'win32' ? [join(process.env.APPDATA || '', 'npm')] : [])
  ]
  const extensions = process.platform === 'win32' && !extname(command) ? ['.exe', '.cmd', '.bat', ''] : ['']
  for (const path of paths) for (const extension of extensions) {
    const candidate = path ? join(path.replace(/^"|"$/g, ''), command + extension) : command + extension
    if (isFile(candidate) && (process.platform !== 'win32' || /\.(cmd|bat)$/i.test(candidate) || isWindowsExecutable(candidate))) return candidate
  }
  throw new Error(`CLI not found: ${command}. Check the profile command and installation.`)
}

/** Resolve npm shims to their actual entry point; never execute a .cmd through a shell. */
export function cliInvocation(command: string, args: string[] = []): { file: string; args: string[] } {
  const file = executablePath(command)
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(file)) return { file, args }
  const shim = readFileSync(file, 'utf8')
  const matches = [...shim.matchAll(/"%(?:dp0%|~dp0)[\\/]?([^"\r\n]+)"/gi)]
  const target = matches.map(m => join(dirname(file), m[1])).find(p => /\.(exe|[cm]?js)$/i.test(p) && !/[\\/]node\.exe$/i.test(p) && existsSync(p))
  if (!target) throw new Error('Unsupported command shim. Select its executable or Node entry point in Profiles.')
  return /\.exe$/i.test(target) ? { file: executablePath(target), args } : { file: executablePath('node'), args: [target, ...args] }
}

export async function runCli(command: string, args: string[], maxBuffer = 2 * 1024 * 1024): Promise<string> {
  const resolved = cliInvocation(command, args)
  const { stdout } = await exec(resolved.file, resolved.args, { timeout: 8000, windowsHide: true, maxBuffer })
  return stdout
}

export function prepareLaunch(input: CreateTerminalInput): CreateTerminalInput {
  const command = input.startupCommand
  const agent = agentKindForCommand(command || input.shell)
  if (agent) {
    const [executable, ...args] = command ? splitCommandLine(command) : [input.shell!, ...(input.args ?? [])]
    if (input.launchCommand) args.push(...(agent === 'opencode' ? ['--prompt', input.launchCommand] : ['--', input.launchCommand]))
    const resolved = cliInvocation(executable, args)
    return { ...input, kind: 'custom', shell: resolved.file, args: resolved.args, startupCommand: undefined, launchCommand: undefined }
  }
  if (command && input.launchCommand) throw new Error('Automatic input requires a supported agent profile. Start this custom profile manually.')
  if (input.launchCommand) {
    if (input.kind === 'custom' && !/(?:^|[\\/])(bash|zsh|sh|fish)(?:\.exe)?$/i.test(input.shell || '')) throw new Error('Saved commands require a shell or a supported agent profile.')
    const args = input.kind === 'cmd' ? ['/d', '/s', '/c', input.launchCommand]
      : input.kind === 'powershell' || input.kind === 'pwsh' ? ['-NoLogo', '-NoProfile', '-Command', input.launchCommand]
        : input.kind === 'wsl' ? [...(input.args ?? []), '--exec', 'sh', '-lc', input.launchCommand]
        : ['-lc', input.launchCommand]
    return { ...input, args, launchCommand: undefined }
  }
  if (process.platform === 'win32' && input.kind === 'custom' && input.shell) {
    const resolved = cliInvocation(input.shell, input.args)
    return { ...input, shell: resolved.file, args: resolved.args }
  }
  return input
}

import { existsSync, statSync } from 'fs'
import { isAbsolute, normalize } from 'path'
import type { AppLaunchRequest } from '../shared/ipc'

const PROFILE_ID = /^[a-zA-Z0-9:_-]{1,160}$/

/** Parse the directory and optional profile selected in Explorer's context menu. */
export function parseLaunchRequest(argv: string[]): AppLaunchRequest | null {
  const profileIndex = argv.indexOf('--profile')
  const candidate = profileIndex >= 0 ? argv[profileIndex + 1] : undefined
  const profileId = candidate && PROFILE_ID.test(candidate)
    ? candidate.startsWith('provider--') ? `provider:${candidate.slice('provider--'.length)}` : candidate
    : undefined
  for (const value of argv.slice(1)) {
    if (!value || value === candidate || value.startsWith('--') || !isAbsolute(value)) continue
    try {
      const cwd = normalize(value)
      if (existsSync(cwd) && statSync(cwd).isDirectory()) return { cwd, profileId }
    } catch { /* invalid or inaccessible command-line path */ }
  }
  return null
}

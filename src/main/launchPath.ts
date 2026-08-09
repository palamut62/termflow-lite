import { existsSync, statSync } from 'fs'
import { isAbsolute, normalize } from 'path'

/** Return the first existing absolute directory passed by Explorer/context menu. */
export function launchDirectory(argv: string[]): string | null {
  for (const value of argv.slice(1)) {
    if (!value || value.startsWith('--') || !isAbsolute(value)) continue
    try {
      const cwd = normalize(value)
      if (existsSync(cwd) && statSync(cwd).isDirectory()) return cwd
    } catch { /* invalid or inaccessible command-line path */ }
  }
  return null
}

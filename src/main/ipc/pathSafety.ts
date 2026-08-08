import { statSync } from 'fs'
import { realpath } from 'fs/promises'
import { isAbsolute, relative, resolve, sep } from 'path'

/**
 * Single place for every "renderer gave us a path" check. The renderer is the
 * app's untrusted edge: anything that reaches `fs`/`child_process` from IPC has
 * to pass through here first.
 */

export const MAX_PATH_LENGTH = 4096

/** Reject non-strings, empty strings, NUL bytes and absurdly long paths. */
export function safePathString(value: unknown, max = MAX_PATH_LENGTH): string | null {
  if (typeof value !== 'string') return null
  if (!value || value.length > max) return null
  if (value.includes('\0')) return null
  return value
}

/**
 * `relative()` returning something that escapes `base`. Checking the separator
 * explicitly avoids the classic false positive on siblings like `..foo`.
 */
function escapes(rel: string): boolean {
  return rel === '..' || rel.startsWith('..' + sep) || rel.startsWith('../') || isAbsolute(rel)
}

/**
 * Lexical containment check. Also covers absolute paths, UNC paths
 * (`\\server\share`) and drive-relative escapes because those all resolve to a
 * location outside `root`.
 */
export function pathInside(root: string, candidate: unknown): string {
  const raw = safePathString(candidate)
  if (raw === null) throw new Error('Path is invalid')
  const base = resolve(root)
  const target = resolve(raw)
  const rel = relative(base, target)
  if (escapes(rel)) throw new Error('Path is outside the workspace')
  return target
}

/**
 * Containment check that also survives symlinks/junctions: a link *inside* the
 * workspace pointing at `C:\Windows\System32` must not become a read primitive.
 * Falls back to the lexical result when the target does not exist yet.
 */
export async function realPathInside(root: string, candidate: unknown): Promise<string> {
  const target = pathInside(root, candidate)
  const base = resolve(root)
  const realBase = await realpath(base).catch(() => base)
  const realTarget = await realpath(target).catch(() => null)
  if (realTarget === null) return target
  if (escapes(relative(realBase, realTarget))) throw new Error('Path is outside the workspace')
  return realTarget
}

/**
 * Single gate for cwd coming from the renderer into filesystem/git IPC. A
 * terminal's cwd can legitimately drift outside any known workspace (OSC 7
 * tracks `cd`), so we only enforce that it is an absolute, existing directory
 * — rejecting empty/non-string/relative/missing inputs.
 */
export function validateCwd(cwd: unknown): string | null {
  const raw = safePathString(cwd)
  if (raw === null || !raw.trim() || !isAbsolute(raw)) return null
  try {
    return statSync(raw).isDirectory() ? raw : null
  } catch {
    return null
  }
}

const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Ids that are interpolated into a filename (`<id>.json`). nanoid's alphabet is
 * `A-Za-z0-9_-`, so anything containing a separator, dot or `..` is hostile.
 */
export function safeFileId(value: unknown): string | null {
  return typeof value === 'string' && SAFE_ID_RE.test(value) ? value : null
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Guard against prototype pollution through IPC-supplied object keys. */
export function hasUnsafeKeys(value: object): boolean {
  return Object.keys(value).some((key) => UNSAFE_KEYS.has(key))
}

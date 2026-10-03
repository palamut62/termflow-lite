// Directory listing for the file panel: one level per call, so a big tree is
// only read where the user opens it. Read-only; opening a file goes through
// the existing system:open-path / open-in-editor handlers, which never run
// executables.

import { readdir, stat } from 'fs/promises'
import { isAbsolute, join } from 'path'
import type { DirEntry, DirListing } from '../shared/ipc'

/** Entries shown per folder; the rest is reported as truncated. */
export const MAX_ENTRIES = 500

const HEAVY = new Set(['.git', 'node_modules', '$RECYCLE.BIN', 'System Volume Information'])

/** Dotfiles and heavy folders stay out of the list unless "show hidden" is on. */
export function isHiddenName(name: string): boolean {
  return name.startsWith('.') || HEAVY.has(name)
}

/** Folders first, then a natural, case-insensitive name order ("file2" before "file10"). */
export function sortEntries(entries: DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) : a.isDirectory ? -1 : 1))
}

async function isDirectoryPath(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

/** One folder's entries, or null if it is not a readable absolute folder. */
export async function listDirectory(dir: string, showHidden: boolean): Promise<DirListing | null> {
  if (!dir || dir.length > 8192 || !isAbsolute(dir)) return null
  let dirents
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const visible = dirents.filter((d) => showHidden || !isHiddenName(d.name))
  const entries = await Promise.all(visible.map(async (d): Promise<DirEntry> => {
    const path = join(dir, d.name)
    // Symlinks and junctions count as folders when they point at one.
    const isDirectory = d.isDirectory() || (d.isSymbolicLink() && (await isDirectoryPath(path)))
    return { name: d.name, path, isDirectory }
  }))
  const sorted = sortEntries(entries)
  return { path: dir, entries: sorted.slice(0, MAX_ENTRIES), truncated: sorted.length > MAX_ENTRIES, hidden: dirents.length - visible.length }
}

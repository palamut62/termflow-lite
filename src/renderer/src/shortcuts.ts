// Keyboard shortcut normalization + matching (PRD §39). Stored shortcut
// strings use the format 'ctrl+shift+t' with the modifier order
// ctrl+alt+shift+meta+key, key lowercase.

const MODIFIER_KEYS = new Set(['control', 'ctrl', 'alt', 'shift', 'meta', 'capslock'])
const MODIFIER_ORDER = ['ctrl', 'alt', 'shift', 'meta'] as const

/**
 * Normalize a KeyboardEvent into 'ctrl+shift+t' form, or null when the key is
 * not a supported shortcut key (only letters, digits, and the small set the
 * default bindings use).
 */
export function normalizeShortcut(e: KeyboardEvent): string | null {
  const key = e.key.toLowerCase()
  if (MODIFIER_KEYS.has(key)) return null

  let k: string
  if (/^[a-z0-9]$/.test(key)) k = key
  // Ctrl+Shift+= produces '+' on US layouts (and '=' elsewhere) — keep both
  // as written and let matchShortcut treat them as aliases.
  else if (key === '+' || key === '=') k = key
  else if (key === ',') k = ','
  else if (key === '-') k = '-'
  else if (key === 'tab') k = 'tab'
  else return null

  const parts: string[] = []
  for (const mod of MODIFIER_ORDER) {
    const pressed = mod === 'ctrl' ? e.ctrlKey : mod === 'alt' ? e.altKey : mod === 'shift' ? e.shiftKey : e.metaKey
    if (pressed) parts.push(mod)
  }
  parts.push(k)
  return parts.join('+')
}

/**
 * Match a keydown against a shortcuts map (shortcut string -> action id).
 * Returns the action id or null. '+' and '=' are interchangeable in the key
 * part (Ctrl+Shift+= is how Ctrl++ arrives on US keyboards).
 */
export function matchShortcut(e: KeyboardEvent, map: Record<string, string>): string | null {
  const norm = normalizeShortcut(e)
  if (!norm) return null
  const direct = map[norm]
  if (direct) return direct
  const lastPlus = norm.lastIndexOf('+')
  if (lastPlus >= 0) {
    const keyPart = norm.slice(lastPlus + 1)
    if (keyPart === '+' || keyPart === '=') {
      return map[norm.slice(0, lastPlus + 1) + (keyPart === '+' ? '=' : '+')] ?? null
    }
  }
  return null
}

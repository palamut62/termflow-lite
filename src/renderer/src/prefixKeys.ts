import type { AppSettings } from '../../shared/types'

/** How long a pressed prefix waits for its command key (tmux escape-time-ish). */
export const PREFIX_TIMEOUT_MS = 2000

/** The literal control byte the prefix stands for, sent on a double press. */
export function prefixControlChar(prefixKey: AppSettings['prefixKey']): string {
  return prefixKey === 'ctrl+b' ? '\x02' : '\x01'
}

export function prefixLabel(prefixKey: AppSettings['prefixKey']): string {
  return prefixKey === 'ctrl+b' ? 'Ctrl+B' : 'Ctrl+A'
}

/** True when the keyboard event is the configured prefix combo itself. */
export function isPrefixEvent(
  e: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'key'>,
  prefixKey: AppSettings['prefixKey']
): boolean {
  if (!e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false
  return e.key.toLowerCase() === (prefixKey === 'ctrl+b' ? 'b' : 'a')
}

const MASK = '************'

const API_KEY_PATTERNS = [
  /\bsk-(?:proj-|ant-api\d{2}-|or-v\d-)?[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}\b/g,
  /\bAIza[0-9A-Za-z_-]{20,}\b/g,
  /\b(?:xox[baprs]-|hf_|glpat-|npm_)[A-Za-z0-9_-]{16,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g
]

const LABELED_API_KEY_PATTERN =
  /(?:api[_ -]?key|auth(?:orization)?[_ -]?token|access[_ -]?token|secret)[\t ]*(?:=|:)[\t ]*["']?([A-Za-z0-9][A-Za-z0-9._~+\/-]{15,})/gi
const BARE_API_KEY_PATTERN = /^["']?([A-Za-z0-9][A-Za-z0-9._~+\/-]{19,})["']?[\r\n]*$/

/** Finds likely API credentials without treating ordinary command text as a secret. */
export function findApiKeys(value: string): string[] {
  const matches = new Set<string>()
  for (const pattern of API_KEY_PATTERNS) {
    pattern.lastIndex = 0
    for (const match of value.matchAll(pattern)) matches.add(match[0])
  }

  LABELED_API_KEY_PATTERN.lastIndex = 0
  for (const match of value.matchAll(LABELED_API_KEY_PATTERN)) matches.add(match[1])

  const bare = value.trim().match(BARE_API_KEY_PATTERN)?.[1]
  if (bare && /[A-Za-z]/.test(bare) && /\d/.test(bare)) matches.add(bare)
  return [...matches]
}

export function redactApiKeys(value: string, knownKeys: Iterable<string> = findApiKeys(value)): string {
  let redacted = value
  for (const key of knownKeys) redacted = redacted.split(key).join(MASK)
  return redacted
}

/** Keeps pasted keys in memory only for the lifetime of one terminal process. */
export class TerminalSecretRedactor {
  private readonly keys = new Set<string>()
  private pending = ''
  private input = ''

  register(value: string): void {
    if (value) this.keys.add(value)
  }

  registerInput(value: string): void {
    this.input = (this.input + value).slice(-8192)
    for (const key of findApiKeys(this.input)) this.keys.add(key)
    if (/[\r\n]/.test(value)) this.input = ''
  }

  redact(value: string): string {
    const data = this.pending + value
    this.pending = ''
    if (!this.keys.size) return data
    let output = '', i = 0
    while (i < data.length) {
      const key = [...this.keys].find(key => data.startsWith(key, i))
      if (key) { output += MASK; i += key.length; continue }
      const rest = data.slice(i)
      if ([...this.keys].some(key => key.startsWith(rest))) { this.pending = rest; break }
      output += data[i++]
    }
    return output
  }

  finish(): string {
    const tail = this.pending ? MASK : ''
    this.pending = ''
    return tail
  }
}

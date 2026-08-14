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

  registerInput(value: string): void {
    for (const key of findApiKeys(value)) this.keys.add(key)
  }

  redact(value: string): string {
    return redactApiKeys(value, this.keys)
  }
}

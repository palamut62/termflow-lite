// Tiny dependency-free fuzzy matcher used by the command history picker.
// Subsequence match with bonuses so that word-start and adjacent hits rank
// above scattered ones (the usual fzf-style feel, minus the dependency).

const SEPARATORS = new Set([' ', '/', '\\', '-', '_', '.', ':', '=', ',', '|', '(', ')', '[', ']', '{', '}', '"', "'", '$', '@', '+'])

const isSeparator = (ch: string | undefined): boolean => ch === undefined || SEPARATORS.has(ch)

/**
 * Score `text` against `query`, keeping character order. Returns null when the
 * query is not a subsequence of the text. Higher score = better match.
 * An empty query always scores 0 (every text matches).
 */
export function fuzzyScore(query: string, text: string): number | null {
  if (!query) return 0
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let score = 0
  let ti = 0
  let prevMatch = -2
  for (let qi = 0; qi < q.length; qi++) {
    const needle = q[qi]
    let found = -1
    while (ti < t.length) {
      if (t[ti] === needle) { found = ti; break }
      ti++
    }
    if (found === -1) return null
    score += 1
    // Word/segment start: the strongest signal of intent.
    if (found === 0 || isSeparator(t[found - 1])) score += 8
    // Adjacent to the previous match: keeps contiguous runs on top.
    if (found === prevMatch + 1) score += 5
    // Exact case agreement is a light tie-breaker only.
    if (text[found] === query[qi]) score += 1
    // Matching early in the string is slightly preferred.
    if (found < 4) score += 1
    prevMatch = found
    ti++
  }
  // Shorter haystacks with the same hits are the tighter match.
  score -= Math.min(text.length / 20, 4)
  return score
}

/**
 * Filter and rank items by fuzzy score (descending). An empty query returns the
 * input order untouched so callers can keep their own default sorting.
 */
export function fuzzyFilter<T>(query: string, items: T[], toText: (item: T) => string): T[] {
  if (!query) return items.slice()
  const scored: { item: T; score: number; index: number }[] = []
  items.forEach((item, index) => {
    const score = fuzzyScore(query, toText(item))
    if (score !== null) scored.push({ item, score, index })
  })
  // Stable: equal scores keep the incoming order.
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index))
  return scored.map((entry) => entry.item)
}

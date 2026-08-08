import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, KeyboardEvent } from 'react'
import type { ISearchOptions } from '@xterm/addon-search'
import { ArrowDown, ArrowUp, CaseSensitive, Regex, X } from 'lucide-react'
import { searchAddons } from '../store/terminalStore'

interface TerminalSearchProps {
  tabId: string
  /** Kapat (TerminalView: closeSearch + term.focus()). */
  onClose: () => void
}

/** Match/active-match decoration'ları PRD §22'deki tonlarda (bluish). */
const SEARCH_DECORATIONS: ISearchOptions['decorations'] = {
  matchBackground: '#2f80ff44',
  matchBorder: '#2f80ff',
  matchOverviewRuler: '#2f80ff',
  activeMatchBackground: '#2f80ff88',
  activeMatchBorder: '#2f80ff',
  activeMatchColorOverviewRuler: '#2f80ff'
}

/**
 * Minimal terminal search overlay (PRD §22, Ctrl+Shift+F / context menu).
 * Input: live highlight; ↑/↓ previous/next; Aa case + .* regex toggles;
 * Enter = next, Shift+Enter = previous, Escape = close.
 */
export function TerminalSearch({ tabId, onClose }: TerminalSearchProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [regex, setRegex] = useState(false)

  const addon = searchAddons.get(tabId)

  const options = (cs: boolean, rx: boolean): ISearchOptions => ({
    caseSensitive: cs,
    regex: rx,
    decorations: SEARCH_DECORATIONS
  })

  const applySearch = (term: string, cs: boolean, rx: boolean): void => {
    if (!addon) return
    if (!term.trim()) {
      addon.clearDecorations()
      return
    }
    try {
      addon.findNext(term, options(cs, rx))
    } catch {
      // Geçersiz regex — sessizce yok say, mevcut highlight'lar kalır.
    }
  }

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
    return () => addon?.clearDecorations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value
    setQuery(value)
    applySearch(value, caseSensitive, regex)
  }

  const toggleCase = (): void => {
    const next = !caseSensitive
    setCaseSensitive(next)
    applySearch(query, next, regex)
  }

  const toggleRegex = (): void => {
    const next = !regex
    setRegex(next)
    applySearch(query, caseSensitive, next)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!addon) return
      if (e.shiftKey) {
        try {
          addon.findPrevious(query, options(caseSensitive, regex))
        } catch {
          // geçersiz regex
        }
      } else {
        applySearch(query, caseSensitive, regex)
      }
    }
  }

  const findPrevious = (): void => {
    if (!addon) return
    try {
      addon.findPrevious(query, options(caseSensitive, regex))
    } catch {
      // geçersiz regex
    }
  }

  return (
    <div className="terminal-search" role="search">
      <input
        ref={inputRef}
        className="terminal-search-input"
        placeholder="Search..."
        value={query}
        onChange={onChange}
        onKeyDown={onKeyDown}
        spellCheck={false}
        aria-label="Search"
      />
      <button
        className={`terminal-search-btn${caseSensitive ? ' active' : ''}`}
        onClick={toggleCase}
        title="Match case"
        aria-pressed={caseSensitive}
        aria-label="Match case"
      >
        <CaseSensitive size={14} />
      </button>
      <button
        className={`terminal-search-btn${regex ? ' active' : ''}`}
        onClick={toggleRegex}
        title="Regex"
        aria-pressed={regex}
        aria-label="Regex"
      >
        <Regex size={14} />
      </button>
      <button
        className="terminal-search-btn"
        onClick={findPrevious}
        title="Previous match"
        aria-label="Previous match"
      >
        <ArrowUp size={14} />
      </button>
      <button
        className="terminal-search-btn"
        onClick={() => applySearch(query, caseSensitive, regex)}
        title="Next match"
        aria-label="Next match"
      >
        <ArrowDown size={14} />
      </button>
      <button className="terminal-search-btn" onClick={onClose} title="Close search" aria-label="Close search">
        <X size={14} />
      </button>
    </div>
  )
}

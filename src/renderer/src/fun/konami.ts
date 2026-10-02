const SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']

/**
 * Konami kodu dinleyicisi. Ok tuşları terminale gider (kabukta geçmişte
 * gezinir); yalnızca sekiz okun ardından gelen "b" ve "a" yutulur ki komut
 * satırına harf düşmesin.
 */
export function listenForKonami(onUnlock: () => void): () => void {
  let index = 0
  const onKey = (e: KeyboardEvent): void => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
    if (key === SEQUENCE[index]) {
      if (index >= 8) {
        e.preventDefault()
        e.stopPropagation()
      }
      index++
      if (index === SEQUENCE.length) {
        index = 0
        onUnlock()
      }
    } else {
      index = key === SEQUENCE[0] ? 1 : 0
    }
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}

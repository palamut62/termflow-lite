import { useEffect } from 'react'
// Ortak modal davranışı: ESC ile kapatma.
export function useModalClose(onClose: () => void): void {
  useEffect(() => {
    const h = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
}

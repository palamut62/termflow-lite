import { describe, expect, it } from 'vitest'
import { formatDroppedPaths } from './dropPaths'

/** Gerçek File örneğine gerek yok: çözümleyici zaten dışarıdan veriliyor. */
function fakeFiles(n: number): File[] {
  return Array.from({ length: n }, (_, i) => ({ name: `f${i}` }) as unknown as File)
}

describe('formatDroppedPaths', () => {
  it('tek dosyanın yolunu tırnaklar', () => {
    const [f] = fakeFiles(1)
    expect(formatDroppedPaths([f], () => 'C:\\work\\a.txt')).toBe('"C:\\\\work\\\\a.txt"')
  })

  it('boşluklu yolu tırnak içinde tutar', () => {
    const [f] = fakeFiles(1)
    expect(formatDroppedPaths([f], () => '/home/me/my file.txt')).toBe('"/home/me/my file.txt"')
  })

  it('birden fazla dosyayı boşlukla ayırır', () => {
    const files = fakeFiles(2)
    const paths = ['/a/one.txt', '/b/two.txt']
    const out = formatDroppedPaths(files, (f) => paths[files.indexOf(f)])
    expect(out).toBe('"/a/one.txt" "/b/two.txt"')
  })

  it('yolu çözülemeyen dosyaları atlar', () => {
    const files = fakeFiles(2)
    const out = formatDroppedPaths(files, (f) => (files.indexOf(f) === 0 ? '' : '/b/two.txt'))
    expect(out).toBe('"/b/two.txt"')
  })

  it('hiç dosya yoksa boş string döner', () => {
    expect(formatDroppedPaths([], () => '/x')).toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { LIGATURE_SEQUENCES, ligatureJoiner } from './ligatures'

describe('ligatureJoiner', () => {
  it('boş metinde aralık üretmez', () => {
    expect(ligatureJoiner('')).toEqual([])
  })

  it('eşleşme yoksa boş döner', () => {
    expect(ligatureJoiner('echo hello')).toEqual([])
  })

  it('en uzun eşleşmeyi seçer (=== içinde == yakalanmaz)', () => {
    expect(ligatureJoiner('a === b')).toEqual([[2, 5]])
    expect(ligatureJoiner('!==')).toEqual([[0, 3]])
  })

  it('birden fazla eşleşmeyi artan sırada ve çakışmasız döner', () => {
    const ranges = ligatureJoiner('a => b -> c')
    expect(ranges).toEqual([
      [2, 4],
      [7, 9]
    ])
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThanOrEqual(ranges[i - 1][1])
  })

  it('bitişik diziler üst üste binmez', () => {
    expect(ligatureJoiner('==!=')).toEqual([
      [0, 2],
      [2, 4]
    ])
  })

  it('dizi listesi uzundan kısaya sıralıdır', () => {
    for (let i = 1; i < LIGATURE_SEQUENCES.length; i++) {
      expect(LIGATURE_SEQUENCES[i].length).toBeLessThanOrEqual(LIGATURE_SEQUENCES[i - 1].length)
    }
  })
})

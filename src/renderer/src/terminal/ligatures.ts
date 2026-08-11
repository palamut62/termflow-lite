/**
 * Terminal ligature desteği. @xterm/addon-ligatures node `fs` erişimi istediği
 * için sandbox'lı renderer'da çalışmaz; onun yerine xterm'in
 * registerCharacterJoiner API'sine verilecek kendi joiner'ımızı kullanıyoruz.
 */

/** Yaygın programlama ligature dizileri — uzundan kısaya (en uzun eşleşme önce). */
export const LIGATURE_SEQUENCES: string[] = [
  '===',
  '!==',
  '<=>',
  '<<=',
  '>>=',
  '...',
  '=>',
  '->',
  '<-',
  '<=',
  '>=',
  '==',
  '!=',
  '::',
  '&&',
  '||',
  '++',
  '--',
  '//',
  '/*',
  '*/',
  '|>',
  '<|',
  '<>',
  '>>',
  '<<',
  '??',
  '?.',
  ':='
]

/**
 * xterm joiner sözleşmesi: dönen aralıklar artan sırada ve çakışmasız olmalı.
 * Soldan sağa tarar, her konumda en uzun eşleşmeyi alır ve o aralığın sonundan
 * devam eder — böylece `===` içinde ayrıca `==` yakalanmaz.
 */
export function ligatureJoiner(text: string): [number, number][] {
  const ranges: [number, number][] = []
  let i = 0
  while (i < text.length) {
    let matched = 0
    for (const seq of LIGATURE_SEQUENCES) {
      if (seq.length > matched && text.startsWith(seq, i)) {
        matched = seq.length
        break
      }
    }
    if (matched > 0) {
      ranges.push([i, i + matched])
      i += matched
    } else {
      i += 1
    }
  }
  return ranges
}

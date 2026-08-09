/**
 * Terminale sürüklenen dosyaların yol metnini üretir (TermFlow paritesi).
 * Her yol JSON.stringify ile tırnaklanır — böylece boşluk içeren yollar kabukta
 * tek argüman olarak okunur — ve aralarına tek boşluk konur.
 *
 * Saf fonksiyon: yol çözümleyici dışarıdan verilir (preload'daki
 * `system.getPathForFile`), böylece test edilebilir kalır. Çözümlenemeyen
 * (boş dönen) dosyalar sessizce atlanır; yollar hiçbir yere loglanmaz.
 */
export function formatDroppedPaths(files: readonly File[], getPath: (file: File) => string): string {
  const parts: string[] = []
  for (const file of files) {
    const path = getPath(file)
    if (path) parts.push(JSON.stringify(path))
  }
  return parts.join(' ')
}

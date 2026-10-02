/**
 * Dosyayı editörde belirli satır/sütunda açmak için URL. Komut spawn edilmez:
 * VS Code ailesi editörlerin kaydettiği `<scheme>://file/<yol>:<satır>:<sütun>`
 * protokolü kullanılır, böylece argüman enjeksiyonu riski yoktur.
 */
export const EDITOR_SCHEMES = ['vscode', 'cursor', 'windsurf', 'vscode-insiders'] as const
export type EditorScheme = (typeof EDITOR_SCHEMES)[number]

export function editorFileUrl(scheme: EditorScheme, path: string, line: number, column?: number): string {
  const normalized = path.replace(/\\/g, '/')
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  const position = `:${Math.max(1, Math.floor(line))}${column ? `:${Math.max(1, Math.floor(column))}` : ''}`
  return `${scheme}://file${encodeURI(withSlash).replace(/[?#]/g, encodeURIComponent)}${position}`
}

/** Kayıtlı ilk editör protokolü; yoksa null (dosya varsayılan uygulamayla açılır). */
export function pickEditorScheme(isRegistered: (scheme: string) => boolean): EditorScheme | null {
  return EDITOR_SCHEMES.find((scheme) => isRegistered(scheme)) ?? null
}

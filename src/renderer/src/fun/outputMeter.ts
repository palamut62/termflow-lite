/**
 * Sekme başına çıktı hızı (byte/sn). Veri yolu yalnızca sayaç artırır; saniyede
 * bir örnek alınır. Store kullanılmaz, yani yoğun çıktı React render'ı tetiklemez.
 */
const WINDOW = 32
const current = new Map<string, number>()
const history = new Map<string, number[]>()

export function recordOutput(tabId: string, bytes: number): void {
  current.set(tabId, (current.get(tabId) ?? 0) + bytes)
}

/** Her saniye çağrılır: biriken sayaçları geçmişe kaydırır. */
export function sampleOutput(tabIds: string[]): void {
  for (const id of tabIds) {
    const list = history.get(id) ?? []
    list.push(current.get(id) ?? 0)
    if (list.length > WINDOW) list.shift()
    history.set(id, list)
    current.set(id, 0)
  }
  for (const id of history.keys()) {
    if (!tabIds.includes(id)) {
      history.delete(id)
      current.delete(id)
    }
  }
}

export function outputSamples(tabId: string): number[] {
  return history.get(tabId) ?? []
}

/** SVG polyline noktaları; en yüksek örnek kutunun tepesine oturur. */
export function sparklinePoints(samples: number[], width: number, height: number): string {
  if (samples.length < 2) return ''
  const max = Math.max(1, ...samples)
  const step = width / (WINDOW - 1)
  const offset = (WINDOW - samples.length) * step
  return samples
    .map((v, i) => `${(offset + i * step).toFixed(1)},${(height - 1 - (v / max) * (height - 2)).toFixed(1)}`)
    .join(' ')
}

export function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond < 1024) return `${bytesPerSecond} B/s`
  if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`
  return `${(bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
}

// ---- Live signals for the agent animation (no store, no re-render) ----

const lastInput = new Map<string, number>()

/** The user typed into this tab's terminal. */
export function recordInput(tabId: string): void {
  lastInput.set(tabId, Date.now())
}

/** When the user last typed into the tab (0 = never). */
export function lastInputAt(tabId: string): number {
  return lastInput.get(tabId) ?? 0
}

/** Output rate over the last sampled second, in bytes per second. */
export function latestRate(tabId: string): number {
  const samples = history.get(tabId)
  return samples?.length ? samples[samples.length - 1] : 0
}

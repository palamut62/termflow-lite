// Weather around the agent character: either a sky that changes every few
// minutes (no network), or live weather for a city from Open-Meteo through
// the main process. One shared reading for every pane, refreshed every 30
// minutes; nothing is fetched unless live weather is switched on.

import type { WeatherReading } from '../../../shared/ipc'

export type WeatherKind = 'sunny' | 'cloudy' | 'hot' | 'windy' | 'rain' | 'snow'

export interface WeatherNow {
  kind: WeatherKind
  /** Show the moon instead of the sun. */
  night: boolean
}

/** How long each sky of the changing weather lasts. */
export const WEATHER_CYCLE_MS = 4 * 60_000
// No kind follows itself, including the wrap-around.
const SEQUENCE: WeatherKind[] = ['sunny', 'hot', 'windy', 'rain', 'cloudy', 'windy', 'snow', 'rain', 'sunny', 'snow', 'cloudy', 'hot']

/** The changing sky at time `now` (the same in every pane). */
export function cycleWeather(now: number, period = WEATHER_CYCLE_MS): WeatherKind {
  return SEQUENCE[Math.floor(now / period) % SEQUENCE.length]
}

export const WINDY_KMH = 30
export const HOT_C = 28

/** Maps Open-Meteo's WMO weather code, temperature and wind to a character sky. */
export function kindForReading(reading: WeatherReading): WeatherKind {
  const code = reading.code
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return 'rain'
  if (reading.windSpeed >= WINDY_KMH) return 'windy'
  if (reading.temperature >= HOT_C && code <= 3) return 'hot'
  return code <= 1 ? 'sunny' : 'cloudy'
}

const REFRESH_MS = 30 * 60_000
const RETRY_MS = 10 * 60_000

interface LiveState {
  key: string
  reading: WeatherReading | null
  at: number
  failedAt: number
  pending: boolean
}

let live: LiveState = { key: '', reading: null, at: 0, failedAt: 0, pending: false }

/**
 * Live weather at `place`, or null until the first reading arrives. Cheap to
 * call every frame: it starts a fetch only when the reading is stale.
 */
export function liveWeather(place: { latitude: number; longitude: number }, now = Date.now()): WeatherNow | null {
  const key = `${place.latitude},${place.longitude}`
  if (live.key !== key) live = { key, reading: null, at: 0, failedAt: 0, pending: false }
  if (!live.pending && now - live.at > REFRESH_MS && now - live.failedAt > RETRY_MS) {
    const state = live
    state.pending = true
    void window.termflow.weather.current(place.latitude, place.longitude)
      .catch(() => null)
      .then((reading) => {
        state.pending = false
        if (reading) {
          state.reading = reading
          state.at = Date.now()
        } else {
          state.failedAt = Date.now()
        }
      })
  }
  return live.reading ? { kind: kindForReading(live.reading), night: !live.reading.isDay } : null
}

/** The last live reading, for the settings line ("12°C, wind 18 km/h"). */
export function lastLiveReading(): WeatherReading | null {
  return live.reading
}

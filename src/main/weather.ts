// Live weather for the agent character, from Open-Meteo (free, no API key).
// Runs in the main process because the renderer's CSP blocks outside
// requests. Only a city name (for the one-time lookup) and coordinates
// rounded to two decimals ever leave the machine; no IP geolocation.

import type { WeatherPlace, WeatherReading } from '../shared/ipc'

const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const TIMEOUT_MS = 8000

const round2 = (value: number): number => Math.round(value * 100) / 100

/** The first match of an Open-Meteo geocoding response, or null. */
export function parseGeocode(json: unknown): WeatherPlace | null {
  const first = (json as { results?: unknown[] } | null)?.results?.[0] as Record<string, unknown> | undefined
  if (!first || typeof first.name !== 'string' || typeof first.latitude !== 'number' || typeof first.longitude !== 'number') return null
  const country = typeof first.country === 'string' ? first.country : ''
  return { name: country ? `${first.name}, ${country}` : first.name, latitude: round2(first.latitude), longitude: round2(first.longitude) }
}

/** The `current` block of an Open-Meteo forecast response, or null. */
export function parseCurrent(json: unknown): WeatherReading | null {
  const current = (json as { current?: Record<string, unknown> } | null)?.current
  if (!current) return null
  const { weather_code: code, temperature_2m: temperature, wind_speed_10m: windSpeed, is_day: isDay } = current
  if (typeof code !== 'number' || typeof temperature !== 'number' || typeof windSpeed !== 'number') return null
  return { code, temperature, windSpeed, isDay: isDay !== 0 }
}

async function getJson(url: URL): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Weather service answered ${response.status}`)
  return response.json()
}

/** Looks a city up once; the settings keep the result. */
export async function geocodeCity(city: string): Promise<WeatherPlace | null> {
  const name = city.trim().slice(0, 80)
  if (!name) return null
  const url = new URL(GEOCODE_URL)
  url.searchParams.set('name', name)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  return parseGeocode(await getJson(url))
}

/** Current conditions at a place. */
export async function currentWeather(latitude: number, longitude: number): Promise<WeatherReading | null> {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null
  const url = new URL(FORECAST_URL)
  url.searchParams.set('latitude', String(round2(latitude)))
  url.searchParams.set('longitude', String(round2(longitude)))
  url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m,is_day')
  url.searchParams.set('wind_speed_unit', 'kmh')
  return parseCurrent(await getJson(url))
}

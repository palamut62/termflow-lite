import { describe, expect, it } from 'vitest'
import { currentWeather, parseCurrent, parseGeocode } from './weather'

describe('parseGeocode', () => {
  it('takes the first match and rounds its coordinates', () => {
    const json = { results: [{ name: 'Istanbul', country: 'Türkiye', latitude: 41.01384, longitude: 28.94966 }] }
    expect(parseGeocode(json)).toEqual({ name: 'Istanbul, Türkiye', latitude: 41.01, longitude: 28.95 })
  })

  it('returns null for no match or a malformed answer', () => {
    expect(parseGeocode({})).toBeNull()
    expect(parseGeocode({ results: [] })).toBeNull()
    expect(parseGeocode({ results: [{ name: 'X', latitude: '1' }] })).toBeNull()
    expect(parseGeocode(null)).toBeNull()
  })
})

describe('parseCurrent', () => {
  it('reads code, temperature, wind and day/night', () => {
    const json = { current: { weather_code: 61, temperature_2m: 12.4, wind_speed_10m: 18.2, is_day: 0 } }
    expect(parseCurrent(json)).toEqual({ code: 61, temperature: 12.4, windSpeed: 18.2, isDay: false })
  })

  it('returns null when a field is missing', () => {
    expect(parseCurrent({ current: { weather_code: 1, temperature_2m: 3 } })).toBeNull()
    expect(parseCurrent({})).toBeNull()
  })
})

describe('currentWeather', () => {
  it('refuses impossible coordinates without a request', async () => {
    await expect(currentWeather(120, 10)).resolves.toBeNull()
    await expect(currentWeather(Number.NaN, 10)).resolves.toBeNull()
  })
})

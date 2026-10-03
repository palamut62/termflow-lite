import { describe, expect, it } from 'vitest'
import { HOT_C, WEATHER_CYCLE_MS, WINDY_KMH, cycleWeather, kindForReading } from './weather'
import { faceTargets, weatherFace } from '../components/characterEngine'

const reading = (code: number, temperature = 18, windSpeed = 8) => ({ code, temperature, windSpeed, isDay: true })

describe('cycleWeather', () => {
  it('changes every period and never repeats a sky back to back', () => {
    const kinds = Array.from({ length: 30 }, (_, i) => cycleWeather(i * WEATHER_CYCLE_MS))
    for (let i = 1; i < kinds.length; i++) expect(kinds[i]).not.toBe(kinds[i - 1])
    expect(new Set(kinds)).toEqual(new Set(['sunny', 'cloudy', 'hot', 'windy', 'rain', 'snow']))
  })

  it('is the same for every pane at the same moment', () => {
    expect(cycleWeather(123_456_789)).toBe(cycleWeather(123_456_789))
  })
})

describe('kindForReading (WMO codes)', () => {
  it('snow and rain win over everything', () => {
    expect(kindForReading(reading(73, 35, 50))).toBe('snow')
    expect(kindForReading(reading(86))).toBe('snow')
    expect(kindForReading(reading(61, 30, 40))).toBe('rain')
    expect(kindForReading(reading(81))).toBe('rain')
    expect(kindForReading(reading(95))).toBe('rain')
  })

  it('then wind, heat, clear and clouds', () => {
    expect(kindForReading(reading(2, 20, WINDY_KMH))).toBe('windy')
    expect(kindForReading(reading(0, HOT_C))).toBe('hot')
    expect(kindForReading(reading(1))).toBe('sunny')
    expect(kindForReading(reading(3))).toBe('cloudy')
    expect(kindForReading(reading(45))).toBe('cloudy')
  })
})

describe('weatherFace', () => {
  const idle = faceTargets('idle', 0)

  it('smiles in the sun, squints in the wind, droops in the heat', () => {
    expect(weatherFace(idle, 'idle', 'sunny', 1, 0).smile).toBeGreaterThan(0.3)
    expect(weatherFace(idle, 'idle', 'windy', 1, 0).open).toBeLessThan(idle.open)
    expect(weatherFace(idle, 'idle', 'hot', 1, 0).open).toBeLessThan(idle.open)
  })

  it('leaves the face alone before the weather fades in, and a grumpy face never smiles', () => {
    expect(weatherFace(idle, 'idle', 'sunny', 0, 0)).toEqual(idle)
    const angry = faceTargets('angry', 0)
    expect(weatherFace(angry, 'angry', 'sunny', 1, 0).smile).toBe(angry.smile)
  })
})

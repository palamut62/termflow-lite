import { ipcMain } from 'electron'
import { IPC, type WeatherPlace, type WeatherReading } from '../../shared/ipc'
import { currentWeather, geocodeCity } from '../weather'

/** Weather lookups for the agent character; failures come back as null. */
export function registerWeatherIpc(): void {
  ipcMain.handle(IPC.WEATHER_GEOCODE, async (_event, city: unknown): Promise<WeatherPlace | null> => {
    if (typeof city !== 'string') return null
    try {
      return await geocodeCity(city)
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC.WEATHER_CURRENT, async (_event, latitude: unknown, longitude: unknown): Promise<WeatherReading | null> => {
    if (typeof latitude !== 'number' || typeof longitude !== 'number') return null
    try {
      return await currentWeather(latitude, longitude)
    } catch {
      return null
    }
  })
}

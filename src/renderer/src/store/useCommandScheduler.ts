import { useEffect, useRef } from 'react'
import { mergeProfiles, providerProfileId } from '../../../shared/profiles'
import { selectDueCommands, useSavedCommandStore } from './savedCommandStore'
import { useSettingsStore } from './settingsStore'
import { useTerminalStore } from './terminalStore'

const TICK_MS = 30000

function hasTarget(profileId: string): boolean {
  if (!profileId) return false
  const { settings, shells } = useSettingsStore.getState()
  return shells.some((item) => item.id === profileId) ||
    mergeProfiles(settings.profiles).some((item) => item.id === profileId) ||
    settings.providerProfiles.some((item) => providerProfileId(item.id) === profileId)
}

export function useCommandScheduler(): void {
  const ranAt = useRef(new Map<string, number>())

  useEffect(() => {
    const tick = (): void => {
      if (!useSettingsStore.getState().loaded) return
      const now = Date.now()
      for (const item of selectDueCommands(useSavedCommandStore.getState().commands, now)) {
        if (ranAt.current.get(item.id) === (item.lastRunAt ?? item.scheduleAnchor ?? 0)) continue
        if (!hasTarget(item.profileId) || !item.cwd) continue
        ranAt.current.set(item.id, item.lastRunAt ?? item.scheduleAnchor ?? 0)
        const tabId = useTerminalStore.getState().addTab(item.profileId, false, item.cwd, item.command)
        useSavedCommandStore.getState().startRun(item.id, tabId, now)
      }
    }
    tick()
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [])
}

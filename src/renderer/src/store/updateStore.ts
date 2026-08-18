import { create } from 'zustand'
import type { UpdateStatus } from '../../../shared/types'

const STORAGE_KEY = 'termflow.update-dismissed.v1'

/** Rozet yalnızca eyleme dönüştürülebilir durumlarda ve kapatılmamış sürüm için görünür. */
export function shouldShowUpdateBadge(status: UpdateStatus, dismissedVersion: string | null): boolean {
  if (status.state === 'downloading' || status.state === 'downloaded') return true
  if (status.state !== 'available') return false
  return !dismissedVersion || status.version !== dismissedVersion
}

export function updateBadgeLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'available':
      return `v${status.version ?? '?'}`
    case 'downloading':
      return `${status.percent ?? 0}%`
    case 'downloaded':
      return 'Restart'
    default:
      return ''
  }
}

export function updateBadgeTitle(status: UpdateStatus): string {
  switch (status.state) {
    case 'available':
      return `Version ${status.version ?? '?'} is available — click to download`
    case 'downloading':
      return `Downloading update… ${status.percent ?? 0}%`
    case 'downloaded':
      return `Version ${status.version ?? '?'} is ready — click to restart and install`
    default:
      return ''
  }
}

function loadDismissed(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function persistDismissed(version: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    // Dismiss only lasts for this session when storage is unavailable.
  }
}

interface UpdateState {
  status: UpdateStatus
  dismissedVersion: string | null
  confirmingInstall: boolean
  setStatus(status: UpdateStatus): void
  dismiss(): void
  setConfirmingInstall(value: boolean): void
}

export const useUpdateStore = create<UpdateState>()((set, get) => ({
  status: { state: 'idle' },
  dismissedVersion: loadDismissed(),
  confirmingInstall: false,
  setStatus: (status) => set({ status, confirmingInstall: status.state === 'available' ? get().confirmingInstall : false }),
  dismiss: () => {
    const version = get().status.version
    if (!version) return
    persistDismissed(version)
    set({ dismissedVersion: version })
  },
  setConfirmingInstall: (confirmingInstall) => set({ confirmingInstall })
}))

/** Main tarafındaki updater olaylarını tek merkezden store'a bağlar. */
export function initUpdateStatusBridge(): () => void {
  if (typeof window === 'undefined' || !window.termflow?.updater) return () => {}
  return window.termflow.updater.onStatus((status) => useUpdateStore.getState().setStatus(status))
}

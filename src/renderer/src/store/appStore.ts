import { create } from 'zustand'
import { registerThemeStore } from './storeShared'
import { registerNotificationStore, notifyAgentTurnDone } from './notifications'
import { onAttentionRaised } from '../terminalActivity'
import { createLayoutSlice, type LayoutSlice } from './slices/layoutSlice'
import { createTerminalSlice, type TerminalSlice } from './slices/terminalSlice'
import { createDevResourcesSlice, type DevResourcesSlice } from './slices/devResourcesSlice'

// Public store shape — the union of every slice. Component-facing API is
// unchanged: state field and action names are identical to the pre-split store.
export type AppState = LayoutSlice & TerminalSlice & DevResourcesSlice


export const useAppStore = create<AppState>()((...a) => ({
  ...createLayoutSlice(...a),
  ...createTerminalSlice(...a),
  ...createDevResourcesSlice(...a)
}))

// Lets the system-theme media listener read the current theme without a
// circular import back into this module.
registerThemeStore(useAppStore)
registerNotificationStore(useAppStore)

// When a long agent turn finishes (detected from output activity, not shell
// integration), raise a desktop notification — but only if the app is unfocused,
// which notifyAgentTurnDone enforces.
onAttentionRaised((terminalId) => {
  const name = useAppStore.getState().terminals[terminalId]?.name || 'Terminal'
  notifyAgentTurnDone(terminalId, name)
})

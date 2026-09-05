import { create } from 'zustand'
export interface HandoverReview { source: string; target: string; cwd?: string; prompt: string }
let resolveReview: ((value: string | null) => void) | undefined
export const useHandoverStore = create<{
  pending: HandoverReview | null; tabId?: string; result: string
  review(value: HandoverReview): Promise<string | null>; finish(prompt: string | null): void
  track(tabId: string): void; started(tabId: string): void; failed(tabId: string): void
}>((set, get) => ({
  pending: null, result: '',
  review(value) { if (get().pending) return Promise.reject(new Error('Finish the current handover first.')); set({ pending: value }); return new Promise(resolve => { resolveReview = resolve }) },
  finish(prompt) { const resolve = resolveReview; resolveReview = undefined; set({ pending: null }); resolve?.(prompt) },
  track(tabId) { set({ tabId, result: 'Handover approved; starting target CLI.' }) },
  started(tabId) { if (get().tabId === tabId) set({ result: 'Target CLI started with the approved handover.' }) },
  failed(tabId) { if (get().tabId === tabId) set({ result: 'Target CLI failed. The source session is still available.' }) }
}))

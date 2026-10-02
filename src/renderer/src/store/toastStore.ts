import { create } from 'zustand'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'success' | 'error'
}

interface ToastState {
  toasts: Toast[]
  show(text: string, tone?: Toast['tone']): void
  dismiss(id: number): void
}

const TOAST_MS = 3200
let nextId = 1

/** Kısa ömürlü in-app bildirimler (native dialog yerine). */
export const useToastStore = create<ToastState>()((set, get) => ({
  toasts: [],
  show(text, tone = 'info') {
    const id = nextId++
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone }] })
    setTimeout(() => get().dismiss(id), TOAST_MS)
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
}))

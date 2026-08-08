import type { TermflowApi } from './index'

declare global {
  interface Window {
    termflow: TermflowApi
  }
}

export {}

import { defineConfig } from '@playwright/test'

/**
 * E2E suite (PRD §75). Runs against the PRODUCTION build — `npm run
 * test:e2e` builds first (out/main/index.js is the app entry, package.json
 * `main`). Electron apps are single-instance heavy processes: one worker,
 * generous per-test timeout, compact line reporter.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  reporter: 'line',
  use: {
    trace: 'off'
  }
})

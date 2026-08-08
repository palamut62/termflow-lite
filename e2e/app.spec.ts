import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

/**
 * E2E suite (PRD §75) against the production build. `npm run test:e2e` builds
 * first, then launches Electron with a throwaway pid-scoped userData dir
 * (TERMFLOW_E2E=1 — see src/main/index.ts) so the real user settings are never
 * touched. Every test starts from a fresh app instance with one default tab.
 */

let app: ElectronApplication
let win: Page

test.beforeEach(async () => {
  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1' }
  })
  win = await app.firstWindow()
  // confirmBeforeClose defaults to true: accept the window.confirm dialog so
  // close-tab flows never hang waiting for user input.
  win.on('dialog', (dialog) => void dialog.accept())
  await win.waitForSelector('.tab')
})

test.afterEach(async () => {
  await app.close()
})

test('launches with a default terminal', async () => {
  await expect(win.locator('.tab')).toHaveCount(1)
  await expect(win.locator('.tab').first()).toHaveClass(/tab-active/)
  // xterm 6 renders with the DOM renderer (no canvas) — the .xterm root is
  // the rendered terminal host.
  await expect(win.locator('.terminal-host .xterm')).toBeVisible()
  // Default profile resolves to a real shell (PowerShell on Windows).
  await expect(win.locator('.tab-title').first()).not.toBeEmpty()
})

test('new tab button adds an active second tab', async () => {
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab')).toHaveCount(2)
  await expect(win.locator('.tab').last()).toHaveClass(/tab-active/)
})

test('clicking a tab switches the active tab', async () => {
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab').last()).toHaveClass(/tab-active/)
  await win.locator('.tab').first().click()
  await expect(win.locator('.tab').first()).toHaveClass(/tab-active/)
  await expect(win.locator('.tab').last()).not.toHaveClass(/tab-active/)
})

test('close tab removes it (confirm dialog auto-accepted)', async () => {
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab')).toHaveCount(2)
  // The close button is hover-visible on inactive tabs — hover first.
  const firstTab = win.locator('.tab').first()
  await firstTab.hover()
  await firstTab.locator('.tab-close').click()
  await expect(win.locator('.tab')).toHaveCount(1)
  await expect(win.locator('.tab').first()).toHaveClass(/tab-active/)
})

test('Ctrl+, opens settings and Escape closes it', async () => {
  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  await win.keyboard.press('Escape')
  await win.waitForSelector('.settings-backdrop', { state: 'hidden' })
})

test('choosing a theme changes --terminal-background', async () => {
  const cssVar = (): Promise<string> =>
    win.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--terminal-background').trim()
    )
  expect(await cssVar()).toBe('#0d1117') // dark default
  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  await win.locator('.theme-card', { hasText: 'Light' }).click()
  await expect.poll(cssVar).toBe('#ffffff') // GITHUB_LIGHT background
})

test('font size stepper updates the font size input', async () => {
  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  // Scope to the Font Size field — Terminal Padding has a number input too.
  const fontField = win.locator('.settings-field', { hasText: 'Font Size' })
  const fontInput = fontField.locator('input.settings-number-sm')
  await expect(fontInput).toHaveValue('13')
  await fontField.locator('button[aria-label="Increase font size"]').click()
  await expect(fontInput).toHaveValue('14')
})

test('Ctrl+Shift+F opens search; Escape closes it', async () => {
  await win.keyboard.press('Control+Shift+F')
  await win.waitForSelector('.terminal-search')
  await win.fill('.terminal-search-input', 'search-term')
  await expect(win.locator('.terminal-search-input')).toHaveValue('search-term')
  await win.keyboard.press('Escape')
  await win.waitForSelector('.terminal-search', { state: 'hidden' })
})

test('double-clicking a tab renames it inline', async () => {
  await win.locator('.tab').first().dblclick()
  await win.waitForSelector('.tab-edit-input')
  await win.fill('.tab-edit-input', 'My Renamed Tab')
  await win.keyboard.press('Enter')
  await expect(win.locator('.tab').first().locator('.tab-title')).toHaveText('My Renamed Tab')
})

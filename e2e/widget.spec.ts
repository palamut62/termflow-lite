import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Compact widget view (TermFlow widget spec): the same window shrinks into a
 * top-right status widget and back. The acceptance criteria that matter most
 * are checked against a real PTY: a running command is never interrupted and
 * the full window comes back exactly where it was.
 */

let app: ElectronApplication
let win: Page
let userData = ''

const bounds = (): Promise<{ x: number; y: number; width: number; height: number }> =>
  app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-widget-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ gpuAcceleration: 'off', showTips: false, closeToTray: false, confirmBeforeClose: false, restoreSession: false }))
  app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData } })
  win = await app.firstWindow()
  await win.waitForSelector('.terminal-host .xterm')
})

test.afterEach(async () => {
  if (app) await app.close()
  rmSync(userData, { recursive: true, force: true })
})

test('a running command keeps going through widget view and back', async () => {
  await expect(win.locator('.agent-work-state').first()).toHaveText('Waiting for input', { timeout: 15_000 })
  const before = await bounds()
  await win.locator('.terminal-host .xterm').first().click()
  await win.keyboard.type('1..6 | % { "tick$_"; Start-Sleep -Milliseconds 500 }')
  await win.keyboard.press('Enter')

  await win.click('[aria-label="Switch to widget view"]')
  await expect(win.locator('.tf-widget')).toBeVisible()
  const widget = await bounds()
  expect(widget.width).toBe(640)
  expect(widget.height).toBe(260)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true)
  await expect(win.locator('.tf-row').first()).toHaveAttribute('data-state', 'running')
  await expect(win.locator('.tf-row .tf-time').first()).toHaveText(/^\d{2}:\d{2}$/)

  // When the command finishes the row stops claiming it is running.
  await expect(win.locator('.tf-row').first()).toHaveAttribute('data-state', 'idle', { timeout: 15_000 })

  await win.click('[aria-label="Open full window"]')
  await expect(win.locator('.tf-widget')).toHaveCount(0)
  await expect.poll(bounds).toEqual(before)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(false)
  const text = await win.locator('.terminal-host .xterm-rows').first().innerText()
  for (let i = 1; i <= 6; i++) expect(text).toContain(`tick${i}`)
})

test('collapses to one line, unpins, and remembers both', async () => {
  await win.click('[aria-label="Switch to widget view"]')
  await win.click('[aria-label="Collapse widget"]')
  await expect.poll(async () => (await bounds()).height).toBe(40)
  await expect(win.locator('.tf-widget.is-collapsed .tf-inline-summary')).toBeVisible()

  await win.click('[aria-label="Unpin widget"]')
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(false)

  await win.click('[aria-label="Open full window"]')
  await win.click('[aria-label="Switch to widget view"]')
  await expect.poll(async () => (await bounds()).height).toBe(40)
  await expect(win.locator('[aria-label="Keep widget on top"]')).toBeVisible()
})

test('clicking a row opens that terminal in the full window', async () => {
  await win.click('[aria-label="New tab"]')
  await expect(win.locator('.tab')).toHaveCount(2)
  const firstId = await win.locator('.tab').first().getAttribute('data-tab-id')

  await win.click('[aria-label="Switch to widget view"]')
  await expect(win.locator('.tf-row')).toHaveCount(2)
  await win.locator('.tf-row').first().click()

  await expect(win.locator('.tf-widget')).toHaveCount(0)
  await expect(win.locator(`.tab[data-tab-id="${firstId}"]`)).toHaveClass(/tab-active/)
})

import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * GitHub panel, driven by the user's own `gh` CLI.
 *
 * Network-dependent assertions are avoided: the tests cover the panel's own
 * behaviour (opening, tab switching, seeding the repository from the active
 * terminal) and the "gh unavailable" path, which is forced by launching the
 * app with a PATH that contains no gh.
 */

let app: ElectronApplication
let win: Page
let cleanupDirectories: string[] = []

function ghReady(): boolean {
  try {
    execFileSync('gh', ['auth', 'status'], { windowsHide: true, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

async function launch(env: Record<string, string> = {}): Promise<void> {
  const userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-gh-'))
  cleanupDirectories.push(userData)
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    gpuAcceleration: 'off', closeToTray: false, confirmBeforeClose: false, restoreSession: false
  }))
  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData, ...env }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.tab')
}

async function openPanel(): Promise<void> {
  await win.click('.new-tab-caret')
  await win.click('text=GitHub...')
  await win.waitForSelector('[aria-label="GitHub"]')
}

test.beforeEach(() => { cleanupDirectories = [] })

test.afterEach(async () => {
  if (app) await app.close()
  for (const directory of cleanupDirectories) rmSync(directory, { recursive: true, force: true })
})

test('reports a missing GitHub CLI instead of asking for a token', async () => {
  // An empty PATH makes the gh spawn fail with ENOENT.
  const emptyDir = mkdtempSync(join(tmpdir(), 'termflow-e2e-nopath-'))
  cleanupDirectories.push(emptyDir)
  await launch({ PATH: emptyDir, Path: emptyDir })
  await openPanel()

  await expect(win.locator('[aria-label="GitHub"]')).toContainText('not installed')
  await expect(win.locator('[aria-label="GitHub"]')).toContainText('never stores a token')
  // No credential input is offered anywhere in the panel.
  await expect(win.locator('[aria-label="GitHub"] input[type="password"]')).toHaveCount(0)
})

test.describe('with an authenticated gh', () => {
  test.skip(!ghReady(), 'gh is not installed or not logged in')

  test('shows the signed-in account and both tabs', async () => {
    await launch()
    await openPanel()

    const panel = win.locator('[aria-label="GitHub"]')
    // The header carries the account once gh has answered.
    await expect(panel.locator('.settings-header-title')).toContainText('—', { timeout: 30_000 })
    await expect(panel.getByRole('tab', { name: /Pull requests/ })).toBeVisible()
    await expect(panel.getByRole('tab', { name: /Repositories/ })).toBeVisible()
  })

  test('switches to the repository list and seeds the PR tab from a pick', async () => {
    await launch()
    await openPanel()
    const panel = win.locator('[aria-label="GitHub"]')
    await expect(panel.getByRole('tab', { name: /Repositories/ })).toBeVisible({ timeout: 30_000 })

    await panel.getByRole('tab', { name: /Repositories/ }).click()
    await expect(panel.locator('.github-row').first()).toBeVisible({ timeout: 30_000 })

    const name = await panel.locator('.github-row-title').first().innerText()
    await panel.locator('.github-row').first().getByRole('button', { name: 'Pull requests' }).click()

    // Picking a repository switches back and fills the repository field.
    await expect(panel.locator('#github-repo')).toHaveValue(name.trim().split(' ')[0])
  })

  test('closes on Escape', async () => {
    await launch()
    await openPanel()
    await win.keyboard.press('Escape')
    await expect(win.locator('[aria-label="GitHub"]')).toHaveCount(0)
  })
})

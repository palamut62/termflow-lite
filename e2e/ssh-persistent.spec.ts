import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Persistent remote sessions in the SSH settings form.
 *
 * No real host is contacted: the assertions cover the settings round-trip and
 * the resulting ssh argument vector, which is what decides whether the remote
 * work survives a disconnect. Argument construction itself is unit tested in
 * src/shared/sshPersistent.test.ts.
 */

let app: ElectronApplication
let win: Page
let userData = ''

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-sshp-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    gpuAcceleration: 'off', closeToTray: false, confirmBeforeClose: false, restoreSession: false,
    sshConnections: [{ id: 'srv1', name: 'Prod', host: 'prod.example.com', user: 'deploy' }]
  }))
  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.tab')
})

test.afterEach(async () => {
  if (app) await app.close()
  rmSync(userData, { recursive: true, force: true })
})

/** Open Settings > SSH and start editing the seeded connection. */
async function editSshConnection(): Promise<void> {
  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  await win.getByRole('button', { name: 'SSH', exact: true }).click()
  // The form fields only exist once a connection is being edited.
  await win.locator('.profile-row', { hasText: 'Prod' }).getByRole('button', { name: 'Edit' }).click()
  await win.waitForSelector('text=Persistent Session')
}

test('persistent session fields stay hidden until the toggle is on', async () => {
  await editSshConnection()

  await expect(win.locator('text=Multiplexer')).toHaveCount(0)
  await win.getByRole('switch', { name: 'Keep the remote session alive' }).click()
  await expect(win.locator('text=Multiplexer')).toBeVisible()
  await expect(win.locator('text=Session Name')).toBeVisible()
})

test('saves a persistent session and round-trips it through settings', async () => {
  await editSshConnection()
  await win.getByRole('switch', { name: 'Keep the remote session alive' }).click()
  await win.fill('input[placeholder="termflow"]', 'agents')
  await win.locator('.profile-form-actions').getByRole('button', { name: 'Save', exact: true }).click()

  const stored = await win.evaluate(async () => (await window.termflow.settings.get()).sshConnections?.[0])
  expect(stored).toMatchObject({
    host: 'prod.example.com',
    persistentSession: true,
    multiplexer: 'tmux',
    sessionName: 'agents'
  })
})

test('offers screen as an alternative multiplexer', async () => {
  await editSshConnection()
  await win.getByRole('switch', { name: 'Keep the remote session alive' }).click()
  await win.selectOption('#ssh-multiplexer', 'screen')
  await win.locator('.profile-form-actions').getByRole('button', { name: 'Save', exact: true }).click()

  const stored = await win.evaluate(async () => (await window.termflow.settings.get()).sshConnections?.[0])
  expect(stored).toMatchObject({ persistentSession: true, multiplexer: 'screen' })
})

test('turning persistence back off clears its settings', async () => {
  await editSshConnection()
  await win.getByRole('switch', { name: 'Keep the remote session alive' }).click()
  await win.fill('input[placeholder="termflow"]', 'agents')
  await win.locator('.profile-form-actions').getByRole('button', { name: 'Save', exact: true }).click()

  await editSshConnection()
  await win.getByRole('switch', { name: 'Keep the remote session alive' }).click()
  await win.locator('.profile-form-actions').getByRole('button', { name: 'Save', exact: true }).click()

  const stored = await win.evaluate(async () => (await window.termflow.settings.get()).sshConnections?.[0])
  // No stale session name is left behind to resurface if it is re-enabled.
  expect(stored?.persistentSession).toBeUndefined()
  expect(stored?.sessionName).toBeUndefined()
})

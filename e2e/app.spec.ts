import { _electron as electron, expect, test } from '@playwright/test'

test('opens the help center and the tmux settings in the real Electron renderer', async () => {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, TERMFLOW_E2E: '1' } })
  try {
    const page = await app.firstWindow()
    await expect(page.getByText('TermFlow', { exact: true })).toBeVisible()
    const recovery = page.getByText('Continue restored session')
    if (await recovery.isVisible().catch(() => false)) await recovery.click()

    // Help and the developer surfaces live behind the toolbar's More menu.
    await page.getByLabel('More actions').click()
    await page.getByTitle('Help').click()
    await expect(page.getByText('TermFlow Help Center')).toBeVisible()
    // The tmux topics are the product's core documentation now.
    await page.getByPlaceholder('Search help topics...').fill('panes')
    await expect(page.getByText('Split a window into panes').first()).toBeVisible()
    await page.getByLabel('Close help').click()

    // The prefix key is the defining tmux setting; it must be reachable.
    await page.getByLabel('Open Settings').click()
    await page.getByRole('button', { name: 'Terminal', exact: true }).click({ force: true })
    await expect(page.getByText('tmux prefix key')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('creates a terminal window and exercises tmux pane controls', async () => {
  const app = await electron.launch({ args: ['.'], env: { ...process.env, TERMFLOW_E2E: '1' } })
  try {
    const page = await app.firstWindow()
    const recovery = page.getByText('Continue restored session')
    if (await recovery.isVisible().catch(() => false)) await recovery.click()

    // Use the real workspace dialog so the test covers the renderer -> IPC path.
    await page.getByTitle('New workspace', { exact: true }).click()
    const workspaceDialog = page.getByRole('dialog')
    await workspaceDialog.getByPlaceholder('Project name').fill('E2E workspace')
    await workspaceDialog.locator('input').nth(1).fill('C:\\Users\\umuti\\Projects\\TermFlow')
    await workspaceDialog.getByRole('button', { name: 'Create' }).click()
    await page.getByTitle('New window (CMD)').click()
    await page.locator('.pane-leaf').first().waitFor()

    // Use the window action menu to exercise the same split operation exposed
    // by the tmux prefix bindings; the pane tree must render two leaves.
    await page.getByTitle('More actions').last().click()
    await page.getByText('Split pane vertically', { exact: true }).click()
    await expect(page.locator('.pane-leaf')).toHaveCount(2)
  } finally {
    await app.close()
  }
})

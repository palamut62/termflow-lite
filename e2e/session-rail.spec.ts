import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Session rail: a repository -> session tree along the left edge, so long-lived
 * agent sessions stay addressable once the tab bar stops being readable.
 */

let app: ElectronApplication
let win: Page
let cleanupDirectories: string[] = []
let repo = ''
let plainDir = ''

test.beforeEach(async () => {
  cleanupDirectories = []
  const userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-rail-user-'))
  cleanupDirectories.push(userData)
  // Rail on from the start; no close confirmation so the close button is direct.
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    gpuAcceleration: 'off', closeToTray: false, confirmBeforeClose: false, restoreSession: false, showSessionRail: true
  }))

  const sandbox = mkdtempSync(join(tmpdir(), 'termflow-e2e-rail-'))
  cleanupDirectories.push(sandbox)
  repo = join(sandbox, 'my-app')
  plainDir = join(sandbox, 'notes')
  execFileSync('git', ['init', '-b', 'main', 'my-app'], { cwd: sandbox, windowsHide: true, stdio: 'ignore' })
  const git = (args: string[]): void => { execFileSync('git', args, { cwd: repo, windowsHide: true, stdio: 'ignore' }) }
  git(['config', 'user.email', 'e2e@example.invalid'])
  git(['config', 'user.name', 'TermFlow E2E'])
  writeFileSync(join(repo, 'README.md'), '# e2e\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])
  execFileSync('git', ['init', '-b', 'main', 'notes'], { cwd: sandbox, windowsHide: true, stdio: 'ignore' })

  app = await electron.launch({
    args: ['.', '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: userData }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.tab')
})

test.afterEach(async () => {
  if (app) await app.close()
  for (const directory of cleanupDirectories) rmSync(directory, { recursive: true, force: true })
})

/** Open a tab at `path` through the "Open at folder..." dialog. */
async function openAt(path: string): Promise<void> {
  await win.click('.new-tab-caret')
  await win.click('text=Open at folder...')
  await win.waitForSelector('[aria-label="Open terminal at folder"]')
  await win.fill('#path-launch-cwd', path)
  // Exact match: 'Open' also appears in the dialog title and the Browse row.
  await win.locator('[aria-label="Open terminal at folder"]').getByRole('button', { name: 'Open', exact: true }).click()
  await expect(win.locator('[aria-label="Open terminal at folder"]')).toHaveCount(0)
}

test('is toggled from the tab bar and persists as a setting', async () => {
  await expect(win.locator('.session-rail')).toBeVisible()
  await win.click('[aria-label="Toggle session rail"]')
  await expect(win.locator('.session-rail')).toHaveCount(0)
  await win.click('[aria-label="Toggle session rail"]')
  await expect(win.locator('.session-rail')).toBeVisible()
})

test('groups sessions by repository and follows the active tab', async () => {
  await openAt(repo)
  await openAt(plainDir)

  const rail = win.locator('.session-rail')
  await expect(rail.locator('.session-rail-group-label', { hasText: 'my-app' })).toBeVisible()
  await expect(rail.locator('.session-rail-group-label', { hasText: 'notes' })).toBeVisible()

  // The most recently opened tab is active, and the rail reflects it.
  await expect(rail.locator('.session-rail-item-active')).toHaveCount(1)
})

test('selecting a rail session activates its tab', async () => {
  await openAt(repo)
  await openAt(plainDir)

  const firstItem = win.locator('.session-rail-item').first()
  const label = await firstItem.locator('.session-rail-title').innerText()
  await firstItem.locator('.session-rail-select').click()

  await expect(firstItem).toHaveClass(/session-rail-item-active/)
  await expect(win.locator('.tab-active .tab-title')).toHaveText(label)
})

test('closing from the rail removes the session', async () => {
  await openAt(repo)
  const before = await win.locator('.session-rail-item').count()
  expect(before).toBeGreaterThan(1)

  await win.locator('.session-rail-item').last().locator('.session-rail-close').click()
  await expect(win.locator('.session-rail-item')).toHaveCount(before - 1)
  await expect(win.locator('.tab')).toHaveCount(before - 1)
})

test('a collapsed group hides its sessions but keeps the count', async () => {
  await openAt(repo)
  const group = win.locator('.session-rail-group').filter({ hasText: 'my-app' })
  await expect(group.locator('.session-rail-item')).toHaveCount(1)

  await group.locator('.session-rail-group-header').click()
  await expect(group.locator('.session-rail-item')).toHaveCount(0)
  await expect(group.locator('.session-rail-count')).toHaveText('1')

  await group.locator('.session-rail-group-header').click()
  await expect(group.locator('.session-rail-item')).toHaveCount(1)
})

test('a worktree session shows its branch in the rail', async () => {
  await win.click('.new-tab-caret')
  await win.click('text=New worktree session...')
  await win.fill('#worktree-repo', repo)
  await expect(win.locator('.path-launch-hint').first()).toContainText('on main')
  await win.fill('#worktree-branch', 'tf/rail-1')
  await win.click('text=Create & open')
  await expect(win.locator('.status-worktree')).toBeVisible()

  // The checkout lives elsewhere on disk but is grouped under its repository.
  const group = win.locator('.session-rail-group').filter({ hasText: 'my-app' })
  await expect(group.locator('.session-rail-branch')).toContainText('tf/rail-1')
})

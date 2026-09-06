import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * End-to-end coverage for per-agent worktree isolation: the dialog creates a
 * real git worktree, the tab runs inside it, and closing the tab offers to
 * remove the checkout again. Runs against the production build with a
 * throwaway userData dir (TERMFLOW_E2E=1).
 */

let app: ElectronApplication
let win: Page
let cleanupDirectories: string[] = []
let repo = ''
let sandbox = ''

test.beforeEach(async () => {
  cleanupDirectories = []
  const userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-wt-user-'))
  cleanupDirectories.push(userData)
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ gpuAcceleration: 'off', closeToTray: false, confirmBeforeClose: false, restoreSession: false }))

  sandbox = mkdtempSync(join(tmpdir(), 'termflow-e2e-wt-repo-'))
  cleanupDirectories.push(sandbox)
  repo = join(sandbox, 'my-app')
  execFileSync('git', ['init', '-b', 'main', 'my-app'], { cwd: sandbox, windowsHide: true, stdio: 'ignore' })
  const git = (args: string[]): void => { execFileSync('git', args, { cwd: repo, windowsHide: true, stdio: 'ignore' }) }
  git(['config', 'user.email', 'e2e@example.invalid'])
  git(['config', 'user.name', 'TermFlow E2E'])
  writeFileSync(join(repo, 'README.md'), '# e2e\n')
  git(['add', '.'])
  git(['commit', '-m', 'init'])

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

async function openWorktreeDialog(): Promise<void> {
  await win.click('.new-tab-caret')
  await win.click('text=New worktree session...')
  await win.waitForSelector('[aria-label="New worktree session"]')
}

test('creates an isolated checkout and runs the tab inside it', async () => {
  const tabsBefore = await win.locator('.tab').count()
  await openWorktreeDialog()

  await win.fill('#worktree-repo', repo)
  // The dialog resolves the repository before it will enable the button.
  await expect(win.locator('.path-launch-hint').first()).toContainText('on main')

  await win.fill('#worktree-branch', 'tf/e2e-1')
  await win.click('text=Create & open')

  await expect(win.locator('[aria-label="New worktree session"]')).toHaveCount(0)
  await expect(win.locator('.tab')).toHaveCount(tabsBefore + 1)
  await expect(win.locator('.status-worktree')).toBeVisible()

  // The checkout exists on disk, outside the repository directory.
  const container = join(sandbox, '.termflow-worktrees', 'my-app', 'tf-e2e-1')
  expect(existsSync(join(container, 'README.md'))).toBe(true)
  expect(readdirSync(repo)).not.toContain('tf-e2e-1')

  const branches = execFileSync('git', ['branch', '--list'], { cwd: repo, windowsHide: true }).toString()
  expect(branches).toContain('tf/e2e-1')
})

test('reports a git error instead of opening a tab', async () => {
  await openWorktreeDialog()
  await win.fill('#worktree-repo', sandbox) // a plain directory, not a repo
  await expect(win.locator('.path-launch-hint').first()).toContainText('Not a git repository')
  await expect(win.locator('text=Create & open')).toBeDisabled()
})

test('offers cleanup when the worktree tab closes and removes the checkout', async () => {
  await openWorktreeDialog()
  await win.fill('#worktree-repo', repo)
  await expect(win.locator('.path-launch-hint').first()).toContainText('on main')
  await win.fill('#worktree-branch', 'tf/e2e-2')
  await win.click('text=Create & open')
  await expect(win.locator('.status-worktree')).toBeVisible()

  const checkout = join(sandbox, '.termflow-worktrees', 'my-app', 'tf-e2e-2')
  expect(existsSync(checkout)).toBe(true)

  await win.click('.tab-active .tab-close')
  await win.waitForSelector('[aria-label="Worktree cleanup"]')
  await win.click('text=Remove checkout & branch')

  await expect(win.locator('[aria-label="Worktree cleanup"]')).toHaveCount(0)
  expect(existsSync(checkout)).toBe(false)
  const branches = execFileSync('git', ['branch', '--list'], { cwd: repo, windowsHide: true }).toString()
  expect(branches).not.toContain('tf/e2e-2')
  // The repository itself is untouched.
  expect(existsSync(join(repo, 'README.md'))).toBe(true)
})

test('keeps the checkout when the user declines cleanup', async () => {
  await openWorktreeDialog()
  await win.fill('#worktree-repo', repo)
  await expect(win.locator('.path-launch-hint').first()).toContainText('on main')
  await win.fill('#worktree-branch', 'tf/e2e-3')
  await win.click('text=Create & open')
  await expect(win.locator('.status-worktree')).toBeVisible()

  await win.click('.tab-active .tab-close')
  await win.waitForSelector('[aria-label="Worktree cleanup"]')
  await win.click('text=Keep everything')

  await expect(win.locator('[aria-label="Worktree cleanup"]')).toHaveCount(0)
  expect(existsSync(join(sandbox, '.termflow-worktrees', 'my-app', 'tf-e2e-3', 'README.md'))).toBe(true)
})

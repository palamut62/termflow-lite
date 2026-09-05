import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let app: ElectronApplication
let page: Page
let folder: string
const pageErrors: string[] = []
test.beforeEach(async ({}, info) => {
  folder = mkdtempSync(join(tmpdir(), 'termflow-workflows-'))
  writeFileSync(join(folder, 'invalid.exe'), '')
  const settings = { defaultProfileId: 'cmd', closeToTray: false, gpuAcceleration: 'off', startupDirectory: 'home',
    defaultAgentPermissionMode: 'safe', profiles: [{ id: 'broken', name: 'Broken test', command: 'C:\\termflow-missing-test\\no.exe' }, { id: 'invalid', name: 'Invalid executable', command: join(folder, 'invalid.exe') }] }
  writeFileSync(join(folder, 'settings.json'), JSON.stringify(settings))
  if (info.title.includes('saved folders')) {
    mkdirSync(join(folder, 'a')); mkdirSync(join(folder, 'b'))
    writeFileSync(join(folder, 'session.json'), JSON.stringify({ version: 1, tabs: [
      { id: 'a', title: 'A', profileId: 'cmd', cwd: join(folder, 'a') },
      { id: 'b', title: 'B', profileId: 'cmd', cwd: join(folder, 'b') }
    ], activeTabId: 'a', paneTree: null, splitDirection: null, splitRatio: 0.5 }))
  }
  pageErrors.length = 0
  app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: folder } })
  page = await app.firstWindow()
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.waitForSelector('.tab')
})
test.afterEach(async () => { await app?.close(); rmSync(folder, { recursive: true, force: true }) })
async function settings(section: string): Promise<void> {
  await page.keyboard.press('Control+,')
  await page.getByRole('button', { name: section, exact: true }).click()
}

test('restores saved folders and initializes image support without CSP errors', async () => {
  await expect(page.locator('.tab')).toHaveCount(2)
  await expect.poll(async () => page.evaluate(() => window.termflow.pty.buffer('a'))).toContain(join(folder, 'a'))
  await expect.poll(async () => page.evaluate(() => window.termflow.pty.buffer('b'))).toContain(join(folder, 'b'))
  expect(pageErrors.filter(e => /WebAssembly|Content Security/.test(e))).toEqual([])
})

test('failed executable shows an error and a retry action', async () => {
  await page.locator('.new-tab-caret').click()
  await page.getByRole('menuitem', { name: 'Broken test' }).click()
  await expect(page.getByRole('alert')).toContainText(/not found|cannot find/i)
  await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Restart', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
})

test('saves and opens a project workspace without closing existing terminals', async () => {
  await page.getByRole('button', { name: 'Split terminal right', exact: true }).click()
  await settings('Workspaces')
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('Review workspace')
  await page.getByRole('button', { name: 'Save workspace', exact: true }).click()
  await expect(page.getByText('Review workspace', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open workspace', exact: true }).click()
  await expect(page.locator('.tab')).toHaveCount(4)
  await expect(page.locator('.pane-leaf')).toHaveCount(2)
})

test('invalid Windows executable stays an in-app error without crashing the main process', async () => {
  await app.evaluate(({ dialog }) => { (globalThis as any).nativeErrors = 0; dialog.showErrorBox = () => { (globalThis as any).nativeErrors++ } })
  await page.locator('.new-tab-caret').click()
  await page.getByRole('menuitem', { name: 'Invalid executable', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('CLI not found')
  expect(await app.evaluate(() => (globalThis as any).nativeErrors)).toBe(0)
  await page.getByRole('button', { name: 'Close Tab', exact: true }).click()
  // Kapatma onayı varsayılan olarak açık; hatalı sekme de aynı onaydan geçer.
  await page.getByRole('dialog', { name: 'Close terminal tab' }).getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('.tab')).toHaveCount(1)
})

test('previews a backup before applying and rejects malformed data', async () => {
  await settings('Backup & Restore')
  await page.getByRole('textbox', { name: 'Backup JSON' }).fill('{"version":2}')
  await page.getByRole('button', { name: 'Preview import' }).click()
  await expect(page.getByRole('status')).toContainText('Not a supported')
  const settingsData = await page.evaluate(() => window.termflow.settings.get())
  await page.getByRole('textbox', { name: 'Backup JSON' }).fill(JSON.stringify({ format: 'termflow-backup', version: 1, settings: settingsData, commands: [], workspaces: [] }))
  await page.getByRole('button', { name: 'Preview import' }).click()
  await expect(page.getByRole('button', { name: 'Apply import' })).toBeVisible()
  await page.getByRole('button', { name: 'Apply import' }).click()
  await expect(page.getByRole('status')).toContainText('Backup imported')
})

test('records the actual result of a saved command and keeps its working folder', async () => {
  await page.getByTitle('Saved commands', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Command working folder' }).fill(folder)
  await page.getByRole('textbox', { name: 'Command name' }).fill('Exit test')
  await page.getByRole('combobox', { name: 'Run command in' }).selectOption('cmd')
  await page.getByRole('textbox', { name: 'Command', exact: true }).fill('exit /b 7')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Run Exit test' }).click()
  await expect(page.getByText('Last result: exit 7', { exact: true })).toBeVisible()
})

test('local profile health reports a missing CLI without hiding the error', async () => {
  await settings('Profile Health')
  await page.getByRole('combobox', { name: 'Profile to check' }).selectOption('broken')
  await page.getByRole('button', { name: 'Check locally' }).click()
  await expect(page.getByText('Needs attention · CLI')).toBeVisible()
})

test('handover asks for review and passes only the approved text to the target', async () => {
  await app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler('agent-sessions:list'); ipcMain.handle('agent-sessions:list', () => [{ agent: 'claude', id: 'review', title: 'Review task', updatedAt: Date.now() }])
    ipcMain.removeHandler('agent-sessions:handover'); ipcMain.handle('agent-sessions:handover', () => 'Preserve completed changes.')
    ipcMain.removeHandler('pty:create'); ipcMain.handle('pty:create', (_e, ...args) => { (globalThis as any).reviewArgs = args; return { pid: 123 } })
  })
  await page.getByTitle('Saved agent sessions', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Profile for Review task' }).selectOption('codex')
  await page.getByRole('button', { name: 'Hand over', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Review agent handover' })).toBeVisible()
  await expect(page.locator('.tab')).toHaveCount(1)
  await page.getByRole('textbox', { name: 'Remaining work' }).fill('Finish tests.')
  await page.getByRole('button', { name: 'Start handover' }).click()
  await expect(page.locator('.tab')).toHaveCount(2)
  await expect.poll(() => app.evaluate(() => (globalThis as any).reviewArgs?.[6])).toContain('Finish tests.')
})

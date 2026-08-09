import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/**
 * E2E suite (PRD §75) against the production build. `npm run test:e2e` builds
 * first, then launches Electron with a throwaway pid-scoped userData dir
 * (TERMFLOW_E2E=1 — see src/main/index.ts) so the real user settings are never
 * touched. Every test starts from a fresh app instance with one default tab.
 */

let app: ElectronApplication
let win: Page
let cleanupDirectories: string[] = []
let e2eUserData = ''

const contextMenuCases = [
  ['powershell', 'PowerShell'], ['cmd', 'Command Prompt'], ['gitbash', 'Git Bash'], ['wsl-ubuntu', 'Ubuntu'],
  ['claude', 'Claude Code'], ['codex', 'Codex'], ['opencode', 'OpenCode'], ['ollama-serve', 'Ollama Serve'],
  ['provider:deepseek', 'DeepSeek'], ['provider:openrouter', 'OpenRouter'], ['provider:ollama-local', 'Ollama Local']
] as const

test.beforeEach(async ({}, testInfo) => {
  cleanupDirectories = []
  e2eUserData = mkdtempSync(join(tmpdir(), 'termflow-e2e-user-data-'))
  cleanupDirectories.push(e2eUserData)
  const contextCase = contextMenuCases.find(([id]) => testInfo.title === `Explorer menu opens ${id}`)
  const args = ['.', '--no-sandbox']
  if (contextCase) {
    const cwd = mkdtempSync(join(tmpdir(), 'termflow-context-menu-'))
    cleanupDirectories.push(cwd)
    args.push('--profile', contextCase[0].replace('provider:', 'provider--'), cwd)
  }
  app = await electron.launch({
    args,
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: e2eUserData }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.tab')
})

test.afterEach(async () => {
  if (app) await app.close()
  for (const directory of cleanupDirectories) rmSync(directory, { recursive: true, force: true })
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

for (const [profileId, title] of contextMenuCases) {
  test(`Explorer menu opens ${profileId}`, async () => {
    await expect(win.locator('.tab-title').first()).toHaveText(title)
    if (profileId === 'claude') {
      await expect(win.locator('.terminal-view').first()).toContainText(/Claude Code|Accessing workspace/, { timeout: 30_000 })
    }
  })
}

test('existing app opens each Explorer request in a new requested-profile tab', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-second-instance-'))
  cleanupDirectories.push(cwd)
  const launch = async (profileId: string): Promise<void> => {
    await electron.launch({
      args: [resolve('.'), '--no-sandbox', '--profile', profileId.replace('provider:', 'provider--'), cwd],
      env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: e2eUserData }
    }).then((secondApp) => secondApp.close()).catch(() => undefined)
  }

  await launch('provider:deepseek')
  await expect(win.locator('.tab-title')).toHaveCount(2)
  await expect(win.locator('.tab-title').last()).toHaveText('DeepSeek')
  await launch('claude')
  await expect(win.locator('.tab-title')).toHaveCount(3)
  await expect(win.locator('.tab-title').last()).toHaveText('Claude Code')
  await expect(win.locator('.terminal-view').last()).toContainText(/Claude Code|Accessing workspace/, { timeout: 30_000 })
})

test('new tab button adds an active second tab', async () => {
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab')).toHaveCount(2)
  await expect(win.locator('.tab').last()).toHaveClass(/tab-active/)
})

test('splits terminals right or down and keeps both panes interactive', async () => {
  await win.getByRole('button', { name: 'Split terminal right' }).click()
  const panes = win.locator('.pane-leaf')
  await expect(panes).toHaveCount(2)
  const firstBox = await panes.nth(0).boundingBox()
  const secondBox = await panes.nth(1).boundingBox()
  expect(Math.abs((firstBox?.width ?? 0) - (secondBox?.width ?? 0))).toBeLessThan(3)
  const divider = await win.getByRole('separator', { name: 'Resize split terminals' }).first().boundingBox()
  expect(divider).not.toBeNull()
  await win.mouse.move(divider!.x + divider!.width / 2, divider!.y + 20)
  await win.mouse.down()
  await win.mouse.move(divider!.x + 100, divider!.y + 20)
  await win.mouse.up()
  const resizedFirst = await panes.nth(0).boundingBox()
  const resizedSecond = await panes.nth(1).boundingBox()
  expect(Math.abs((resizedFirst?.width ?? 0) - (resizedSecond?.width ?? 0))).toBeGreaterThan(100)
  await panes.nth(0).click()
  await win.keyboard.type('echo SPLIT_LEFT')
  await win.keyboard.press('Enter')
  await expect(panes.nth(0)).toContainText('SPLIT_LEFT')
  await win.getByRole('button', { name: 'Split terminal down' }).click()
  await expect(win.locator('.pane-leaf')).toHaveCount(3)
  await win.getByRole('button', { name: 'Close split view' }).click()
  await expect(win.locator('.terminal-view:not(.inactive)')).toHaveCount(1)
})

test('tiles every existing tab when split view opens', async () => {
  await win.click('.new-tab-btn')
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab')).toHaveCount(3)
  await win.getByRole('button', { name: 'Split terminal right' }).click()
  await expect(win.locator('.pane-leaf')).toHaveCount(3)
  await expect(win.locator('.terminal-view:not(.inactive)')).toHaveCount(3)
})

test('opens a shell in an explicitly selected folder', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-lite-path-'))
  cleanupDirectories.push(cwd)
  await win.click('.new-tab-caret')
  await win.getByRole('menuitem', { name: 'Open at folder...' }).click()
  await expect(win.getByRole('dialog', { name: 'Open terminal at folder' })).toBeVisible()
  await win.fill('#path-launch-cwd', cwd)
  await win.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(win.locator('.tab')).toHaveCount(2)
  const terminal = win.locator('.terminal-view').last()
  await terminal.click()
  await win.keyboard.type('node -p "process.cwd()"')
  await win.keyboard.press('Enter')
  await expect(terminal).toContainText(cwd, { timeout: 15000 })
})

test('pastes into the terminal with Ctrl+V', async () => {
  await app.evaluate(({ clipboard }) => clipboard.writeText('echo CTRL_V_OK'))
  const terminal = win.locator('.terminal-view').first()
  await terminal.click()
  await win.keyboard.press('Control+V')
  await win.keyboard.press('Enter')
  await expect(terminal).toContainText('CTRL_V_OK', { timeout: 10000 })
})

test('pastes a copied Windows file as its full path', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-clipboard-file-'))
  cleanupDirectories.push(cwd)
  const file = join(cwd, 'copied file.txt')
  writeFileSync(file, 'clipboard path test')
  await app.evaluate(({ clipboard }, filePath) => {
    clipboard.writeBuffer('FileNameW', Buffer.from(`${filePath}\0`, 'utf16le'))
  }, file)
  const terminal = win.locator('.terminal-view').first()
  await terminal.click()
  await win.keyboard.type('Write-Output ')
  await win.keyboard.press('Control+V')
  await win.keyboard.press('Enter')
  await expect(terminal).toContainText(file, { timeout: 10000 })
})

test('shows per-pane session details and changes only that pane directory', async () => {
  const secondCwd = mkdtempSync(join(tmpdir(), 'termflow-pane-second-'))
  const changedCwd = mkdtempSync(join(tmpdir(), 'termflow-pane-changed-'))
  cleanupDirectories.push(secondCwd, changedCwd)

  await win.click('.new-tab-caret')
  await win.getByRole('menuitem', { name: 'Open at folder...' }).click()
  await win.fill('#path-launch-cwd', secondCwd)
  await win.getByRole('button', { name: 'Open', exact: true }).click()
  await win.getByRole('button', { name: 'Split terminal right' }).click()
  const panels = win.locator('.pane-leaf .agent-work-panel')
  await expect(panels).toHaveCount(2)
  await expect(panels.nth(1)).toContainText(secondCwd)

  await panels.nth(0).locator('.agent-work-cwd').click()
  const dialog = win.getByRole('dialog', { name: /Change working directory/ })
  await dialog.getByLabel('Folder path').fill(changedCwd)
  await dialog.getByRole('button', { name: 'Change and restart' }).click()
  await expect(panels.nth(0)).toContainText(changedCwd)
  await expect(panels.nth(1)).toContainText(secondCwd)
})

test('shows configured providers in the new tab menu', async () => {
  await win.click('.new-tab-caret')
  await expect(win.getByRole('menu').getByText('Providers', { exact: true })).toBeVisible()
  await expect(win.getByRole('menuitem', { name: 'DeepSeek' })).toBeVisible()
  await expect(win.getByRole('menuitem', { name: 'OpenRouter' })).toBeVisible()
})

test('clicking a tab switches the active tab', async () => {
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab').last()).toHaveClass(/tab-active/)
  await win.locator('.tab').first().click()
  await expect(win.locator('.tab').first()).toHaveClass(/tab-active/)
  await expect(win.locator('.tab').last()).not.toHaveClass(/tab-active/)
})

/**
 * Regression: switching tabs must NOT restart the background shell. Mounting a
 * TerminalView used to call pty.create() again, and PtyCore.create() kills an
 * existing PTY for that id — so every switch silently killed whatever was
 * running in the tab you switched away from.
 */
test('switching away and back keeps the same shell process alive', async () => {
  const marker = `tfmarker${Date.now()}`
  // Echo a unique marker in the first tab's shell.
  await win.locator('.terminal-host').first().click()
  await win.keyboard.type(`echo ${marker}`)
  await win.keyboard.press('Enter')
  const firstTerminal = win.locator('.terminal-view').first()
  // Two occurrences: the typed command line + the shell's output.
  await expect(firstTerminal).toContainText(marker, { timeout: 15000 })

  // Switch to a second tab and back.
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab').last()).toHaveClass(/tab-active/)
  await win.locator('.tab').first().click()
  await expect(win.locator('.tab').first()).toHaveClass(/tab-active/)

  // A restarted shell would have a blank scrollback: the marker must survive.
  await expect(firstTerminal).toContainText(marker)
})

test('close tab removes it (in-app confirm dialog)', async () => {
  await win.click('.new-tab-btn')
  await expect(win.locator('.tab')).toHaveCount(2)
  // The close button is hover-visible on inactive tabs — hover first.
  const firstTab = win.locator('.tab').first()
  await firstTab.hover()
  await firstTab.locator('.tab-close').click()
  // confirmBeforeClose defaults to true: confirm through the in-app modal.
  await win.waitForSelector('.confirm-dialog')
  await win.locator('.confirm-dialog .settings-btn-primary').click()
  await expect(win.locator('.tab')).toHaveCount(1)
  await expect(win.locator('.tab').first()).toHaveClass(/tab-active/)
})

test('Ctrl+, opens settings and Escape closes it', async () => {
  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  await win.keyboard.press('Escape')
  await win.waitForSelector('.settings-backdrop', { state: 'hidden' })
})

test('settings keeps a fixed safe-area size across sections', async () => {
  await win.keyboard.press('Control+,')
  const panel = win.getByRole('dialog', { name: 'Settings' })
  const appearanceBox = await panel.boundingBox()
  expect(appearanceBox).not.toBeNull()
  expect(appearanceBox!.y).toBeGreaterThanOrEqual(50)
  const scrollbarWidth = await win.locator('.settings-content').evaluate((element) => getComputedStyle(element).scrollbarWidth)
  expect(scrollbarWidth).toBe('none')
  await win.getByRole('button', { name: 'Providers' }).click()
  const providerBox = await panel.boundingBox()
  expect(providerBox?.width).toBe(appearanceBox?.width)
  expect(providerBox?.height).toBe(appearanceBox?.height)
})

test('command profiles and providers expose full-permission controls', async () => {
  await win.keyboard.press('Control+,')
  await win.getByRole('button', { name: 'Profiles' }).click()
  const claudeRow = win.locator('.profile-row', { hasText: 'Claude Code' })
  await claudeRow.getByRole('button', { name: 'Edit' }).click()
  await expect(win.getByRole('switch', { name: 'Command profile full permissions' })).toHaveAttribute('aria-checked', 'true')
  await expect(win.locator('.settings-field', { hasText: 'Default Model' }).locator('input')).toHaveValue('opus')
  await expect(win.locator('.settings-field', { hasText: 'Permission Arguments' }).locator('input')).toHaveValue('--dangerously-skip-permissions')
  await win.getByRole('button', { name: 'Providers' }).click()
  const deepSeekRow = win.locator('.profile-row', { hasText: 'DeepSeek' })
  await deepSeekRow.getByRole('button', { name: 'Edit' }).click()
  await expect(win.getByRole('switch', { name: 'Provider full permissions' })).toHaveAttribute('aria-checked', 'true')
  await expect(win.locator('.settings-field', { hasText: 'Active Model' }).locator('select')).toHaveValue('deepseek-v4-pro')
})

test('shows the simple status bar', async () => {
  const statusBar = win.getByRole('contentinfo', { name: 'Terminal status' })
  await expect(statusBar).toBeVisible()
  await expect(statusBar).toContainText('1 tab')
  const styles = await win.evaluate(() => {
    const viewport = document.querySelector('.xterm-viewport')!
    const root = getComputedStyle(document.documentElement)
    return {
      overflowX: getComputedStyle(viewport).overflowX,
      viewportBackground: getComputedStyle(viewport).backgroundColor,
      terminalBackground: root.getPropertyValue('--terminal-background').trim(),
      statusBorderTop: getComputedStyle(document.querySelector('.status-bar')!).borderTopWidth
    }
  })
  expect(styles.overflowX).toBe('hidden')
  expect(styles.viewportBackground).toBe('rgb(30, 30, 30)')
  expect(styles.terminalBackground).toBe('#1e1e1e')
  expect(styles.statusBorderTop).toBe('0px')
  const scrollbarWidth = await win.locator('.xterm-viewport').first().evaluate((element) => getComputedStyle(element).scrollbarWidth)
  expect(scrollbarWidth).toBe('none')
})

test('shows an animated indicator while a tab process is running', async () => {
  const indicator = win.locator('.tab-active .tab-process-indicator')
  await expect(indicator).toHaveClass(/tab-activity-(running|waiting)/)
  const animationName = await indicator.evaluate((element) => getComputedStyle(element).animationName)
  expect(animationName).toBe('tab-process-pulse')
})

test('marks background output as unread and clears it when selected', async () => {
  const firstTab = win.locator('.tab').first()
  await win.locator('.terminal-view').first().click()
  await win.keyboard.type(`node -e "setTimeout(()=>console.log('BACKGROUND_OUTPUT'),500)"`)
  await win.keyboard.press('Enter')
  await win.click('.new-tab-btn')
  await expect(firstTab.locator('.tab-process-indicator')).toHaveClass(/tab-activity-unread/, { timeout: 10000 })
  await firstTab.click()
  await expect(firstTab.locator('.tab-process-indicator')).toHaveClass(/tab-activity-running/)
})

test('marks a failed terminal process as error', async () => {
  const terminal = win.locator('.terminal-view').first()
  await terminal.click()
  await win.keyboard.type('exit 7')
  await win.keyboard.press('Enter')
  await expect(win.locator('.tab').first().locator('.tab-process-indicator')).toHaveClass(/tab-activity-error/, { timeout: 10000 })
})

test('smart status bar shows git branch and changed files for the active folder', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-lite-git-'))
  cleanupDirectories.push(cwd)
  execFileSync('git', ['init', '-b', 'status-test'], { cwd, stdio: 'ignore' })
  writeFileSync(join(cwd, 'changed.txt'), 'status bar test')
  await win.click('.new-tab-caret')
  await win.getByRole('menuitem', { name: 'Open at folder...' }).click()
  await win.fill('#path-launch-cwd', cwd)
  await win.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(win.locator('.status-git')).toContainText('status-test (1)', { timeout: 10000 })
  await expect(win.locator('.terminal-view:not(.inactive) .status-process')).toContainText('Running')
})

test('captures, searches and reruns command history', async () => {
  const terminal = win.locator('.terminal-view').first()
  await terminal.click()
  await win.waitForTimeout(400)
  await win.keyboard.type('echo HISTORY_MARKER')
  await win.keyboard.press('Enter')
  await expect(terminal).toContainText('HISTORY_MARKER')
  await win.keyboard.press('Control+Shift+H')
  const history = win.getByRole('complementary', { name: 'Command history' })
  await expect(history).toBeVisible()
  await expect(history.getByText('echo HISTORY_MARKER', { exact: true })).toBeVisible()
  await history.getByPlaceholder('Search commands, folders...').fill('HISTORY_MARKER')
  await history.getByTitle('Run in active terminal').click()
  await expect(history).toBeHidden()
  await expect(terminal).toContainText('HISTORY_MARKER')
})

test('browses saved agent sessions from the status bar', async () => {
  await win.getByRole('button', { name: 'Sessions' }).click()
  const panel = win.getByRole('complementary', { name: 'Agent sessions' })
  await expect(panel).toBeVisible()
  await expect(panel.getByPlaceholder('Search sessions, folders...')).toBeVisible()
  await expect(panel.getByLabel('Filter agent sessions')).toBeVisible()
  await expect(panel.locator('.agent-session-entry, .history-empty').first()).toBeVisible({ timeout: 15000 })
  await panel.getByRole('button', { name: 'Close agent sessions' }).click()
  await expect(panel).toBeHidden()
})

test('discovers and runs package scripts from the command palette', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-lite-palette-'))
  cleanupDirectories.push(cwd)
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { 'palette-test': `node -e "console.log('PALETTE_TASK_OK')"` } }))
  writeFileSync(join(cwd, 'pyproject.toml'), '[project]\nname="palette-test"')
  writeFileSync(join(cwd, 'compose.yml'), 'services: {}')
  await win.click('.new-tab-caret')
  await win.getByRole('menuitem', { name: 'Open at folder...' }).click()
  await win.fill('#path-launch-cwd', cwd)
  await win.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(win.locator('.status-project')).toContainText('Node.js · Python · Docker')
  await win.keyboard.press('Control+Shift+P')
  const palette = win.getByRole('dialog', { name: 'Command palette' })
  await expect(palette).toBeVisible()
  await palette.getByPlaceholder('Type a task or command...').fill('palette-test')
  await palette.getByText('npm: palette-test', { exact: true }).click()
  await expect(win.locator('.terminal-view').last()).toContainText('PALETTE_TASK_OK', { timeout: 15000 })
})

test('shows agent work details below provider terminals', async () => {
  await expect(win.getByRole('region', { name: 'Agent work session' })).toHaveCount(0)
  await win.click('.new-tab-caret')
  await win.getByRole('menuitem', { name: 'DeepSeek' }).click()
  const panel = win.getByRole('region', { name: 'Agent work session' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('DeepSeek')
  await expect(panel).toContainText('deepseek-v4-pro')
  await expect(panel).toContainText('Full access')
  await expect(panel).toContainText(/\d+:\d{2}/)
  const activeTab = win.locator('.tab-active')
  await expect(activeTab.locator('.tab-process-indicator')).toHaveCount(1)
  await expect(activeTab.locator('.menu-item-dot')).toHaveCount(0)
  await expect(activeTab.locator('.tab-icon-cmd')).toHaveCount(1)
  const colors = await panel.evaluate((element) => ({
    panel: getComputedStyle(element).backgroundColor,
    terminal: getComputedStyle(document.querySelector('.terminal-area')!).backgroundColor
  }))
  expect(colors.panel).toBe(colors.terminal)
  await expect(win.locator('.status-bar')).not.toContainText('DeepSeek')
  await expect(win.locator('.status-bar')).not.toContainText('deepseek-v4-pro')
  await expect(win.locator('.status-bar')).not.toContainText('Full access')
})

test('choosing a theme changes --terminal-background', async () => {
  const cssVar = (): Promise<string> =>
    win.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--terminal-background').trim()
    )
  expect(await cssVar()).toBe('#1e1e1e') // Dark+ default
  await win.keyboard.press('Control+,')
  await win.waitForSelector('.settings-backdrop')
  await win.locator('.theme-card', { hasText: 'Light+ (default light)' }).click()
  await expect.poll(cssVar).toBe('#ffffff') // Light+ background
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

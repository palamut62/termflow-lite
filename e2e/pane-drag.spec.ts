import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Pane drag & drop: a pane is lifted by its grip and dropped on another pane's
 * edge, which re-tiles the split tree (tmux's join-pane, with the mouse).
 *
 * Playwright's mouse API does not raise HTML5 drag events in Electron, so the
 * drag is driven by dispatching real DragEvents with a shared DataTransfer —
 * the same events the browser would deliver. Everything downstream (drop-edge
 * maths, movePane, the store) is the production code path.
 */

let app: ElectronApplication
let win: Page
let userData = ''

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'termflow-e2e-pane-'))
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({
    gpuAcceleration: 'off', closeToTray: false, confirmBeforeClose: false, restoreSession: false
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

/** Split into `count` panes laid out left-to-right. */
async function makePanes(count: number): Promise<void> {
  for (let i = 1; i < count; i++) await win.click('[aria-label="Split terminal right"]')
  await expect(win.locator('.pane-leaf')).toHaveCount(count)
}

/**
 * Drag pane `from` onto a relative position of pane `to`.
 * `at` is a fraction of the target pane's size.
 */
async function dragPane(from: number, to: number, at: { x: number; y: number }): Promise<void> {
  await win.evaluate(({ from, to, at }) => {
    const panes = document.querySelectorAll('.pane-leaf')
    const source = panes[from]
    const target = panes[to] as HTMLElement
    const grip = source.querySelector('.pane-grip') as HTMLElement
    const transfer = new DataTransfer()

    grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    const rect = target.getBoundingClientRect()
    const clientX = rect.left + rect.width * at.x
    const clientY = rect.top + rect.height * at.y
    for (const type of ['dragover', 'drop']) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer, clientX, clientY }))
    }
    grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }))
  }, { from, to, at })
}

/** Terminal ids in pane order, read from the mounted TerminalViews. */
async function paneOrder(): Promise<string[]> {
  return win.evaluate(() =>
    [...document.querySelectorAll('.pane-leaf')].map((pane) => pane.getAttribute('data-tab-id') ?? '')
  )
}

test('every pane exposes a drag grip', async () => {
  await makePanes(2)
  await expect(win.locator('.pane-grip')).toHaveCount(2)
})

test('dropping on a pane edge re-tiles the split', async () => {
  await makePanes(3)
  const before = await paneOrder()
  expect(before.filter(Boolean)).toHaveLength(3)

  // Drop the first pane below the last one.
  await dragPane(0, 2, { x: 0.5, y: 0.95 })

  const after = await paneOrder()
  expect(after.filter(Boolean)).toHaveLength(3)
  // No terminal was lost or duplicated, and the order actually changed.
  expect([...after].sort()).toEqual([...before].sort())
  expect(after).not.toEqual(before)
  // A horizontal (stacked) split now exists where there was none.
  await expect(win.locator('.pane-tree-horizontal')).toHaveCount(1)
})

test('dropping on the center swaps two panes and keeps the layout', async () => {
  await makePanes(2)
  const before = await paneOrder()

  await dragPane(0, 1, { x: 0.5, y: 0.5 })

  const after = await paneOrder()
  expect(after).toEqual([before[1], before[0]])
  // A swap must not introduce a new split level.
  await expect(win.locator('.pane-tree-horizontal')).toHaveCount(0)
  await expect(win.locator('.pane-leaf')).toHaveCount(2)
})

test('dropping a pane onto itself changes nothing', async () => {
  await makePanes(2)
  const before = await paneOrder()
  await dragPane(0, 0, { x: 0.95, y: 0.5 })
  expect(await paneOrder()).toEqual(before)
})

test('the drop hint previews the target half while dragging', async () => {
  await makePanes(2)
  await win.evaluate(() => {
    const panes = document.querySelectorAll('.pane-leaf')
    const grip = panes[0].querySelector('.pane-grip') as HTMLElement
    const target = panes[1] as HTMLElement
    const transfer = new DataTransfer()
    grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    const rect = target.getBoundingClientRect()
    target.dispatchEvent(new DragEvent('dragover', {
      bubbles: true, cancelable: true, dataTransfer: transfer,
      clientX: rect.left + rect.width * 0.95, clientY: rect.top + rect.height * 0.5
    }))
  })
  await expect(win.locator('.pane-drop-right')).toHaveCount(1)
})

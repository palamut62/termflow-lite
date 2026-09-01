import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

/**
 * Tıklanabilir yollar (sol tık → aç, sağ tık → yol menüsü).
 *
 * Doğrulama MAIN process katmanında yapılır: `shell.openPath` ve
 * `shell.showItemInFolder`, test sırasında gerçek dosya açmak yerine
 * globalThis'e log yazan stub'larla değiştirilir. Böylece uçtan uca akış
 * (hover → link kurulumu → IPC çözümleme → tık → openPath) doğrulanır.
 *
 * Renderer'ın `window.termflow.system.*`'ı contextBridge ile DONMUŞ olduğu için
 * oradan patch'lemek işe yaramaz; bu yüzden main katmanı kullanılır. Renderer'da
 * hiçbir debug logu yoktur (production kodu).
 */

let app: ElectronApplication | undefined
let win: Page | undefined
const cleanup: string[] = []

test.afterEach(async () => {
  if (app) await app.close()
  for (const d of cleanup) rmSync(d, { recursive: true, force: true })
  cleanup.length = 0
})

async function launch(): Promise<void> {
  const e2eUserData = mkdtempSync(join(tmpdir(), 'termflow-clickable-userdata-'))
  cleanup.push(e2eUserData)
  app = await electron.launch({
    args: [resolve('.'), '--no-sandbox'],
    env: { ...process.env, TERMFLOW_E2E: '1', TERMFLOW_E2E_USER_DATA: e2eUserData }
  })
  win = await app.firstWindow()
  await win.waitForSelector('.tab')
  await win.waitForSelector('.terminal-host .xterm')
  await win.locator('.terminal-view').first().locator('.terminal-host').click()
  await win.waitForTimeout(1500)
}

/**
 * Main process'te dış etkileri loglayan stub'a çevir: gerçek dosya açma, klasör
 * gösterme ve clipboard yazımı yerine globalThis'e log yazar. (Bu ortamda OS
 * clipboard okuması bozuk — aynı process içinde write→read bile "" dönüyor.)
 */
async function stubShell(eapp: ElectronApplication): Promise<void> {
  await eapp.evaluate(({ shell, clipboard }) => {
    const g = globalThis as unknown as { __tfLogs: { kind: string; path: string }[] }
    g.__tfLogs = []
    shell.openPath = async (p: string): Promise<string> => {
      g.__tfLogs.push({ kind: 'open', path: p })
      return '' // başarı
    }
    shell.showItemInFolder = (p: string): void => {
      g.__tfLogs.push({ kind: 'reveal', path: p })
    }
    clipboard.writeText = (t: string): void => {
      g.__tfLogs.push({ kind: 'copy', path: t })
    }
  })
}

async function tfLogs(): Promise<{ kind: string; path: string }[]> {
  return app!.evaluate(() => (globalThis as unknown as { __tfLogs: { kind: string; path: string }[] }).__tfLogs)
}

/** Aktif terminalin cursor satırı (0-based viewport). */
async function cursorRow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const views = Array.from(document.querySelectorAll('.terminal-view'))
    const active = views.find((v) => !v.classList.contains('inactive')) ?? views[views.length - 1]
    const ta = active.querySelector('.xterm-helper-textarea') as HTMLElement | null
    if (!ta) return 0
    const cellH = ta.offsetHeight || 1
    return Math.round(parseFloat(ta.style.top) / cellH)
  })
}

/** Aktif terminaldeki echo çıktı satırının ekran konumu (cursor'ın hemen üstü). */
async function outputPos(page: Page): Promise<{ x: number; y: number; cellW: number; cellH: number }> {
  return page.evaluate(() => {
    // Aktif olmayan tab 'visibility:hidden' ile gizlenir (display:none DEĞİL),
    // yani offsetWidth>0 kontrolü yanıltır; .inactive sınıfını ele.
    const views = Array.from(document.querySelectorAll('.terminal-view'))
    const active = views.find((v) => !v.classList.contains('inactive')) ?? views[views.length - 1]
    const screen = active.querySelector('.xterm-screen') as HTMLElement
    const ta = active.querySelector('.xterm-helper-textarea') as HTMLElement
    const screenRect = screen.getBoundingClientRect()
    const cellW = ta.offsetWidth || 1
    const cellH = ta.offsetHeight || 1
    const cursorRow = Math.round(parseFloat(ta.style.top) / cellH)
    return {
      x: screenRect.left + 2 * cellW, // yolun başına yakın
      y: screenRect.top + (cursorRow - 1 + 0.5) * cellH, // çıktı satırı
      cellW,
      cellH
    }
  })
}

/**
 * Link kurulana dek hafifçe hover edip tıklar; `shell.openPath` (stub) yakaladığı
 * anda durur. xterm link provider'ı hover üzerine çalıştığı ve çözümleme asenkron
 * olduğu için, ilk tıklar link hazır değilken boşa gidebilir.
 */
async function hoverClickUntilOpen(page: Page, pos: { x: number; y: number }): Promise<string> {
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(pos.x, pos.y + (i % 3) * 5) // yeni cell tetiklesin
    await page.mouse.click(pos.x, pos.y)
    const opens = (await tfLogs()).filter((l) => l.kind === 'open')
    if (opens.length > 0) return opens[opens.length - 1].path
    await page.waitForTimeout(350)
  }
  return ''
}

async function hoverClickUntilReveal(page: Page, pos: { x: number; y: number }): Promise<string> {
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(pos.x, pos.y + (i % 3) * 5)
    await page.mouse.click(pos.x, pos.y)
    const reveals = (await tfLogs()).filter((l) => l.kind === 'reveal')
    if (reveals.length > 0) return reveals[reveals.length - 1].path
    await page.waitForTimeout(350)
  }
  return ''
}

test('absolute path: detected, click opens, right-click menu works (right-click does not open)', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-clickable-abs-'))
  cleanup.push(cwd)
  const filePath = join(cwd, 'hello file.txt')
  writeFileSync(filePath, 'hello clickable')

  await launch()
  await stubShell(app!)

  // Shell'in boşlukta iki argümana bölmemesi için tek string yazdır; terminal
  // çıktısında tırnaksız, boşluk içeren gerçek yol görünür.
  await win!.keyboard.type(`echo "${filePath}"`)
  await win!.keyboard.press('Enter')

  // echo çıktısı render olana dek bekle (cursor çıktı satırını geçer); yüklü
  // koşullarda sabit 1500ms bekleme yetersiz kalıp yanlış satıra tıklatıyordu.
  await expect.poll(() => cursorRow(win!), { timeout: 15000 }).toBeGreaterThanOrEqual(2)

  const pos = await outputPos(win!)
  const opened = await hoverClickUntilOpen(win!, pos)
  console.log('OPENED', opened)
  expect(opened).toBe(filePath)
  const opensAfterLeftClick = (await tfLogs()).filter((l) => l.kind === 'open').length

  // Sağ tık → yol menüsü; ama dosya AÇILMAMALI. (xterm 6 linkifier'ı sağ tıkta
  // da activate tetikler; pathLinks.ts button===2'yi artık yok sayıyor.)
  await win!.mouse.click(pos.x, pos.y, { button: 'right' })
  await expect(win!.getByRole('menuitem', { name: 'Open File', exact: true })).toBeVisible()
  await expect(win!.getByRole('menuitem', { name: 'Open File Location' })).toBeVisible()
  await expect(win!.getByRole('menuitem', { name: 'Copy Path' })).toBeVisible()
  expect((await tfLogs()).filter((l) => l.kind === 'open').length).toBe(opensAfterLeftClick)

  // 'Open File Location' → reveal (Explorer'da göster).
  await win!.getByRole('menuitem', { name: 'Open File Location' }).click()
  await expect.poll(async () => (await tfLogs()).filter((l) => l.kind === 'reveal').length).toBeGreaterThan(0)

  // 'Copy Path' → main clipboard.writeText (stub yakalar). Artık renderer
  // navigator.clipboard yerine IPC üzerinden main'e yazar.
  await win!.mouse.click(pos.x, pos.y, { button: 'right' })
  await expect(win!.getByRole('menuitem', { name: 'Copy Path' })).toBeVisible()
  await win!.getByRole('menuitem', { name: 'Copy Path' }).click()
  await expect
    .poll(async () => (await tfLogs()).filter((l) => l.kind === 'copy').length, { timeout: 5000 })
    .toBeGreaterThan(0)
  expect((await tfLogs()).find((l) => l.kind === 'copy')?.path).toBe(filePath)
})

test('relative path resolves against the tab cwd', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-clickable-rel-'))
  cleanup.push(cwd)
  const rel = 'notes.txt'
  writeFileSync(join(cwd, rel), 'relative path test')

  await launch()
  await stubShell(app!)

  // Belirtilen klasörde yeni sekme aç (tab.cwd = launchCwd = cwd).
  await win!.click('.new-tab-caret')
  await win!.getByRole('menuitem', { name: 'Open at folder...' }).click()
  await win!.fill('#path-launch-cwd', cwd)
  await win!.getByRole('button', { name: 'Open', exact: true }).click()
  const terminal = win!.locator('.terminal-view').last()
  await terminal.locator('.terminal-host').click()
  await win!.waitForTimeout(1500)

  await win!.keyboard.type(`echo ${rel}`)
  await win!.keyboard.press('Enter')

  await expect.poll(() => cursorRow(win!), { timeout: 15000 }).toBeGreaterThanOrEqual(2)

  const pos = await outputPos(win!)
  // Link, tab'ın cwd'sine göre çözülür; tık o ÇÖZÜLMÜŞ mutlak yolu açar.
  const opened = await hoverClickUntilOpen(win!, pos)
  console.log('OPENED_REL', opened)
  expect(opened).toBe(join(cwd, rel))
})

test('executable path is revealed instead of launched', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'termflow-clickable-executable-'))
  cleanup.push(cwd)
  const filePath = join(cwd, 'run.cmd')
  writeFileSync(filePath, '@echo off')

  await launch()
  await stubShell(app!)
  await win!.keyboard.type(`echo ${filePath}`)
  await win!.keyboard.press('Enter')
  await expect.poll(() => cursorRow(win!), { timeout: 15000 }).toBeGreaterThanOrEqual(2)

  const pos = await outputPos(win!)
  expect(await hoverClickUntilReveal(win!, pos)).toBe(filePath)
  expect((await tfLogs()).filter((log) => log.kind === 'open')).toHaveLength(0)

  await win!.mouse.click(pos.x, pos.y, { button: 'right' })
  await expect(win!.getByRole('menuitem', { name: 'Show in Folder', exact: true })).toBeVisible()
  await expect(win!.getByRole('menuitem', { name: 'Open File Location' })).toHaveCount(0)
})

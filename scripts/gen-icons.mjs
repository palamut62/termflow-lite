// Generates the app icon set from resources/icon.svg:
//  - PNG sizes for window / installer / web
//  - build/icon.ico (multi-size, used by electron-builder + the desktop shortcut)
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'resources', 'icon.svg'))

const pngDir = join(root, 'resources', 'icons')
const buildDir = join(root, 'build')
mkdirSync(pngDir, { recursive: true })
mkdirSync(buildDir, { recursive: true })

const sizes = [16, 24, 32, 48, 64, 128, 256, 512]

const pngPaths = {}
for (const s of sizes) {
  const out = join(pngDir, `icon-${s}.png`)
  await sharp(svg, { density: 384 }).resize(s, s).png().toFile(out)
  pngPaths[s] = out
  console.log('png', out)
}

// Main app png (used as BrowserWindow icon on Linux/dev)
writeFileSync(join(root, 'resources', 'icon.png'), readFileSync(pngPaths[512]))

// Multi-size .ico for Windows (shortcut, taskbar, installer)
const ico = await pngToIco([16, 24, 32, 48, 64, 128, 256].map((s) => pngPaths[s]))
writeFileSync(join(buildDir, 'icon.ico'), ico)
writeFileSync(join(root, 'resources', 'icon.ico'), ico)
console.log('ico', join(buildDir, 'icon.ico'))

const menuIcons = {
  claude: ['#d97757', '<g stroke="white" stroke-width="7" stroke-linecap="round"><path d="M32 9v46M9 32h46M16 16l32 32M48 16L16 48"/></g><circle cx="32" cy="32" r="7" fill="white"/>'],
  codex: ['#111827', '<g fill="none" stroke="white" stroke-width="6"><circle cx="32" cy="18" r="11"/><circle cx="44" cy="39" r="11"/><circle cx="20" cy="39" r="11"/></g>'],
  opencode: ['#111111', '<path d="M14 18h36v28H14z" fill="none" stroke="white" stroke-width="5"/><path d="m22 32 7-7m-7 7 7 7m7 2h8" stroke="#34d399" stroke-width="5" stroke-linecap="round"/>'],
  ollama: ['#f5f5f5', '<path d="M20 50V22l7-9 5 9 5-9 7 9v28z" fill="none" stroke="#111" stroke-width="5" stroke-linejoin="round"/><circle cx="27" cy="31" r="2.5"/><circle cx="37" cy="31" r="2.5"/>'],
  deepseek: ['#2563eb', '<path d="M10 37c10 1 15-13 28-10 7 2 10 8 16 7-4 13-17 20-30 16-8-2-13-7-14-13z" fill="white"/><path d="M38 27c3-7 9-9 14-8-2 6-6 10-14 8z" fill="#93c5fd"/><circle cx="22" cy="37" r="2" fill="#2563eb"/>'],
  openrouter: ['#6d5dfc', '<path d="M8 23h31l-7-7m7 7-7 7M56 41H25l7-7m-7 7 7 7" fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>']
}
const menuDir = join(root, 'resources', 'menu-icons')
mkdirSync(menuDir, { recursive: true })
for (const [name, [background, glyph]] of Object.entries(menuIcons)) {
  const source = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/>${glyph}</svg>`)
  const paths = []
  for (const size of [16, 24, 32, 48, 64]) {
    const out = join(menuDir, `${name}-${size}.png`)
    await sharp(source).resize(size, size).png().toFile(out)
    paths.push(out)
  }
  writeFileSync(join(menuDir, `${name}.ico`), await pngToIco(paths))
  paths.forEach((path) => rmSync(path, { force: true }))
}
console.log('done')

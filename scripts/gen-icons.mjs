// Generates the app icon set from resources/icon.svg:
//  - PNG sizes for window / installer / web
//  - build/icon.ico (multi-size, used by electron-builder + the desktop shortcut)
import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
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
console.log('done')

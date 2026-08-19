// Extracts the CHANGELOG section for a version so the GitHub release body and
// the shipped changelog can never drift apart.
//   node scripts/release-notes.mjs v1.4.2 > notes.md
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = (process.argv[2] ?? '').replace(/^v/, '')
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>')
  process.exit(1)
}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
// Split on the version headings so a section runs until the next one.
const section = changelog
  .split(/^## /m)
  .slice(1)
  .find((block) => block.split(/\s/)[0] === version)
if (!section) {
  console.error(`No CHANGELOG.md section found for ${version}`)
  process.exit(1)
}
const body = section.slice(section.indexOf('\n') + 1).trim()
if (!body) {
  console.error(`CHANGELOG.md section for ${version} is empty`)
  process.exit(1)
}

const owner = [
  '---',
  'Ürün sahibi: Umut Çelik (palamut62) · [X](https://x.com/palamut62) · [GitHub](https://github.com/palamut62)'
].join('\n')

process.stdout.write(`${body}\n\n${owner}\n`)

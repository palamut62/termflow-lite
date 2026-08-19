// Verifies that a published release is internally consistent: every file listed
// in latest.yml must exist as a release asset with a matching size and sha512.
//
// This is the guard for the failure that shipped in v1.4.2, where latest.yml
// came from a local build and the .exe came from the CI build, so the updater
// refused the download with "sha512 checksum mismatch".
//
//   node scripts/verify-release-assets.mjs v1.4.2
import { createHash } from 'crypto'

const tag = process.argv[2]
const repo = process.env.GITHUB_REPOSITORY ?? 'palamut62/termflow-lite'
if (!tag) {
  console.error('usage: node scripts/verify-release-assets.mjs <tag>')
  process.exit(1)
}

const base = `https://github.com/${repo}/releases/download/${tag}`

/** Minimal latest.yml reader: only the fields electron-updater relies on. */
function parseManifest(text) {
  const files = []
  let current = null
  for (const line of text.split(/\r?\n/)) {
    const url = /^\s*-\s*url:\s*(.+)$/.exec(line)
    if (url) {
      current = { url: url[1].trim() }
      files.push(current)
      continue
    }
    if (!current) continue
    const sha512 = /^\s+sha512:\s*(.+)$/.exec(line)
    if (sha512) current.sha512 = sha512[1].trim()
    const size = /^\s+size:\s*(\d+)$/.exec(line)
    if (size) current.size = Number(size[1])
  }
  return files
}

async function download(name) {
  const response = await fetch(`${base}/${name}`, { redirect: 'follow' })
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

const failures = []
for (const manifest of ['latest.yml', 'latest-linux.yml']) {
  let text
  try {
    text = (await download(manifest)).toString('utf8')
  } catch (error) {
    console.log(`- ${manifest}: not published, skipping (${error.message})`)
    continue
  }

  for (const file of parseManifest(text)) {
    const asset = await download(file.url)
    const sha512 = createHash('sha512').update(asset).digest('base64')
    if (sha512 !== file.sha512) {
      failures.push(`${file.url}: sha512 mismatch — ${manifest} expects ${file.sha512}, asset is ${sha512}`)
    } else if (file.size !== undefined && asset.length !== file.size) {
      failures.push(`${file.url}: size mismatch — ${manifest} expects ${file.size}, asset is ${asset.length}`)
    } else {
      console.log(`- ${manifest} -> ${file.url}: ok (${asset.length} bytes)`)
    }
  }
}

if (failures.length > 0) {
  console.error('\nRelease assets are inconsistent; the auto-updater would reject this release:')
  for (const failure of failures) console.error(`  ${failure}`)
  console.error('\nRe-run the Release workflow so every asset comes from a single build.')
  process.exit(1)
}

console.log('\nAll published assets match their update manifest.')

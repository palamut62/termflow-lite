// Tags the current package.json version and pushes it, which is the only thing
// needed to publish: the Release workflow builds and uploads every asset.
// See docs/releasing.md.
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const tag = `v${version}`

const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'inherit' })

const status = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
if (status) {
  console.error('Working tree is dirty — commit the version bump and CHANGELOG entry first.')
  process.exit(1)
}

const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8')
if (!changelog.includes(`## ${version}`)) {
  console.error(`CHANGELOG.md has no "## ${version}" section — the release notes are generated from it.`)
  process.exit(1)
}

git('tag', '-a', tag, '-m', `TermFlow Lite ${version}`)
git('push', 'origin', tag)
console.log(`\nPushed ${tag}. The Release workflow now builds and publishes every asset.`)

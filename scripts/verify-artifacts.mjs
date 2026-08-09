import { execFile } from 'node:child_process'
import { open, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Reports the Authenticode signature status of a file.
 * Unsigned artifacts only produce a warning: local/fork builds are intentionally unsigned.
 * A present-but-broken signature is a hard failure.
 */
async function verifyAuthenticodeSignature(filePath) {
  if (process.platform !== 'win32') {
    console.warn('Skipping Authenticode verification: not running on Windows.')
    return
  }

  // The path is handed to PowerShell through an environment variable instead of being
  // interpolated into the script text, so paths containing quotes, spaces or `;` can
  // never turn into extra commands.
  // The script itself is passed base64-encoded (-EncodedCommand) so no shell quoting
  // rules apply to it either.
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$sig = Get-AuthenticodeSignature -LiteralPath $env:TERMFLOW_SIGNATURE_TARGET',
    'Write-Output ("{0}|{1}" -f $sig.Status, $sig.SignerCertificate.Subject)'
  ].join('\n')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')

  let output
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true, env: { ...process.env, TERMFLOW_SIGNATURE_TARGET: filePath } }
    )
    output = stdout.trim()
  } catch (error) {
    console.warn(`Could not run Get-AuthenticodeSignature on ${filePath}: ${error.message}`)
    return
  }

  const [status, subject] = output.split('|')
  if (status === 'Valid') {
    console.log(`Authenticode signature is valid for ${filePath}${subject ? ` (${subject})` : ''}`)
    return
  }
  if (status === 'NotSigned') {
    console.warn(
      `WARNING: ${filePath} is not code-signed. Windows SmartScreen will warn users. See docs/code-signing.md.`
    )
    return
  }
  throw new Error(`${filePath} has an invalid Authenticode signature (status: ${status || 'unknown'})`)
}

const pkg = JSON.parse(await readFile(resolve('package.json'), 'utf-8'))
const base = `TermFlow-Lite-${pkg.version}-x64`
const artifacts = [
  { path: resolve('dist', `${base}.exe`), signature: Buffer.from('MZ') },
  { path: resolve('dist', `${base}.zip`), signature: Buffer.from('PK') }
]

for (const artifact of artifacts) {
  const info = await stat(artifact.path)
  if (info.size < 1024 * 1024) throw new Error(`${artifact.path} is unexpectedly small (${info.size} bytes)`)
  const handle = await open(artifact.path, 'r')
  const header = Buffer.alloc(2)
  await handle.read(header, 0, 2, 0)
  await handle.close()
  if (!header.equals(artifact.signature)) throw new Error(`${artifact.path} has an invalid signature`)
}

await verifyAuthenticodeSignature(resolve('dist', `${base}.exe`))

const blockmap = await stat(resolve('dist', `${base}.exe.blockmap`))
if (blockmap.size < 1024) throw new Error('Installer blockmap is unexpectedly small')
const updateMetadata = await readFile(resolve('dist', 'latest.yml'), 'utf-8')
if (!updateMetadata.includes(`version: ${pkg.version}`) || !updateMetadata.includes(`${base}.exe`) || !updateMetadata.includes('sha512:')) {
  throw new Error('latest.yml does not describe the current installer')
}

console.log('Windows installer, ZIP, blockmap, and updater metadata are valid.')

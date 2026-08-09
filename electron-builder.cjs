/**
 * electron-builder configuration.
 *
 * This used to be a static `electron-builder.yml`. It is a CommonJS module now so that
 * Windows code signing can be enabled *conditionally*: release builds sign the installer
 * with Azure Trusted Signing (or a traditional certificate file), while local developer
 * builds — and pull requests from forks, which never receive repository secrets — keep
 * producing unsigned artifacts instead of failing the build.
 *
 * See docs/code-signing.md for the required environment variables.
 */

const env = process.env

/** Returns the trimmed value of an env var, or undefined when unset/blank. */
function envValue(name) {
  const raw = env[name]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function allPresent(names) {
  return names.every((name) => envValue(name) !== undefined)
}

const AZURE_VARS = [
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
  'AZURE_PUBLISHER_NAME',
  'AZURE_CODE_SIGNING_NAME',
  'AZURE_CERT_PROFILE_NAME',
  'AZURE_ENDPOINT'
]
const CERT_VARS = ['CERTIFICATE_FILE', 'CERTIFICATE_PASSWORD']

/**
 * Builds the signing part of the `win` config.
 * Returns an empty object (= unsigned build) when no credentials are configured.
 */
function resolveWindowsSigning() {
  if (allPresent(AZURE_VARS)) {
    console.log('[electron-builder] Azure Trusted Signing credentials detected — installer will be signed.')
    return {
      azureSignOptions: {
        publisherName: envValue('AZURE_PUBLISHER_NAME'),
        endpoint: envValue('AZURE_ENDPOINT'),
        codeSigningAccountName: envValue('AZURE_CODE_SIGNING_NAME'),
        certificateProfileName: envValue('AZURE_CERT_PROFILE_NAME')
      }
    }
  }

  if (allPresent(CERT_VARS)) {
    console.log('[electron-builder] Certificate file detected — installer will be signed with signtool.')
    const publisherName = envValue('CERTIFICATE_PUBLISHER_NAME')
    return {
      signtoolOptions: {
        certificateFile: envValue('CERTIFICATE_FILE'),
        certificatePassword: envValue('CERTIFICATE_PASSWORD'),
        signingHashAlgorithms: ['sha256'],
        ...(publisherName ? { publisherName } : {})
      }
    }
  }

  const partialAzure = AZURE_VARS.filter((name) => envValue(name) === undefined)
  if (partialAzure.length !== AZURE_VARS.length) {
    console.warn(
      `[electron-builder] WARNING: incomplete Azure Trusted Signing configuration, missing: ${partialAzure.join(', ')}`
    )
  }
  console.warn(
    '[electron-builder] WARNING: no code signing credentials found — producing an UNSIGNED build. ' +
      'Windows SmartScreen will warn users about this installer. See docs/code-signing.md.'
  )
  return {}
}

/**
 * PRD §90 artifact names. The Linux TargetConfiguration schema does not allow a
 * per-target `artifactName`, so when exactly one linux target is requested via
 * CLI (see the `dist:linux:*` scripts) we return the PRD name for that target.
 * Any other invocation lets electron-builder use its default naming.
 * A plain `TermFlow-Lite` literal (not `${productName}`) is used because the
 * productName contains a space, which electron-builder keeps in file names.
 */
function resolveLinuxArtifactName() {
  const argv = process.argv
  const linuxIndex = argv.indexOf('--linux')
  if (linuxIndex === -1) return undefined
  // Only the argument immediately after `--linux` can be a target name;
  // everything later belongs to other flags (e.g. `--publish never`).
  const next = argv[linuxIndex + 1]
  if (!next || next.startsWith('--')) return undefined
  if (next === 'AppImage') return 'TermFlow-Lite-${version}-x86_64.${ext}'
  if (next === 'deb') return 'TermFlow-Lite-${version}-amd64.${ext}'
  return undefined
}

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.palamut62.termflowlite',
  productName: 'TermFlow Lite',
  publish: {
    provider: 'github',
    owner: 'palamut62',
    repo: 'termflow-lite',
    releaseType: 'release'
  },
  directories: {
    output: 'dist',
    buildResources: 'resources'
  },
  files: ['out/**', '!**/*.map'],
  extraResources: [
    {
      from: 'resources',
      to: 'resources',
      filter: ['icon.ico', 'icon.png', 'menu-icons/*.ico']
    }
  ],
  asarUnpack: ['**/node_modules/@lydell/node-pty*/**'],
  win: {
    icon: 'resources/icon.ico',
    target: ['nsis', 'zip'],
    artifactName: 'TermFlow-Lite-${version}-${arch}.${ext}',
    ...resolveWindowsSigning()
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: 'resources/icon.ico',
    uninstallerIcon: 'resources/icon.ico',
    installerHeaderIcon: 'resources/icon.ico',
    include: 'build/installer.nsh'
  },
  linux: {
    icon: 'resources/icon.png',
    target: ['AppImage', 'deb'],
    category: 'Development',
    maintainer: 'Umut Çelik (palamut62)',
    ...(resolveLinuxArtifactName() ? { artifactName: resolveLinuxArtifactName() } : {})
  }
}

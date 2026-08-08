# Windows Code Signing

TermFlow release installers are signed so Windows SmartScreen does not warn users when
they run `TermFlow-<version>-x64.exe`.

Signing is **optional at build time**: `electron-builder.cjs` only enables it when the
required environment variables are present. Local developer builds (`npm run package`)
and pull requests from forks — which never receive repository secrets — keep producing
unsigned artifacts, with a clear warning in the build log:

```
[electron-builder] WARNING: no code signing credentials found — producing an UNSIGNED build.
```

No credential ever lives in the repository. Everything below is supplied through
environment variables / GitHub Actions secrets.

## Option A — Azure Trusted Signing (recommended)

Azure Trusted Signing is a Microsoft-hosted signing service. It costs a monthly
subscription fee instead of a several-hundred-dollar EV token, and certificates issued
through it inherit Microsoft's reputation, so SmartScreen trusts new releases quickly.

### 1. Create the Azure resources

1. Sign in to the [Azure portal](https://portal.azure.com) with a subscription that has a
   payment method attached.
2. Register the `Microsoft.CodeSigning` resource provider
   (*Subscriptions → your subscription → Resource providers*).
3. Create a **Trusted Signing Account** (search the Marketplace for "Trusted Signing
   Account"). Pick a region — the account region determines the signing **endpoint**.
4. Complete **identity validation** for the account:
   - *Public* identity validation requires a legal business entity (D-U-N-S number or
     equivalent documents) and takes 1–7 business days.
   - *Private* identity validation is for internal distribution only and does not remove
     SmartScreen warnings for the public.
5. Once identity validation succeeds, create a **Certificate Profile** of type
   `Public Trust`. Note its name.

### 2. Create a service principal for CI

1. In *Microsoft Entra ID → App registrations*, register a new application.
2. Under *Certificates & secrets*, create a **client secret** and copy its value
   immediately (it is only shown once).
3. On the Trusted Signing Account, open *Access control (IAM)* and assign the
   **Trusted Signing Certificate Profile Signer** role to that application.

### 3. Environment variables

| Variable | Where it comes from |
| --- | --- |
| `AZURE_TENANT_ID` | Entra ID → Overview → *Tenant ID* |
| `AZURE_CLIENT_ID` | App registration → Overview → *Application (client) ID* |
| `AZURE_CLIENT_SECRET` | App registration → Certificates & secrets → the secret **value** |
| `AZURE_ENDPOINT` | Trusted Signing Account → Overview → *Account URI*, e.g. `https://weu.codesigning.azure.net` |
| `AZURE_CODE_SIGNING_NAME` | The Trusted Signing Account name |
| `AZURE_CERT_PROFILE_NAME` | The Certificate Profile name |
| `AZURE_PUBLISHER_NAME` | The certificate subject exactly as issued, e.g. `CN=Contoso Ltd, O=Contoso Ltd, L=…` — used by electron-updater to verify update signatures |

`AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` are consumed directly by
the Azure `EnvironmentCredential` used by electron-builder; the remaining four are mapped
onto `win.azureSignOptions` in `electron-builder.cjs`.

**All seven must be set**, otherwise the build falls back to unsigned and logs which
variables are missing.

### 4. GitHub Actions setup

Add each variable as a repository secret
(*Settings → Secrets and variables → Actions → New repository secret*) using exactly the
names above. `.github/workflows/release.yml` passes them to the packaging step on tag
pushes (`v*`).

Local one-off signed build (PowerShell):

```powershell
$env:AZURE_TENANT_ID = '...'
$env:AZURE_CLIENT_ID = '...'
$env:AZURE_CLIENT_SECRET = '...'
$env:AZURE_ENDPOINT = 'https://weu.codesigning.azure.net'
$env:AZURE_CODE_SIGNING_NAME = '...'
$env:AZURE_CERT_PROFILE_NAME = '...'
$env:AZURE_PUBLISHER_NAME = 'CN=...'
npm run package:verify
```

Signing on Windows additionally requires the .NET 8 runtime and the
`Microsoft.Windows.SDK.BuildTools` / `Trusted Signing` client, which electron-builder
downloads automatically on first use.

## Option B — Traditional certificate file (OV/EV `.pfx`)

If you already own a code signing certificate, set these instead:

| Variable | Meaning |
| --- | --- |
| `CERTIFICATE_FILE` | Path to the `.pfx`/`.p12` file on the build machine |
| `CERTIFICATE_PASSWORD` | Password protecting that file |
| `CERTIFICATE_PUBLISHER_NAME` | Optional; certificate subject name for update verification |

`electron-builder.cjs` maps these onto `win.signtoolOptions`. Azure Trusted Signing takes
precedence when both are configured.

In CI, store the `.pfx` as a base64 secret and materialise it in a temp file before
packaging — never commit the certificate. Modern EV certificates are usually bound to a
hardware token or an HSM, which cannot be used from hosted GitHub runners; use Azure
Trusted Signing or a self-hosted runner in that case.

## Verifying a signature

`npm run package:verify` runs `scripts/verify-artifacts.mjs`, which calls
`Get-AuthenticodeSignature` on the produced installer:

- `Valid` → the signature and certificate chain check out; the subject is printed.
- `NotSigned` → a warning is printed, the build still succeeds (expected for local/fork builds).
- Anything else (`HashMismatch`, `NotTrusted`, …) → the verification step fails.

Manual check:

```powershell
Get-AuthenticodeSignature .\dist\TermFlow-0.4.1-x64.exe | Format-List Status, StatusMessage, SignerCertificate
```

Or via the Explorer UI: right-click the installer → *Properties* → *Digital Signatures*.

## Troubleshooting

- **Build says "producing an UNSIGNED build" in CI** — a secret is missing or empty; the
  log lists the missing Azure variables.
- **`AuthenticationFailedException` / 401 from the signing endpoint** — the client secret
  expired, or the service principal is missing the *Trusted Signing Certificate Profile
  Signer* role.
- **Signature is `Valid` but SmartScreen still warns** — reputation builds up over
  downloads; this fades after a release has circulated. Public identity validation is
  required for it to happen at all.
- **`electron-updater` rejects an update** — `AZURE_PUBLISHER_NAME` must match the
  certificate subject of the *installed* build; changing certificates mid-stream can
  break in-app updates for existing users.

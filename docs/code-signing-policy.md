# Code signing policy

TermFlow Lite's release pipeline is configured for automated Windows Authenticode signing
through SignPath.io, with the certificate supplied by SignPath Foundation after project
approval. Signed releases are built from the public
source repository at <https://github.com/palamut62/termflow-lite> on GitHub-hosted
runners. Release artifacts are submitted to SignPath directly from GitHub Actions.

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

## Project roles

- Committer and reviewer: [Umut Çelik](https://github.com/palamut62)
- Release approver: [Umut Çelik](https://github.com/palamut62)

Changes from contributors who do not have direct commit access must be reviewed before
they are merged. Production signing requests originate from version tags whose commits
are verified to belong to `main` and require approval under the SignPath release-signing
policy.

## Build and signing controls

- Source repository: <https://github.com/palamut62/termflow-lite>
- Trusted build system: GitHub Actions on GitHub-hosted Windows runners
- Release source: version tags matching `v*` on `main`
- Signing input: Windows installer and portable archive produced by the repository's
  version-controlled Electron Builder configuration
- Signing credentials: stored only in GitHub Actions secrets and SignPath; never in the
  source repository or release artifacts
- Verification: the release workflow rejects an installer unless Windows reports a
  valid Authenticode signature

## Privacy policy

TermFlow Lite does not collect analytics, telemetry, personal data, terminal contents,
commands, credentials, or file contents. The application does not transfer information
to networked systems unless the user explicitly runs a command, coding agent, provider,
or other tool that performs network access. Those external tools and services are
governed by their own privacy policies.

Settings, command history, and local session metadata remain on the user's computer.
Secrets for provider profiles are read from user-configured operating-system environment
variables and are not stored by TermFlow Lite.

## Reporting concerns

Report suspected release tampering or signing-policy violations through the repository's
[GitHub issue tracker](https://github.com/palamut62/termflow-lite/issues).

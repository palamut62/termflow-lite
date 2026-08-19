# Releasing

**CI is the only publisher.** Never upload a locally built installer to a GitHub
release, and never run `gh release create` with local artifacts.

## Why

`latest.yml` is the manifest electron-updater reads. It contains the sha512 of
the installer it was generated alongside. Two builds of the same commit are not
byte-identical (signing timestamps, build paths), so if `latest.yml` comes from
one build and the `.exe` from another, the updater downloads the installer,
hashes it, sees a different digest and refuses to install:

```
sha512 checksum mismatch, expected n3gYlDAb…, got mC1OLoeK…
```

That is exactly what shipped in v1.4.2: a local `latest.yml` next to the CI
installer. The fix was re-running the Release workflow so every asset came from
a single build.

## How to cut a release

1. Update `CHANGELOG.md` with a `## <version> - <date>` section. The GitHub
   release body is generated from it, so write it for users.
2. Bump the version: `npm version <version> --no-git-tag-version`
3. Verify locally: `npm run verify`
4. Commit, then tag and push:

```bash
npm run release:tag
```

The `Release` workflow then builds Windows and Linux artifacts, creates the
release with notes from `CHANGELOG.md`, and runs `verify-release` — which
downloads every published asset and checks it against `latest.yml` /
`latest-linux.yml`. If that job is red, the release is broken for the
auto-updater: fix it and re-run the workflow rather than patching assets by hand.

## Local packaging

`npm run package` is for testing the installer on your own machine. Those
artifacts stay in `dist/` and never go to GitHub.

## Checking a published release

```bash
node scripts/verify-release-assets.mjs v1.4.2
```

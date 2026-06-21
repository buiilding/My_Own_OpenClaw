---
summary: "Release Guide"
read_when:
  - When preparing a release.
---

# Release Guide

This guide describes a safe, repeatable release process for WindieOS.

## Principles

- Prefer small, scoped releases with clear changelogs.
- Run tests before tagging or publishing artifacts.
- Do not publish or change version numbers without explicit approval.

## Pre-release Checklist

- Ensure you are on `main` and the working tree is clean.
- Pull the latest changes from origin.
- Confirm you have the required credentials and environment variables set.
- Decide the release version (e.g., `0.7.0`).

## Update Version Numbers (if applicable)

- Frontend UI version: update `frontend/package.json` `version`.
- If you track versions elsewhere (docs or build metadata), update those files too.

## Test and Build

From the repo root:

- Backend tests: `<windie> test backend`
- Local-runtime Python tests: `<windie> test local-runtime`
- Frontend tests: `<windie> test frontend`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build: `<windie> build frontend`

If you changed backend runtime behavior, also run the backend with:

- `<windie> start backend`

## Release Steps

- Commit version bumps and changelog updates.
- Tag the release (example): `git tag v0.7.0`.
- Push commits and tags: `git push origin main --tags`.

## Desktop Artifact Workflow

Use GitHub Actions workflow:

- `.github/workflows/desktop-release.yml`

Behavior:

- Builds bundled-python desktop artifacts on:
  - Linux (`AppImage`, `deb`, `rpm`)
  - Windows (`nsis .exe`)
  - macOS (`dmg`, `zip`)
- Runs packaged-artifact smoke checks in CI only for Linux and Windows before upload.
- macOS publish runs must have signing + notarization available; the workflow now refuses to publish unsigned mac artifacts.
- macOS Gatekeeper and LaunchServices downloaded-app validation is manual-only and is intentionally not run from GitHub Actions because that interactive installed-app path can stall hosted runners.
- On tag pushes (`v*`) or manual dispatch with publish enabled, creates/updates the GitHub release first and then uploads each platform's packaged files directly from the runner to that release.
- This direct-release path avoids GitHub Actions artifact-storage quota blocking release publication; publish runs do not rely on workflow-run artifact retention.

Manual dispatch inputs:

- `run_signing`: `true`/`false`
- `publish_release`: `true`/`false`
- `release_tag`: required when manual `publish_release=true`

Local macOS packaged-user test helper:

- `<windie> reinstall mac`
- This helper is for local reinstall/testing only, not release publishing.
- It removes old installed WindieOS copies, clears app support/cache/WebKit/saved-state data, resets all known TCC grants for previously installed WindieOS app/helper bundle IDs before reinstall, strips Apple notarization and Developer ID signing credentials from the local build environment, rebuilds the unpacked `release/mac-arm64/WindieOS.app` bundle, reuses the existing packaged `python-runtime` when `requirements.runtime.txt` and the runtime build script are unchanged, reinstalls into `/Applications`, applies one consistent ad-hoc signature to the installed app bundle, and launches the installed app through LaunchServices while tailing packaged-app logs into the terminal and `~/windieos-packaged-run.log`.
- Skipping notarization and local Developer ID signing here is intentional so local reinstall loops stay fast; signed/notarized DMG validation remains part of the real release path, not this helper.
- Use `scripts/ci/smoke-macos-packages.sh` locally when you specifically need the downloaded-app Gatekeeper path (`WINDIE_VALIDATE_DOWNLOADED_APP=true`); do not wire that path back into GitHub-hosted release runners.
- The smoke helper now validates both the app mounted in the DMG and the copied `/Applications` app so hardened-runtime startup regressions are caught before release, even when the failure only reproduces from the mounted installer copy.

Required secrets when `run_signing=true`:

- Windows signing:
  - `WIN_CSC_LINK`
  - `WIN_CSC_KEY_PASSWORD`
- macOS signing + notarization:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`

The release workflow intentionally keeps macOS and Windows certificate secrets
separate. The repo-level `CSC_LINK` and `CSC_KEY_PASSWORD` secrets are reserved
for the macOS `Developer ID Application` identity, while Windows packaging only
enables signing when `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` are present.

### macOS Developer ID setup notes

The macOS release path expects a real `Developer ID Application` signing identity,
not just a downloaded certificate file.

For a first-time Apple Developer setup:

- Create a `Developer ID Application` certificate in Apple Developer Certificates,
  Identifiers & Profiles.
- Use the `G2 Sub-CA` option when Apple prompts for the Developer ID intermediary.
- Generate the CSR locally from Keychain Access:
  - `Keychain Access` -> `Certificate Assistant` -> `Request a Certificate From a Certificate Authority...`
- Install the issued certificate into the `login` keychain.
- Confirm the certificate appears under `login` -> `My Certificates` with its private key attached.
- Export that identity as a `.p12`; use the exported file path for `CSC_LINK` and the export password for `CSC_KEY_PASSWORD`.
- If the certificate initially shows as untrusted, install Apple’s `Developer ID - G2` intermediate certificate before retrying signing.

Before running a signed macOS package build, verify the machine sees a valid
codesigning identity:

```bash
security find-identity -v -p codesigning
```

The expected output must include the Developer ID Application identity for the
current Team ID. If this command reports `0 valid identities found`, Electron
packaging may silently fall back to ad-hoc signing, which will cause notarization
to fail with errors such as:

- `The binary is not signed with a valid Developer ID certificate`
- `The signature does not include a secure timestamp`

When the identity is valid, a signed bundle should show the Developer ID
authority chain and timestamp:

```bash
codesign -dv --verbose=4 frontend/release/mac-arm64/WindieOS.app 2>&1 | sed -n '1,40p'
```

Expected signals:

- `Authority=Developer ID Application: ...`
- `Authority=Developer ID Certification Authority`
- `Authority=Apple Root CA`
- `Timestamp=...`
- `TeamIdentifier=...`

## Post-release Checks

- Verify tags exist in the remote.
- Confirm a clean checkout can run tests and start the app.

## Notes

- If release artifacts are published (binaries, installers), document exact commands and storage locations here.
- If you add a CI release workflow, link it in this doc.

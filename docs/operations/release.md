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

- Backend tests: `./scripts/test-backend`
- Sidecar tests: `./scripts/test-sidecar`
- Frontend tests: `cd frontend && npm run test:ci`
- Frontend lint: `cd frontend && npm run lint`
- Frontend build: `cd frontend && npm run build`

If you changed backend runtime behavior, also run the backend with:

- `./scripts/run-backend`

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
- Runs install/launch smoke checks per platform before upload.
- macOS publish runs must have signing + notarization available; the workflow now refuses to publish unsigned mac artifacts.
- macOS smoke for publish runs validates the downloaded-app path by applying quarantine to the installed `.app`, running `spctl` Gatekeeper assessment, and verifying LaunchServices can open the bundle.
- On tag pushes (`v*`) or manual dispatch with publish enabled, creates/updates the GitHub release first and then uploads each platform's packaged files directly from the runner to that release.
- This direct-release path avoids GitHub Actions artifact-storage quota blocking release publication; publish runs do not rely on workflow-run artifact retention.

Manual dispatch inputs:

- `run_signing`: `true`/`false`
- `publish_release`: `true`/`false`
- `release_tag`: required when manual `publish_release=true`

Local macOS packaged-user test helper:

- `./scripts/reinstall-windieos-macos.sh`
- Rebuilds the local macOS DMG, removes old installed WindieOS copies, clears app support/cache/WebKit/saved-state data, resets TCC grants for `com.windieos.desktop` and its Electron helper bundle IDs, reinstalls into `/Applications`, and launches the installed app through LaunchServices while tailing packaged-app logs into the terminal and `~/windieos-packaged-run.log`.

Required secrets when `run_signing=true`:

- Windows signing:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
- macOS signing + notarization:
  - `CSC_LINK`
  - `CSC_KEY_PASSWORD`
  - `APPLE_ID`
  - `APPLE_APP_SPECIFIC_PASSWORD`
  - `APPLE_TEAM_ID`

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

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

## Post-release Checks

- Verify tags exist in the remote.
- Confirm a clean checkout can run tests and start the app.

## Notes

- If release artifacts are published (binaries, installers), document exact commands and storage locations here.
- If you add a CI release workflow, link it in this doc.

---
summary: "Command matrix for WindieOS repo scripts, frontend package scripts, backend module launchers, docs tooling, commit helper, and Cloudflare helpers."
read_when:
  - When choosing the correct WindieOS command for local development, docs work, tests, packaging, commits, or hosted tunnel setup.
  - When changing scripts or package.json command behavior.
title: "Command Matrix"
---

# Command Matrix

WindieOS command-line entrypoints are repo scripts and frontend package scripts. A first-class user CLI is planned separately; do not document repo scripts as a shipped user CLI.

## Repo-Root Commands

Run from the repo root unless noted.

| Command | Owner | Purpose |
| --- | --- | --- |
| `./scripts/python-in-env <backend|frontend|sidecar> <cmd...>` | `scripts/python-in-env` | Runs commands in `jarvis` for backend or `frontend_jarvis` for frontend/sidecar when conda is available; otherwise falls back to current shell env. |
| `./scripts/run-backend` | `scripts/run-backend` | Runs `python -m backend.src.main` through the backend env launcher. |
| `./scripts/run-frontend-dev` | `scripts/run-frontend-dev` | Runs `npm --prefix frontend run dev` through the frontend env launcher. |
| `./scripts/run-frontend-electron` | `scripts/run-frontend-electron` | Runs `npm --prefix frontend run electron:dev` through the frontend env launcher. |
| `./scripts/test-backend [pytest args...]` | `scripts/test-backend` | Runs backend pytest under `tests/backend`. |
| `./scripts/test-sidecar [pytest args...]` | `scripts/test-sidecar` | Runs sidecar pytest under `tests/sidecar`. |
| `./scripts/test` | `scripts/test` | Runs backend tests, sidecar tests, and frontend `test:ci` when `frontend/node_modules` exists. |
| `./scripts/build-sidecar-runtime` | `scripts/build-sidecar-runtime` | Builds the bundled Python sidecar runtime used by packaged app builds. |
| `./scripts/committer "<subject>" -- <paths...>` | `scripts/committer` | Stages only listed paths and commits them. Supports repeated `--body` and `--no-verify`. |
| `./bin/docs-list` | generated binary when present | Lists docs front matter and `read_when` hints. |
| `node scripts/docs-list.js` | `scripts/docs-list.js` | Fallback docs-list implementation. |

## Frontend Package Scripts

Run from `frontend/`.

The `frontend/package.json` package is private because it is the Electron
desktop app bootstrap, not the reusable npm SDK surface. Publishable JavaScript
client APIs live in `packages/windie-sdk-js` as `@windie/sdk`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite renderer dev server. |
| `npm run electron:dev` | Electron development app launcher. |
| `npm run electron` | Electron customer app launcher. |
| `npm run electron:no-summarizer` | Electron launcher with summarizer disabled. |
| `npm run build` | Vite production build. |
| `npm run typecheck` | TypeScript no-emit check. |
| `npm run lint` | ESLint strict lint. |
| `npm run lint:audit` | React compiler and deprecation audit. |
| `npm run audit:jscpd` | Duplication audit writing under `.audit/plan1`. |
| `npm run audit:knip` | Dead-file/dependency/export audit. |
| `npm run test` | Jest test suite. |
| `npm run test:ci` | Jest in-band CI mode. |
| `npm run test:shell` | Manual shell-tool smoke harness. |
| `npm run build:sidecar-runtime` | Invokes `../scripts/build-sidecar-runtime`. |
| `npm run package` | Build sidecar runtime, build frontend, and package Electron app. |
| `npm run package:mac` | Package macOS DMG/ZIP. |
| `npm run package:win` | Package Windows NSIS installer. |
| `npm run package:linux` | Package Linux AppImage/DEB/RPM. |

## Cloudflare Helpers

| Command | Purpose |
| --- | --- |
| `scripts/cloudflared/install-cloudflared-user` | Install `cloudflared` into a user-local bin directory. |
| `scripts/cloudflared/install-backend-user-service` | Install a user-level backend service. |
| `scripts/cloudflared/setup-windieos-tunnel` | Create/configure the Cloudflare Tunnel to the backend origin. |
| `scripts/cloudflared/bootstrap-windieos-host` | Run the install/service/tunnel setup sequence. |

Read [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md) before running or changing these scripts.

## Related Docs

- [Validation Commands](validation_commands.md)
- [Packaging and Release Commands](packaging_and_release_commands.md)
- [Commands and Scripts Hub](README.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)

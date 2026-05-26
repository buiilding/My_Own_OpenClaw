---
summary: "Command and script hub for current WindieOS developer commands, package scripts, tests, docs tooling, cloudflared helpers, and planned CLI work."
read_when:
  - When looking for WindieOS command-line entrypoints.
  - When changing scripts, package commands, docs tooling, or future CLI behavior.
title: "Commands and Scripts"
---

# Commands and Scripts

WindieOS does not yet ship a first-class user CLI. Current command-line entrypoints are repo scripts, frontend package scripts, backend module commands, and planned CLI docs.

## Repo Scripts

| Command | Purpose |
| --- | --- |
| `./scripts/python-in-env <backend|frontend|sidecar> <cmd...>` | Run Python commands in the expected conda env when available. |
| `./scripts/run-backend` | Start the backend dev server. |
| `./scripts/run-frontend-dev` | Start Vite dev server. |
| `./scripts/run-frontend-electron` | Start Electron dev app. |
| `./scripts/test-backend` | Run backend tests. |
| `./scripts/test-sidecar` | Run sidecar tests. |
| `./scripts/test` | Run broader test wrapper. |
| `./scripts/build-sidecar-runtime` | Build bundled Python sidecar runtime for packaging. |
| `./scripts/committer` | Stage listed files and create a scoped commit. Requires a body describing the issue, fix, previous behavior, and behavior after the fix. |
| `./bin/docs-list` or `node scripts/docs-list.js` | List docs with front matter and read hints. |

## Frontend Package Scripts

Run from `frontend/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite renderer development server. |
| `npm run electron:dev` | Electron development app. |
| `npm run electron` | Electron customer app. |
| `npm run build` | Vite build. |
| `npm run package` | Build sidecar runtime, frontend, and package Electron app. |
| `npm run package:mac` | Package macOS DMG/ZIP. |
| `npm run package:win` | Package Windows NSIS installer. |
| `npm run package:linux` | Package Linux AppImage/DEB/RPM. |
| `npm run test`, `npm run test:ci` | Jest tests. |
| `npm run lint` | Frontend ESLint. |

## Cloudflared Helpers

Cloudflared setup helpers live under `scripts/cloudflared/`:

- `bootstrap-windieos-host`
- `install-backend-user-service`
- `install-cloudflared-user`
- `setup-windieos-tunnel`

Read [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md) before changing these.

## Planned CLI

WindieOS has a plan for a first-class CLI, but implementation is not the same as these repo scripts. See [WindieOS CLI OS Control Plan](../planning/windieos_cli_os_control_plan.md).

## Deep Command Docs

- [Command Matrix](command_matrix.md) maps repo-root scripts, frontend package scripts, docs tooling, commit helper, and Cloudflare helpers.
- [Validation Commands](validation_commands.md) maps tests, lint, typecheck, docs checks, and focused validation commands by changed boundary.
- [Packaging and Release Commands](packaging_and_release_commands.md) maps sidecar runtime builds, Electron package scripts, smoke helpers, local reinstall helpers, and release guardrails.
